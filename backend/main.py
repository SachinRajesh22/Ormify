from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from groq import Groq, RateLimitError as GroqRateLimitError
import chromadb
import fitz  # PyMuPDF
import uuid
import os
import logging
from datetime import datetime, timezone
from typing import Optional
import json
import threading
from apscheduler.schedulers.background import BackgroundScheduler

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ormify")

app = FastAPI()
scheduler = BackgroundScheduler(timezone="UTC")

# ── Email config ──────────────────────────────────────────────
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")

def _send_email(to: str, subject: str, html: str):
    if not SMTP_USER or not SMTP_PASS:
        raise RuntimeError("SMTP credentials not configured")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = SMTP_USER
    msg["To"]      = to
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_PASS)
        s.sendmail(SMTP_USER, to, msg.as_string())

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── clients ──────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
_MODEL = "llama-3.3-70b-versatile"

# ── Groq key pool ─────────────────────────────────────────
# Support a comma-separated GROQ_API_KEYS env var (multi-key pool) or fall back
# to the single GROQ_API_KEY.  All keys are tried round-robin; on rate limit
# the next key is used automatically so the combined daily quota is shared.
_raw_keys = os.environ.get("GROQ_API_KEYS", "")
_GROQ_KEYS: list[str] = [k.strip() for k in _raw_keys.split(",") if k.strip()]
if not _GROQ_KEYS:
    single = os.environ.get("GROQ_API_KEY", "")
    if single:
        _GROQ_KEYS = [single]
if not _GROQ_KEYS:
    raise RuntimeError("Set GROQ_API_KEYS (comma-separated) or GROQ_API_KEY in .env")

_key_index = 0
_key_lock  = threading.Lock()


# ── AI usage limits ───────────────────────────────────────
FREE_DAILY_LIMIT = 20  # AI calls per day for free users

def _get_user_id_for_topic(topic_id: str) -> str | None:
    try:
        t = supabase.table("topics").select("session_id").eq("id", topic_id).maybe_single().execute().data
        if not t:
            return None
        s = supabase.table("sessions").select("user_id").eq("id", t["session_id"]).maybe_single().execute().data
        return s["user_id"] if s else None
    except Exception:
        return None

def _get_user_id_for_session(session_id: str) -> str | None:
    try:
        s = supabase.table("sessions").select("user_id").eq("id", session_id).maybe_single().execute().data
        return s["user_id"] if s else None
    except Exception:
        return None

def _check_ai_usage(user_id: str):
    """Raises HTTP 402 if user has reached their daily AI call limit.
    NOTE: Premium bypass is temporarily disabled until all Groq API keys are active.
    """
    from datetime import date
    today = date.today().isoformat()
    try:
        prefs = supabase.table("user_preferences").select("*").eq("user_id", user_id).maybe_single().execute().data
        is_premium = bool(prefs and prefs.get("is_premium"))
        calls_today = (prefs.get("daily_ai_calls", 0) if prefs and prefs.get("ai_calls_date") == today else 0) if prefs else 0

        if not is_premium and calls_today >= FREE_DAILY_LIMIT:
            raise HTTPException(402, f"You've used all {FREE_DAILY_LIMIT} free AI calls for today. Upgrade to Ormify Premium for unlimited access.")

        if prefs:
            supabase.table("user_preferences").update({
                "daily_ai_calls": calls_today + 1,
                "ai_calls_date":  today,
            }).eq("user_id", user_id).execute()
        else:
            supabase.table("user_preferences").insert({
                "user_id":             user_id,
                "daily_ai_calls":      1,
                "ai_calls_date":       today,
                "is_premium":          False,
                "deadline_reminders":  False,
                "daily_reminder":      False,
                "streak_alerts":       False,
            }).execute()
    except HTTPException:
        raise
    except Exception:
        pass  # don't block AI features if usage tracking fails


def _groq_keys_starting_here() -> list[str]:
    """Return all keys in round-robin order starting from the next slot."""
    global _key_index
    with _key_lock:
        start = _key_index % len(_GROQ_KEYS)
        _key_index += 1
    return _GROQ_KEYS[start:] + _GROQ_KEYS[:start]


class _AIUnavailable(Exception):
    """Raised when all Groq keys fail (rate limit, API error, or network)."""


def _generate(prompt: str, system: str | None = None) -> str:
    msgs = ([{"role": "system", "content": system}] if system else []) + \
           [{"role": "user", "content": prompt}]
    last_err: Exception = _AIUnavailable("no keys configured")
    for key in _groq_keys_starting_here():
        try:
            return Groq(api_key=key).chat.completions.create(model=_MODEL, messages=msgs).choices[0].message.content
        except Exception as e:
            last_err = e
    raise _AIUnavailable(str(last_err))


def _generate_json(prompt: str) -> str:
    msgs = [{"role": "user", "content": prompt}]
    last_err: Exception = _AIUnavailable("no keys configured")
    for key in _groq_keys_starting_here():
        try:
            return Groq(api_key=key).chat.completions.create(
                model=_MODEL, messages=msgs,
                response_format={"type": "json_object"},
            ).choices[0].message.content
        except Exception as e:
            last_err = e
    raise _AIUnavailable(str(last_err))


def _chat(history: list, system: str | None = None) -> str:
    msgs = ([{"role": "system", "content": system}] + history) if system else history
    last_err: Exception = _AIUnavailable("no keys configured")
    for key in _groq_keys_starting_here():
        try:
            return Groq(api_key=key).chat.completions.create(model=_MODEL, messages=msgs).choices[0].message.content
        except Exception as e:
            last_err = e
    raise _AIUnavailable(str(last_err))

# chroma — persists to disk
chroma_client = chromadb.PersistentClient(path="./chroma_store")


# ── helpers ───────────────────────────────────────────────

def get_or_create_collection(session_id: str):
    """One Chroma collection per session."""
    return chroma_client.get_or_create_collection(
        name=f"session_{session_id}",
    )


def retrieve_chunks(session_id: str, query: str, n: int = 4) -> list[str]:
    try:
        col = get_or_create_collection(session_id)
        count = col.count()
        if count == 0:
            return []
        results = col.query(
            query_texts=[query],
            n_results=min(n, count),
        )
        return results["documents"][0] if results["documents"] else []
    except Exception:
        return []


def compute_pace_ratio(session_id: str) -> float:
    logs = supabase.table("pace_logs")\
        .select("pace_ratio")\
        .eq("session_id", session_id)\
        .execute().data
    if not logs:
        return 1.0
    ratios = [l["pace_ratio"] for l in logs if l["pace_ratio"]]
    return sum(ratios) / len(ratios) if ratios else 1.0


def hours_until_deadline(deadline_str: str) -> float:
    deadline = datetime.fromisoformat(deadline_str.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    return max((deadline - now).total_seconds() / 3600, 0)


def remaining_projected_hours(session_id: str, deadline_str: str) -> dict:
    pace = compute_pace_ratio(session_id)
    pending = supabase.table("topics")\
        .select("estimated_hours")\
        .eq("session_id", session_id)\
        .in_("status", ["pending", "in_progress"])\
        .execute().data
    remaining_est = sum((t["estimated_hours"] or 1) for t in pending)
    projected = remaining_est * pace
    hours_left = hours_until_deadline(deadline_str)
    if projected <= hours_left:
        track = "green"
    elif projected <= hours_left * 1.25:
        track = "amber"
    else:
        track = "red"

    projection_string = (
        f"At your current pace (×{round(pace,2)}), "
        f"remaining topics will take ~{round(projected,1)}h "
        f"but you only have {round(hours_left,1)}h left."
        if projected > hours_left else
        f"You're on track. ~{round(projected,1)}h of work, "
        f"{round(hours_left,1)}h remaining."
    )

    return {
        "pace_ratio_avg": round(pace, 2),
        "remaining_estimated_hours": round(remaining_est, 2),
        "projected_hours_needed": round(projected, 2),
        "hours_until_deadline": round(hours_left, 2),
        "on_track": track,
        "projection_string": projection_string,
    }


# ══════════════════════════════════════════════════════════
# TASK 1 — Session Setup & Syllabus Parser
# ══════════════════════════════════════════════════════════

class SessionCreate(BaseModel):
    title: str
    deadline: str  # ISO datetime string
    user_id: str


@app.post("/sessions")
def create_session(body: SessionCreate):
    session_id = str(uuid.uuid4())
    data = {
        "id": session_id,
        "user_id": body.user_id,
        "title": body.title,
        "deadline": body.deadline,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("sessions").insert(data).execute()
    return {"session_id": session_id, "message": "Session created"}


@app.get("/sessions")
def list_sessions(user_id: str):
    sessions = supabase.table("sessions")\
        .select("*")\
        .eq("user_id", user_id)\
        .order("created_at", desc=True)\
        .execute().data

    if sessions:
        ids = [s["id"] for s in sessions]
        topics = supabase.table("topics")\
            .select("id, session_id, status")\
            .in_("session_id", ids)\
            .execute().data
        by_session: dict = {}
        for t in topics:
            by_session.setdefault(t["session_id"], []).append(t)
        for s in sessions:
            s["topics"] = by_session.get(s["id"], [])

    return sessions


class TopicInput(BaseModel):
    name: str
    estimated_hours: float = 1.0

class TopicsBody(BaseModel):
    topics: list[TopicInput]

@app.post("/sessions/{session_id}/topics")
def add_topics(session_id: str, body: TopicsBody):
    rows = [
        {
            "id":              str(uuid.uuid4()),
            "session_id":      session_id,
            "name":            t.name,
            "estimated_hours": t.estimated_hours,
            "priority_order":  i + 1,
            "status":          "pending",
            "created_at":      datetime.now(timezone.utc).isoformat(),
        }
        for i, t in enumerate(body.topics)
    ]
    supabase.table("topics").insert(rows).execute()
    return {"inserted": len(rows)}


@app.get("/sessions/{session_id}/topics")
def get_topics(session_id: str):
    topics = supabase.table("topics")\
        .select("*")\
        .eq("session_id", session_id)\
        .order("priority_order")\
        .execute().data
    return topics


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    supabase.table("topics").delete().eq("session_id", session_id).execute()
    supabase.table("sessions").delete().eq("id", session_id).execute()
    return {"deleted": session_id}


@app.get("/sessions/{session_id}")
def get_session(session_id: str):
    data = supabase.table("sessions")\
        .select("*")\
        .eq("id", session_id)\
        .single()\
        .execute()
    return data.data


def _index_chunks_background(session_id: str, chunks: list[str]):
    """Runs after the response is returned — downloads onnx model if needed."""
    try:
        col = get_or_create_collection(session_id)
        col.upsert(ids=[f"chunk_{i}" for i in range(len(chunks))], documents=chunks)
    except Exception:
        pass


@app.post("/sessions/{session_id}/parse-syllabus")
async def parse_syllabus(session_id: str, background_tasks: BackgroundTasks, file: UploadFile = File(None), raw_text: str = Form("")):
    user_id = _get_user_id_for_session(session_id)
    if user_id:
        _check_ai_usage(user_id)
    try:
        # Step 1 — extract text
        if file:
            contents = await file.read()
            doc = fitz.open(stream=contents, filetype="pdf")
            raw_text = "\n".join(page.get_text() for page in doc)

        if not raw_text.strip():
            raise HTTPException(400, "No text provided")

        # Step 2 — chunk text; Chroma indexing runs after response (non-blocking)
        chunks = [p.strip() for p in raw_text.split("\n\n") if len(p.strip()) > 40]
        if chunks:
            background_tasks.add_task(_index_chunks_background, session_id, chunks)

        # Step 3 — extract structured topic list via Groq
        prompt = f"""Extract a list of distinct learnable topics from this syllabus text.
Return ONLY a JSON array. No explanation. No markdown. Example format:
[{{"name":"Arrays","estimated_hours":2,"prerequisite_of":null}},{{"name":"Linked Lists","estimated_hours":3,"prerequisite_of":"Arrays"}}]

Syllabus:
{raw_text[:3000]}"""

        raw_json = json.loads(_generate_json(prompt))
        topics = raw_json if isinstance(raw_json, list) else next(iter(raw_json.values()))

        # Step 4 — insert topics into Supabase
        topic_rows = []
        total_hours = 0
        for i, t in enumerate(topics):
            total_hours += t.get("estimated_hours") or 1
            topic_rows.append({
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "name": t["name"],
                "estimated_hours": t.get("estimated_hours", 1),
                "priority_order": i + 1,
                "status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        supabase.table("topics").insert(topic_rows).execute()

        # Step 5 — feasibility check
        session_row = supabase.table("sessions").select("deadline").eq("id", session_id).single().execute().data
        hours_left = hours_until_deadline(session_row["deadline"])
        if total_hours <= hours_left * 0.7:
            verdict = "feasible"
        elif total_hours <= hours_left:
            verdict = "tight"
        else:
            verdict = "not feasible"

        supabase.table("sessions").update({
            "total_estimated_hours": total_hours,
            "feasibility_verdict": verdict,
            "raw_syllabus_text": raw_text[:5000],
        }).eq("id", session_id).execute()

        return {
            "topics_extracted": len(topics),
            "total_estimated_hours": total_hours,
            "hours_until_deadline": round(hours_left, 1),
            "feasibility_verdict": verdict,
            "topics": topic_rows,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Parse syllabus failed: {e}")


# ── Study Material ────────────────────────────────────────

@app.get("/topics/{topic_id}/study-material")
def get_study_material(topic_id: str):
    try:
        user_id = _get_user_id_for_topic(topic_id)
        if user_id:
            _check_ai_usage(user_id)
    except HTTPException:
        raise
    except Exception:
        pass
    try:
        topic = supabase.table("topics").select("*").eq("id", topic_id).maybe_single().execute().data
    except Exception:
        raise HTTPException(404, "Topic not found")
    if not topic:
        raise HTTPException(404, "Topic not found")
    try:
        session_data = supabase.table("sessions").select("raw_syllabus_text").eq("id", topic["session_id"]).maybe_single().execute().data or {}
    except Exception:
        session_data = {}

    # RAG chunks grounded in their actual syllabus
    chunks = retrieve_chunks(topic["session_id"], topic["name"], n=5)

    # Fall back to raw syllabus text if Chroma has nothing yet
    if chunks:
        context = "\n\n".join(chunks)
    elif session_data.get("raw_syllabus_text"):
        context = session_data["raw_syllabus_text"][:3000]
    else:
        context = ""

    context_block = f"\nCourse material from the student's syllabus:\n{context}\n" if context else ""

    prompt = f"""You are creating study material for a student preparing for an exam. Topic: "{topic['name']}".
{context_block}
Generate structured study material as JSON with exactly these fields:
- "overview": 2-3 sentence plain-English explanation of what this concept is and why it matters
- "key_points": array of 4-6 concise bullet-point strings covering the most important aspects
- "explanation": 2-3 paragraphs of clear, detailed explanation for exam preparation — specific, not generic
- "examples": array of 2-3 concrete real-world examples or scenarios that illustrate the concept
- "exam_focus": array of 2-3 specific question types or angles likely to appear in an exam

{"Base your answer on the course material above. Be specific to this course, not generic." if context else "Generate accurate, exam-focused material for this topic."}
Return ONLY valid JSON. No markdown fences."""

    try:
        data = json.loads(_generate_json(prompt))
        data.setdefault("overview", f"Core study of {topic['name']}.")
        data.setdefault("key_points", [])
        data.setdefault("explanation", "")
        data.setdefault("examples", [])
        data.setdefault("exam_focus", [])
        return data
    except Exception:
        return {
            "overview": f"Core study of {topic['name']}.",
            "key_points": [],
            "explanation": "",
            "examples": [],
            "exam_focus": [],
        }


# ── Challenge Brief ────────────────────────────────────────

@app.get("/topics/{topic_id}/challenge-brief")
def get_challenge_brief(topic_id: str):
    try:
        user_id = _get_user_id_for_topic(topic_id)
        if user_id:
            _check_ai_usage(user_id)
    except HTTPException:
        raise
    except Exception:
        pass
    try:
        topic = supabase.table("topics").select("*").eq("id", topic_id).maybe_single().execute().data
    except Exception:
        raise HTTPException(404, "Topic not found")
    if not topic:
        raise HTTPException(404, "Topic not found")

    chunks = retrieve_chunks(topic["session_id"], topic["name"], n=3)
    context_block = ("\nRelevant syllabus content:\n" + "\n\n".join(chunks) + "\n") if chunks else ""

    prompt = f"""You are helping a student prepare to study the topic "{topic['name']}".{context_block}
Generate a Challenge Brief as JSON with exactly these fields:
- "what_it_solves": one sentence — the real-world problem or need this concept addresses
- "must_explain": array of exactly 3 short phrases — things the student must be able to explain from memory to truly understand this topic
- "watch_out": one sentence — the single most common misconception or mistake students make about this topic

Return ONLY valid JSON. No markdown, no explanation."""

    try:
        brief = json.loads(_generate_json(prompt))
        # normalise — ensure required keys exist
        brief.setdefault("what_it_solves", f"Understanding the core principles of {topic['name']}.")
        brief.setdefault("must_explain", [f"What {topic['name']} is", "How it works", "When to use it"])
        brief.setdefault("watch_out", f"Make sure you understand the distinctions unique to {topic['name']}.")
        return brief
    except Exception:
        return {
            "what_it_solves": f"Understanding the core principles of {topic['name']}.",
            "must_explain": [f"What {topic['name']} is", "How it works", "When to use it"],
            "watch_out": f"Make sure you understand the distinctions unique to {topic['name']}.",
        }


# ══════════════════════════════════════════════════════════
# TASK 2 — Live Pace Tracker
# ══════════════════════════════════════════════════════════

class CompleteTopicBody(BaseModel):
    actual_minutes: int


@app.patch("/topics/{topic_id}/start")
def start_topic(topic_id: str):
    supabase.table("topics").update({"status": "in_progress"}).eq("id", topic_id).execute()
    return {"message": "Topic started"}


@app.patch("/topics/{topic_id}/complete")
def complete_topic(topic_id: str, body: CompleteTopicBody):
    topic = supabase.table("topics").select("*").eq("id", topic_id).single().execute().data
    estimated_minutes = int(topic["estimated_hours"] * 60)
    pace_ratio = body.actual_minutes / estimated_minutes if estimated_minutes else 1.0

    supabase.table("pace_logs").insert({
        "id": str(uuid.uuid4()),
        "topic_id": topic_id,
        "session_id": topic["session_id"],
        "estimated_minutes": estimated_minutes,
        "actual_minutes": body.actual_minutes,
        "pace_ratio": round(pace_ratio, 3),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    supabase.table("topics").update({"status": "done"}).eq("id", topic_id).execute()
    return {"message": "Topic marked done", "pace_ratio": round(pace_ratio, 3)}


@app.get("/sessions/{session_id}/pace")
def get_pace(session_id: str):
    session = supabase.table("sessions").select("deadline").eq("id", session_id).single().execute().data
    return remaining_projected_hours(session_id, session["deadline"])


# ══════════════════════════════════════════════════════════
# TASK 3 — Deferred Topic Graveyard
# ══════════════════════════════════════════════════════════

@app.patch("/topics/{topic_id}/defer")
def defer_topic(topic_id: str):
    topic = supabase.table("topics").select("session_id").eq("id", topic_id).single().execute().data
    supabase.table("topics").update({"status": "deferred"}).eq("id", topic_id).execute()
    supabase.table("defer_logs").insert({
        "id": str(uuid.uuid4()),
        "topic_id": topic_id,
        "session_id": topic["session_id"],
        "deferred_at": datetime.now(timezone.utc).isoformat(),
        "resurfaced": False,
        "ultimately_completed": False,
    }).execute()
    return {"message": "Topic deferred"}


@app.patch("/topics/{topic_id}/resurface")
def resurface_topic(topic_id: str):
    supabase.table("topics").update({"status": "pending"}).eq("id", topic_id).execute()
    supabase.table("defer_logs").update({
        "resurfaced": True,
        "resurfaced_at": datetime.now(timezone.utc).isoformat(),
    }).eq("topic_id", topic_id).eq("resurfaced", False).execute()
    return {"message": "Topic resurfaced"}


@app.patch("/topics/{topic_id}/recover")
def recover_topic(topic_id: str):
    supabase.table("defer_logs").update({
        "ultimately_completed": True,
    }).eq("topic_id", topic_id).execute()
    supabase.table("topics").update({"status": "done"}).eq("id", topic_id).execute()
    return {"message": "Topic recovered and completed"}


@app.get("/sessions/{session_id}/graveyard")
def get_graveyard(session_id: str):
    session = supabase.table("sessions").select("deadline").eq("id", session_id).single().execute().data
    hours_left = hours_until_deadline(session["deadline"])

    deferred = supabase.table("topics")\
        .select("*")\
        .eq("session_id", session_id)\
        .eq("status", "deferred")\
        .execute().data

    total_deferred_hours = sum((t["estimated_hours"] or 1) for t in deferred)
    pct_runway_left = (hours_left / max(hours_left + total_deferred_hours, 1)) * 100

    if pct_runway_left > 50:
        urgency = "low"
        message = "You have time — but don't forget these topics."
    elif pct_runway_left > 25:
        urgency = "medium"
        message = "Deadline approaching. Review your deferred topics soon."
    else:
        urgency = "high"
        message = f"Only {round(hours_left, 1)}h left. Pick which deferred topics you'll actually do."

    return {
        "deferred_topics": deferred,
        "total_deferred_hours": round(total_deferred_hours, 1),
        "hours_until_deadline": round(hours_left, 1),
        "urgency": urgency,
        "message": message,
    }


# ══════════════════════════════════════════════════════════
# TASK 4 — Socratic Depth Check Engine
# ══════════════════════════════════════════════════════════

SOCRATIC_SYSTEM = """You are SocraBot, a strict Socratic tutor.
Rules you must never break:
1. NEVER give the answer directly.
2. NEVER confirm if the student is right or wrong outright.
3. Ask ONE focused question that targets the specific gap in their explanation.
4. At level 3 only: directly name the misconception and explain it clearly.
5. Keep responses under 80 words.
6. Use the retrieved curriculum context below to ground your question in the actual syllabus material.

Curriculum context:
{context}

Current hint level: {level}
"""


class DepthCheckStart(BaseModel):
    student_explanation: str


class DepthCheckRespond(BaseModel):
    user_response: str
    conversation_history: list
    current_level: int


class DepthCheckComplete(BaseModel):
    level_reached: int
    student_explanation: str
    conversation_history: list


class DepthCheckSave(BaseModel):
    score: int
    mode: str


def _normalize_mcq_questions(raw: object) -> list[dict]:
    data = raw if isinstance(raw, dict) else {}
    questions = data.get("questions", []) if isinstance(data, dict) else []
    if not isinstance(questions, list):
        questions = []

    normalized = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        options = q.get("options", [])
        if not isinstance(options, list):
            options = []
        options = [str(o) for o in options[:3]]
        if len(options) != 3:
            continue

        correct_index = q.get("correct_index", 0)
        if not isinstance(correct_index, int) or correct_index < 0 or correct_index > 2:
            correct_index = 0

        normalized.append({
            "question": str(q.get("question", "")).strip(),
            "options": options,
            "correct_index": correct_index,
            "explanation": str(q.get("explanation", "")).strip(),
        })

    return normalized


@app.get("/sessions/{session_id}/depth-scores")
def get_depth_scores(session_id: str):
    """Returns latest depth score per topic for this session."""
    checks = supabase.table("depth_checks")\
        .select("topic_id, score, checked_at")\
        .eq("session_id", session_id)\
        .order("checked_at", desc=True)\
        .execute().data
    latest: dict = {}
    for c in checks:
        if c["topic_id"] not in latest:
            latest[c["topic_id"]] = c["score"]
    return latest


@app.post("/topics/{topic_id}/depth-check/mcq")
def depth_check_mcq(topic_id: str, count: int = 3, difficulty: str = "balanced"):
    try:
        user_id = _get_user_id_for_topic(topic_id)
        if user_id:
            _check_ai_usage(user_id)
    except HTTPException:
        raise
    except Exception:
        pass
    count = max(1, min(20, count))
    difficulty = difficulty if difficulty in ("easy", "balanced", "hard") else "balanced"
    try:
        topic = supabase.table("topics").select("*").eq("id", topic_id).maybe_single().execute().data
    except Exception:
        raise HTTPException(404, "Topic not found")
    if not topic:
        raise HTTPException(404, "Topic not found")

    difficulty_note = {
        "easy": "Make questions recall-based and straightforward — no tricks.",
        "balanced": "Mix recall and application. Standard exam difficulty.",
        "hard": "Focus on deep understanding, edge cases, and tricky distinctions.",
    }[difficulty]

    prompt = f"""Generate exactly {count} MCQ questions testing "{topic['name']}".
Difficulty: {difficulty_note}
Return ONLY JSON: {{"questions":[{{"question":"...","options":["A","B","C"],"correct_index":0,"explanation":"..."}}]}}
Generate exactly {count} questions. 3 options each. No preamble."""

    best: list[dict] = []
    for _ in range(3):
        try:
            qs = _normalize_mcq_questions(json.loads(_generate_json(prompt)))
            if len(qs) > len(best):
                best = qs
            if len(best) >= count:
                break
        except (_AIUnavailable, Exception):
            pass


    if not best:
        raise HTTPException(500, "MCQ generation returned no questions after 3 attempts")

    return {"questions": best[:count], "score": 0}


@app.post("/topics/{topic_id}/depth-check/save")
def depth_check_save(topic_id: str, body: DepthCheckSave):
    topic = supabase.table("topics").select("session_id").eq("id", topic_id).single().execute().data
    if not topic:
        raise HTTPException(404, "Topic not found")
    if body.mode != "mcq":
        raise HTTPException(400, "Unsupported depth-check mode")

    row = {
        "id": str(uuid.uuid4()),
        "topic_id": topic_id,
        "session_id": topic["session_id"],
        "level_reached": 0,
        "score": body.score,
        "student_explanation": "",
        "conversation_history": [],
        "mode": body.mode,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("depth_checks").insert(row).execute()
    return {"score": body.score, "mode": body.mode, "message": "Depth check saved"}


@app.post("/topics/{topic_id}/depth-check/start")
def depth_check_start(topic_id: str, body: DepthCheckStart):
    user_id = _get_user_id_for_topic(topic_id)
    if user_id:
        _check_ai_usage(user_id)
    topic = supabase.table("topics").select("*").eq("id", topic_id).single().execute().data
    chunks = retrieve_chunks(topic["session_id"], f"{topic['name']} {body.student_explanation}")
    context = "\n\n".join(chunks) if chunks else "No curriculum context found."

    system = SOCRATIC_SYSTEM.format(context=context, level=1)
    messages = [{"role": "user", "content": f"Topic: {topic['name']}\n\nMy explanation: {body.student_explanation}"}]

    assistant_reply = _generate(messages[-1]["content"], system)
    messages.append({"role": "assistant", "content": assistant_reply})

    return {
        "level": 1,
        "question": assistant_reply,
        "conversation_history": messages,
    }


@app.post("/topics/{topic_id}/depth-check/respond")
def depth_check_respond(topic_id: str, body: DepthCheckRespond):
    user_id = _get_user_id_for_topic(topic_id)
    if user_id:
        _check_ai_usage(user_id)
    topic = supabase.table("topics").select("*").eq("id", topic_id).single().execute().data
    next_level = body.current_level + 1

    if next_level > 3:
        return {"level": 3, "question": None, "resolved": True, "message": "Depth check complete. Please save results."}

    chunks = retrieve_chunks(topic["session_id"], body.user_response)
    context = "\n\n".join(chunks) if chunks else "No curriculum context found."
    system = SOCRATIC_SYSTEM.format(context=context, level=next_level)

    history = body.conversation_history + [{"role": "user", "content": body.user_response}]

    assistant_reply = _chat(history, system)
    history.append({"role": "assistant", "content": assistant_reply})

    return {
        "level": next_level,
        "question": assistant_reply,
        "conversation_history": history,
        "resolved": next_level >= 3,
    }


@app.post("/topics/{topic_id}/depth-check/complete")
def depth_check_complete(topic_id: str, body: DepthCheckComplete):
    topic = supabase.table("topics").select("session_id").eq("id", topic_id).single().execute().data
    score = max(1, 4 - body.level_reached)  # L1=3, L2=2, L3=1

    supabase.table("depth_checks").insert({
        "id": str(uuid.uuid4()),
        "topic_id": topic_id,
        "session_id": topic["session_id"],
        "level_reached": body.level_reached,
        "score": score,
        "student_explanation": body.student_explanation,
        "conversation_history": body.conversation_history,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return {"score": score, "level_reached": body.level_reached, "message": "Depth check saved"}


# ══════════════════════════════════════════════════════════
# TASK 5 — SocraBot Bubble
# ══════════════════════════════════════════════════════════

@app.get("/sessions/{session_id}/context")
def get_session_context(session_id: str):
    session = supabase.table("sessions").select("*").eq("id", session_id).single().execute().data
    pace = remaining_projected_hours(session_id, session["deadline"])
    deferred_count = supabase.table("topics")\
        .select("id", count="exact")\
        .eq("session_id", session_id)\
        .eq("status", "deferred")\
        .execute().count
    current_topic = supabase.table("topics")\
        .select("name")\
        .eq("session_id", session_id)\
        .eq("status", "in_progress")\
        .limit(1)\
        .execute().data
    return {
        "current_topic": current_topic[0]["name"] if current_topic else None,
        "pace_ratio": pace["pace_ratio_avg"],
        "hours_remaining": pace["hours_until_deadline"],
        "projected_hours_needed": pace["projected_hours_needed"],
        "on_track": pace["on_track"],
        "deferred_count": deferred_count or 0,
        "deadline": session["deadline"],
    }


class BubbleChat(BaseModel):
    message: str
    conversation_history: list = []


@app.post("/sessions/{session_id}/bubble/chat")
def bubble_chat(session_id: str, body: BubbleChat):
    try:
        user_id = _get_user_id_for_session(session_id)
        if user_id:
            _check_ai_usage(user_id)

        ctx: dict = {}
        try:
            ctx = get_session_context(session_id)
        except Exception:
            ctx = {
                "current_topic": None, "pace_ratio": 1.0,
                "hours_remaining": 0, "projected_hours_needed": 0,
                "on_track": "green", "deferred_count": 0, "deadline": None,
            }

        rag_chunks = retrieve_chunks(session_id, body.message)
        rag_context = "\n\n".join(rag_chunks) if rag_chunks else ""

        system = f"""You are SocraBot, a sharp and honest study assistant built into a study app called Ormify.
You have real data about the student's session. Use it. Never be vague or generic.

Session context:
- Current topic being studied: {ctx['current_topic'] or 'none selected yet'}
- Pace multiplier: {ctx['pace_ratio']}x (1.0 = on pace, >1.0 = taking longer than estimated)
- Hours left until deadline: {ctx['hours_remaining']}h
- Projected hours needed to finish: {ctx['projected_hours_needed']}h
- Status: {'On track' if ctx['on_track'] == 'green' else 'Slightly behind' if ctx['on_track'] == 'amber' else 'Behind — needs attention'}
- Deferred topics: {ctx['deferred_count']}

{'Relevant syllabus excerpts:' + chr(10) + rag_context if rag_context else 'No syllabus context loaded yet.'}

Respond like a knowledgeable friend: direct, specific, honest. Use the session data above when relevant.
If asked about a concept, explain it clearly. If asked about pace or planning, use the numbers above."""

        history = body.conversation_history + [{"role": "user", "content": body.message}]

        try:
            reply = _chat(history, system)
        except Exception:
            reply = "I've hit my daily AI token limit — I'll be back once it resets (midnight UTC). In the meantime, keep studying and come back to me later!"

        history.append({"role": "assistant", "content": reply})

        try:
            supabase.table("bubble_chat_logs").insert({
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "role": "assistant",
                "content": reply,
                "context_snapshot": json.dumps(ctx),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception:
            pass

        return {"reply": reply, "conversation_history": history}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════
# TASK 6 — Pre-Deadline Honest Report
# ══════════════════════════════════════════════════════════

@app.get("/sessions/{session_id}/report")
def get_report(session_id: str):
    all_topics = supabase.table("topics").select("*").eq("session_id", session_id).execute().data
    depth_checks = supabase.table("depth_checks").select("topic_id, score").eq("session_id", session_id).execute().data
    defer_logs = supabase.table("defer_logs").select("topic_id, ultimately_completed").eq("session_id", session_id).execute().data

    checked_map = {d["topic_id"]: d["score"] for d in depth_checks}
    deferred_set = {d["topic_id"] for d in defer_logs}
    recovered_set = {d["topic_id"] for d in defer_logs if d["ultimately_completed"]}

    genuinely_understood, surface_read, deferred_never_touched, never_opened = [], [], [], []

    for t in all_topics:
        tid = t["id"]
        if tid in checked_map and checked_map[tid] >= 2:
            genuinely_understood.append(t)
        elif t["status"] == "done" and tid not in checked_map:
            surface_read.append(t)
        elif tid in deferred_set and tid not in recovered_set:
            deferred_never_touched.append(t)
        elif t["status"] == "pending":
            never_opened.append(t)

    total = len(all_topics) or 1
    readiness_score = round(
        (len(genuinely_understood) * 1.0 +
         len(surface_read) * 0.5 +
         len(recovered_set) * 0.7) / total * 100, 1
    )

    session = supabase.table("sessions").select("deadline").eq("id", session_id).single().execute().data
    hours_left = hours_until_deadline(session["deadline"])
    focus_topics = surface_read + never_opened

    recommended_focus = []
    if focus_topics and hours_left > 0:
        focus_text = "\n".join(f"- {t['name']} (~{t['estimated_hours']}h)" for t in focus_topics)
        prompt = f"""Given {round(hours_left, 1)} hours until the deadline, rank these topics by which will most improve readiness per hour spent. Return ONLY a JSON array of topic names in priority order. No explanation.

Topics:
{focus_text}"""
        try:
            raw = json.loads(_generate_json(prompt))
            recommended_focus = raw if isinstance(raw, list) else next(iter(raw.values()), [])
        except Exception:
            recommended_focus = [t["name"] for t in focus_topics]

    return {
        "readiness_score": readiness_score,
        "genuinely_understood": [t["name"] for t in genuinely_understood],
        "surface_read_only": [t["name"] for t in surface_read],
        "deferred_never_touched": [t["name"] for t in deferred_never_touched],
        "never_opened": [t["name"] for t in never_opened],
        "recommended_focus": recommended_focus,
        "hours_until_deadline": round(hours_left, 1),
    }


# ══════════════════════════════════════════════════════════
# TASK 7 — Analytics Dashboard
# ══════════════════════════════════════════════════════════

@app.get("/sessions/{session_id}/analytics/pace")
def analytics_pace(session_id: str):
    logs = supabase.table("pace_logs")\
        .select("*, topics(name)")\
        .eq("session_id", session_id)\
        .order("completed_at")\
        .execute().data
    return [{"topic": l["topics"]["name"], "pace_ratio": l["pace_ratio"], "completed_at": l["completed_at"]} for l in logs]


@app.get("/sessions/{session_id}/analytics/depth")
def analytics_depth(session_id: str):
    checks = supabase.table("depth_checks")\
        .select("score, level_reached, topics(name)")\
        .eq("session_id", session_id)\
        .execute().data
    return [{"topic": c["topics"]["name"], "score": c["score"], "level_reached": c["level_reached"]} for c in checks]


@app.get("/sessions/{session_id}/analytics/time-vs-understanding")
def analytics_scatter(session_id: str):
    logs = supabase.table("pace_logs").select("topic_id, actual_minutes").eq("session_id", session_id).execute().data
    checks = supabase.table("depth_checks").select("topic_id, score").eq("session_id", session_id).execute().data
    score_map = {c["topic_id"]: c["score"] for c in checks}
    topics = supabase.table("topics").select("id, name").eq("session_id", session_id).execute().data
    name_map = {t["id"]: t["name"] for t in topics}
    return [
        {"topic": name_map.get(l["topic_id"], l["topic_id"]), "actual_minutes": l["actual_minutes"], "score": score_map.get(l["topic_id"])}
        for l in logs if l["topic_id"] in score_map
    ]


@app.get("/users/{user_id}/analytics/deferred")
def analytics_deferred(user_id: str):
    sessions = supabase.table("sessions").select("id").eq("user_id", user_id).execute().data
    session_ids = [s["id"] for s in sessions]
    if not session_ids:
        return []
    logs = supabase.table("defer_logs")\
        .select("topic_id, topics(name)")\
        .in_("session_id", session_ids)\
        .execute().data
    counts: dict = {}
    for l in logs:
        name = l["topics"]["name"]
        counts[name] = counts.get(name, 0) + 1
    return sorted([{"topic": k, "defer_count": v} for k, v in counts.items()], key=lambda x: -x["defer_count"])


# ══════════════════════════════════════════════════════════
# SHARED — Status endpoint used by Tasks 2, 3, 5, 6
# ══════════════════════════════════════════════════════════

@app.get("/sessions/{session_id}/status")
def get_status(session_id: str):
    return get_session_context(session_id)

# ══════════════════════════════════════════════════════════
# TASK 8 — Dashboard stat APIs
# ══════════════════════════════════════════════════════════

@app.get("/users/{user_id}/sessions/summary")
def sessions_summary(user_id: str):
    """
    Total sessions + active session count for the dashboard header cards.
    A session is 'active' when it has at least one topic that is pending or in_progress.
    """
    sessions = supabase.table("sessions") \
        .select("id") \
        .eq("user_id", user_id) \
        .execute().data

    if not sessions:
        return {"total_sessions": 0, "active_sessions": 0}

    session_ids = [s["id"] for s in sessions]

    # Any topic that is not done/deferred means the session is still active
    active_topics = supabase.table("topics") \
        .select("session_id") \
        .in_("session_id", session_ids) \
        .in_("status", ["pending", "in_progress"]) \
        .execute().data

    active_session_ids = {t["session_id"] for t in active_topics}

    return {
        "total_sessions":  len(sessions),
        "active_sessions": len(active_session_ids),
    }


@app.get("/users/{user_id}/topics/weekly")
def topics_this_week(user_id: str):
    """
    Count of topics completed in the current calendar week (Mon–Sun, UTC).
    Uses pace_logs.completed_at because topics table has no completed_at column.
    """
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    # Monday 00:00 UTC of the current week
    week_start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # Get all session IDs for this user first
    sessions = supabase.table("sessions") \
        .select("id") \
        .eq("user_id", user_id) \
        .execute().data

    if not sessions:
        return {"count": 0, "week_start": week_start.isoformat()}

    session_ids = [s["id"] for s in sessions]

    # Count pace_log rows (each row = one topic completion) within this week
    logs = supabase.table("pace_logs") \
        .select("id") \
        .in_("session_id", session_ids) \
        .gte("completed_at", week_start.isoformat()) \
        .execute().data

    return {
        "count":      len(logs),
        "week_start": week_start.isoformat(),
    }


# ══════════════════════════════════════════════════════════
# TASK 9 — Analytics pace endpoint fix
# Existing endpoint returns only pace_ratio. Dashboard also needs
# estimated_minutes + actual_minutes for the full line chart.
# Override it here — FastAPI uses the last registered route.
# ══════════════════════════════════════════════════════════

@app.get("/sessions/{session_id}/analytics/pace/detail")
def analytics_pace_detail(session_id: str):
    """
    Full pace data per topic: name, estimated time, actual time, ratio, timestamp.
    Used by the pace line chart on the dashboard analytics panel.
    """
    logs = supabase.table("pace_logs") \
        .select("topic_id, estimated_minutes, actual_minutes, pace_ratio, completed_at, topics(name)") \
        .eq("session_id", session_id) \
        .order("completed_at") \
        .execute().data

    return [
        {
            "topic":             l["topics"]["name"] if l.get("topics") else l["topic_id"],
            "estimated_minutes": l["estimated_minutes"],
            "actual_minutes":    l["actual_minutes"],
            "pace_ratio":        l["pace_ratio"],
            "completed_at":      l["completed_at"],
        }
        for l in logs
    ]


# ══════════════════════════════════════════════════════════
# TASK 10 — Schedule page
# ══════════════════════════════════════════════════════════

@app.get("/sessions/{session_id}/schedule")
def get_schedule(session_id: str):
    """
    Compute a day-by-day study plan for remaining topics.
    Spreads pending/in_progress topics across days until the deadline,
    respecting sessions.hours_per_day if set (defaults to 6h/day).
    """
    from datetime import timedelta, date

    session = supabase.table("sessions") \
        .select("deadline, hours_per_day, title") \
        .eq("id", session_id) \
        .single() \
        .execute().data

    if not session:
        raise HTTPException(404, "Session not found")

    deadline = datetime.fromisoformat(session["deadline"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    hours_per_day: float = float(session.get("hours_per_day") or 6)

    # Days remaining (including today, at least 1)
    days_left = max(1, (deadline.date() - now.date()).days + 1)

    pending_topics = supabase.table("topics") \
        .select("id, name, estimated_hours, priority_order, status") \
        .eq("session_id", session_id) \
        .in_("status", ["pending", "in_progress"]) \
        .order("priority_order") \
        .execute().data

    if not pending_topics:
        return {
            "session_title": session["title"],
            "days_left":     days_left,
            "hours_per_day": hours_per_day,
            "days":          [],
            "message":       "No pending topics — all done or deferred.",
        }

    # Greedy bin-packing: fill each day up to hours_per_day
    days: list[dict] = []
    current_day_index = 0
    current_day_hours = 0.0
    current_day_topics: list[dict] = []

    for topic in pending_topics:
        est = float(topic["estimated_hours"] or 1)

        # If this topic alone exceeds a full day, give it its own day anyway
        if current_day_hours + est > hours_per_day and current_day_topics:
            study_date = (now + timedelta(days=current_day_index)).strftime("%A, %b %-d")
            days.append({
                "day":           current_day_index + 1,
                "date":          study_date,
                "topics":        current_day_topics,
                "planned_hours": round(current_day_hours, 1),
            })
            current_day_index += 1
            current_day_hours = 0.0
            current_day_topics = []

        current_day_topics.append({
            "id":              topic["id"],
            "name":            topic["name"],
            "estimated_hours": est,
            "status":          topic["status"],
        })
        current_day_hours += est

    # Flush the last day
    if current_day_topics:
        study_date = (now + timedelta(days=current_day_index)).strftime("%A, %b %-d")
        days.append({
            "day":           current_day_index + 1,
            "date":          study_date,
            "topics":        current_day_topics,
            "planned_hours": round(current_day_hours, 1),
        })

    total_planned_days = len(days)
    feasible = total_planned_days <= days_left

    return {
        "session_title":       session["title"],
        "days_left":           days_left,
        "hours_per_day":       hours_per_day,
        "total_planned_days":  total_planned_days,
        "feasible":            feasible,
        "overrun_days":        max(0, total_planned_days - days_left),
        "days":                days,
        "message": (
            f"On track — {total_planned_days} study days planned, {days_left} available."
            if feasible else
            f"Warning: {total_planned_days} days of work but only {days_left} days left."
        ),
    }


class ScheduleLogBody(BaseModel):
    topic_id:        str
    actual_minutes:  int
    scheduled_date:  str   # ISO date string e.g. "2026-06-30"


@app.post("/sessions/{session_id}/schedule/log")
def log_schedule_day(session_id: str, body: ScheduleLogBody):
    """
    Log actual time spent on a topic for a scheduled study day.
    Reuses pace_logs with the new scheduled_date column.
    Does NOT mark the topic done — that stays on PATCH /topics/{id}/complete.
    """
    topic = supabase.table("topics") \
        .select("estimated_hours, status") \
        .eq("id", body.topic_id) \
        .eq("session_id", session_id) \
        .single() \
        .execute().data

    if not topic:
        raise HTTPException(404, "Topic not found in this session")

    estimated_minutes = int(float(topic["estimated_hours"] or 1) * 60)
    pace_ratio = round(body.actual_minutes / estimated_minutes, 3) if estimated_minutes else 1.0

    supabase.table("pace_logs").insert({
        "id":               str(uuid.uuid4()),
        "topic_id":         body.topic_id,
        "session_id":       session_id,
        "estimated_minutes": estimated_minutes,
        "actual_minutes":   body.actual_minutes,
        "pace_ratio":       pace_ratio,
        "scheduled_date":   body.scheduled_date,
        "completed_at":     datetime.now(timezone.utc).isoformat(),
    }).execute()

    return {
        "logged":             True,
        "pace_ratio":         pace_ratio,
        "scheduled_date":     body.scheduled_date,
        "actual_minutes":     body.actual_minutes,
        "estimated_minutes":  estimated_minutes,
    }


# ── run ──────────────────────────────────────────────────
YOUTUBE_KEY = os.environ.get("YOUTUBE_API_KEY", "")


@app.get("/topics/{topic_id}/videos")
def get_topic_videos(topic_id: str):
    topic = supabase.table("topics").select("name, session_id").eq("id", topic_id).single().execute().data
    if not topic:
        raise HTTPException(404, "Topic not found")

    if not YOUTUBE_KEY:
        raise HTTPException(500, "YouTube API key not configured")

    import urllib.request, urllib.parse

    query = urllib.parse.urlencode({
        "part":       "snippet",
        "q":          f"{topic['name']} explained tutorial",
        "type":       "video",
        "maxResults": 3,
        "order":      "relevance",
        "key":        YOUTUBE_KEY,
    })

    url = f"https://www.googleapis.com/youtube/v3/search?{query}"

    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            data = json.loads(r.read())
    except Exception as e:
        raise HTTPException(502, f"YouTube API error: {e}")

    videos = [
        {
            "title":     item["snippet"]["title"],
            "channel":   item["snippet"]["channelTitle"],
            "thumbnail": item["snippet"]["thumbnails"]["medium"]["url"],
            "url":       f"https://youtube.com/watch?v={item['id']['videoId']}",
            "video_id":  item["id"]["videoId"],
        }
        for item in data.get("items", [])
        if item.get("id", {}).get("videoId")
    ]

    return {"topic": topic["name"], "videos": videos}


# ══════════════════════════════════════════════════════════
# User preferences (notification settings stored in Supabase)
# ══════════════════════════════════════════════════════════

class PrefsBody(BaseModel):
    email: str
    deadline_reminders: bool = False
    daily_reminder: bool = False
    streak_alerts: bool = False

@app.get("/users/{user_id}/preferences")
def get_preferences(user_id: str):
    row = supabase.table("user_preferences").select("*").eq("user_id", user_id).maybe_single().execute().data
    if not row:
        return {"deadline_reminders": False, "daily_reminder": False, "streak_alerts": False}
    return {
        "deadline_reminders": row["deadline_reminders"],
        "daily_reminder":     row["daily_reminder"],
        "streak_alerts":      row["streak_alerts"],
    }

@app.put("/users/{user_id}/preferences")
def save_preferences(user_id: str, body: PrefsBody):
    supabase.table("user_preferences").upsert({
        "user_id":             user_id,
        "email":               body.email,
        "deadline_reminders":  body.deadline_reminders,
        "daily_reminder":      body.daily_reminder,
        "streak_alerts":       body.streak_alerts,
        "updated_at":          datetime.now(timezone.utc).isoformat(),
    }).execute()
    return {"saved": True}


# ══════════════════════════════════════════════════════════
# Scheduler jobs — run automatically in the background
# ══════════════════════════════════════════════════════════

def _job_deadline_alerts():
    """Every 6 h — email users with sessions due within 7 days."""
    try:
        rows = supabase.table("user_preferences").select("*").eq("deadline_reminders", True).execute().data or []
        now  = datetime.now(timezone.utc)
        for p in rows:
            try:
                sessions = supabase.table("sessions").select("title, deadline") \
                    .eq("user_id", p["user_id"]).execute().data or []
                upcoming = [
                    s for s in sessions
                    if (d := datetime.fromisoformat(s["deadline"].replace("Z", "+00:00"))) > now
                    and (d - now).days <= 7
                ]
                if not upcoming:
                    continue
                rows_html = "".join(
                    f"<li><b>{s['title']}</b> — due {s['deadline'][:10]} "
                    f"({(datetime.fromisoformat(s['deadline'].replace('Z','+00:00')) - now).days}d left)</li>"
                    for s in upcoming
                )
                html = (
                    f"<h2 style='color:#7B61FF'>Upcoming Deadlines — Ormify</h2>"
                    f"<p>You have sessions due within 7 days:</p><ul>{rows_html}</ul>"
                    f"<p style='color:#888;font-size:12px'>Log into Ormify to keep studying.</p>"
                )
                _send_email(p["email"], "Ormify — Upcoming session deadlines", html)
                log.info("Deadline alert sent to %s", p["email"])
            except Exception as e:
                log.warning("Deadline alert failed for %s: %s", p.get("email"), e)
    except Exception as e:
        log.error("_job_deadline_alerts error: %s", e)


def _job_daily_reminders():
    """Every day at 8 AM UTC — nudge users who have sessions."""
    try:
        rows = supabase.table("user_preferences").select("*").eq("daily_reminder", True).execute().data or []
        for p in rows:
            try:
                sessions = supabase.table("sessions").select("title").eq("user_id", p["user_id"]).execute().data or []
                count = len(sessions)
                html  = (
                    f"<h2 style='color:#7B61FF'>Daily Study Reminder — Ormify</h2>"
                    f"<p>You have <b>{count}</b> session(s) waiting for you.</p>"
                    f"<p>Log in and complete at least one topic today to stay on track!</p>"
                    f"<p style='color:#888;font-size:12px'>You can turn this off in Ormify Settings → Notifications.</p>"
                )
                _send_email(p["email"], "Ormify — Your daily study reminder", html)
                log.info("Daily reminder sent to %s", p["email"])
            except Exception as e:
                log.warning("Daily reminder failed for %s: %s", p.get("email"), e)
    except Exception as e:
        log.error("_job_daily_reminders error: %s", e)


def _job_streak_alerts():
    """Every day at 8 PM UTC — streak-risk reminder."""
    try:
        rows = supabase.table("user_preferences").select("*").eq("streak_alerts", True).execute().data or []
        for p in rows:
            try:
                html = (
                    f"<h2 style='color:#F59E0B'>Streak Alert — Ormify</h2>"
                    f"<p>Your study streak is at risk! You haven't completed any topics today.</p>"
                    f"<p>Log in and study at least one topic to keep your streak alive.</p>"
                    f"<p style='color:#888;font-size:12px'>You can turn this off in Ormify Settings → Notifications.</p>"
                )
                _send_email(p["email"], "Ormify — Your streak is at risk", html)
                log.info("Streak alert sent to %s", p["email"])
            except Exception as e:
                log.warning("Streak alert failed for %s: %s", p.get("email"), e)
    except Exception as e:
        log.error("_job_streak_alerts error: %s", e)


@app.on_event("startup")
def startup():
    if SMTP_USER and SMTP_PASS:
        scheduler.add_job(_job_deadline_alerts, "interval", hours=6,   id="deadline_alerts")
        scheduler.add_job(_job_daily_reminders, "cron",  hour=8,  minute=0, id="daily_reminders")
        scheduler.add_job(_job_streak_alerts,   "cron",  hour=20, minute=0, id="streak_alerts")
        scheduler.start()
        log.info("Notification scheduler started.")
    else:
        log.warning("SMTP_USER/SMTP_PASS not set — notification scheduler disabled.")

@app.on_event("shutdown")
def shutdown():
    if scheduler.running:
        scheduler.shutdown(wait=False)


# ══════════════════════════════════════════════════════════
# Notifications — email
# ══════════════════════════════════════════════════════════

class NotifyBody(BaseModel):
    email: str
    type: str  # "deadline_reminder" | "daily_reminder" | "streak_alert"

@app.post("/users/{user_id}/notifications/send")
def send_notification(user_id: str, body: NotifyBody):
    sessions = supabase.table("sessions").select("title, deadline").eq("user_id", user_id).execute().data or []
    now = datetime.now(timezone.utc)

    if body.type == "deadline_reminder":
        upcoming = [
            s for s in sessions
            if (d := datetime.fromisoformat(s["deadline"].replace("Z", "+00:00"))) > now
            and (d - now).days <= 7
        ]
        if not upcoming:
            rows = "".join(f"<li>{s['title']} — {s['deadline'][:10]}</li>" for s in sessions[:5]) or "<li>No active sessions</li>"
            html = f"<h2>Your Ormify Sessions</h2><ul>{rows}</ul>"
        else:
            rows = "".join(
                f"<li><b>{s['title']}</b> — due {s['deadline'][:10]} "
                f"({(datetime.fromisoformat(s['deadline'].replace('Z','+00:00'))-now).days}d left)</li>"
                for s in upcoming
            )
            html = f"<h2>Upcoming Deadlines</h2><p>You have sessions due within 7 days:</p><ul>{rows}</ul>"
        subject = "Ormify — Upcoming session deadlines"

    elif body.type == "daily_reminder":
        count = len(sessions)
        html = (
            f"<h2>Daily Study Reminder</h2>"
            f"<p>You have <b>{count}</b> session(s) in Ormify. Keep up your study streak today!</p>"
        )
        subject = "Ormify — Your daily study reminder"

    elif body.type == "streak_alert":
        html = (
            "<h2>Streak Alert</h2>"
            "<p>Don't forget to study today — your streak is at risk! Log into Ormify and complete at least one topic.</p>"
        )
        subject = "Ormify — Your streak is at risk"

    else:
        raise HTTPException(400, f"Unknown notification type: {body.type}")

    try:
        _send_email(body.email, subject, html)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Email send failed: {e}")

    return {"sent": True, "type": body.type, "to": body.email}


# ══════════════════════════════════════════════════════════
# Settings — clear analytics / delete account
# ══════════════════════════════════════════════════════════
# Premium plan
# ══════════════════════════════════════════════════════════

@app.get("/users/{user_id}/ai-usage")
def get_ai_usage(user_id: str):
    from datetime import date
    today = date.today().isoformat()
    prefs = supabase.table("user_preferences").select("*").eq("user_id", user_id).maybe_single().execute().data
    is_premium = bool(prefs and prefs.get("is_premium"))
    calls_today = (prefs.get("daily_ai_calls", 0) if prefs and prefs.get("ai_calls_date") == today else 0) if prefs else 0
    return {
        "is_premium":  is_premium,
        "calls_today": calls_today,
        "limit":       None if is_premium else FREE_DAILY_LIMIT,
    }


@app.post("/users/{user_id}/upgrade")
def upgrade_user(user_id: str):
    try:
        existing = supabase.table("user_preferences").select("user_id").eq("user_id", user_id).maybe_single().execute().data
        if existing:
            supabase.table("user_preferences").update({"is_premium": True}).eq("user_id", user_id).execute()
        else:
            supabase.table("user_preferences").insert({
                "user_id":             user_id,
                "is_premium":          True,
                "deadline_reminders":  False,
                "daily_reminder":      False,
                "streak_alerts":       False,
            }).execute()
        return {"upgraded": True}
    except Exception as e:
        raise HTTPException(500, f"Upgrade failed: {e}")


@app.post("/users/{user_id}/cancel-subscription")
def cancel_subscription(user_id: str):
    try:
        existing = supabase.table("user_preferences").select("user_id").eq("user_id", user_id).maybe_single().execute().data
        if existing:
            supabase.table("user_preferences").update({"is_premium": False}).eq("user_id", user_id).execute()
        return {"cancelled": True}
    except Exception as e:
        raise HTTPException(500, f"Cancellation failed: {e}")


# ══════════════════════════════════════════════════════════

@app.delete("/users/{user_id}/analytics")
def clear_user_analytics(user_id: str):
    """Delete all pace, defer, and depth-check records for this user's sessions."""
    sessions = supabase.table("sessions").select("id").eq("user_id", user_id).execute().data
    if not sessions:
        return {"cleared": 0}

    session_ids = [s["id"] for s in sessions]
    supabase.table("pace_logs").delete().in_("session_id", session_ids).execute()
    supabase.table("defer_logs").delete().in_("session_id", session_ids).execute()
    supabase.table("depth_checks").delete().in_("session_id", session_ids).execute()
    return {"cleared": len(session_ids)}


@app.delete("/users/{user_id}")
def delete_user_account(user_id: str):
    """Permanently delete all user data and the Supabase auth account."""
    sessions = supabase.table("sessions").select("id").eq("user_id", user_id).execute().data
    session_ids = [s["id"] for s in sessions]

    if session_ids:
        supabase.table("pace_logs").delete().in_("session_id", session_ids).execute()
        supabase.table("defer_logs").delete().in_("session_id", session_ids).execute()
        supabase.table("depth_checks").delete().in_("session_id", session_ids).execute()
        supabase.table("topics").delete().in_("session_id", session_ids).execute()
        supabase.table("sessions").delete().eq("user_id", user_id).execute()

    supabase.auth.admin.delete_user(user_id)
    return {"deleted": user_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
