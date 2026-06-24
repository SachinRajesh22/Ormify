from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from groq import Groq
import chromadb
from chromadb.utils import embedding_functions
from sentence_transformers import SentenceTransformer
import fitz  # PyMuPDF
import uuid
import os
from datetime import datetime, timezone
from typing import Optional
import json

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── clients ──────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
GROQ_KEY     = os.environ["GROQ_API_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
_groq  = Groq(api_key=GROQ_KEY)
_MODEL = "llama-3.3-70b-versatile"

def _generate(prompt: str, system: str | None = None) -> str:
    msgs = ([{"role": "system", "content": system}] if system else []) + \
           [{"role": "user", "content": prompt}]
    return _groq.chat.completions.create(model=_MODEL, messages=msgs).choices[0].message.content

def _generate_json(prompt: str) -> str:
    msgs = [{"role": "user", "content": prompt}]
    return _groq.chat.completions.create(
        model=_MODEL, messages=msgs,
        response_format={"type": "json_object"},
    ).choices[0].message.content

def _chat(history: list, system: str | None = None) -> str:
    msgs = ([{"role": "system", "content": system}] if system else []) + history
    return _groq.chat.completions.create(model=_MODEL, messages=msgs).choices[0].message.content

# local embedding model — no API cost
embedder = SentenceTransformer("all-MiniLM-L6-v2")

# chroma — persists to disk
chroma_client = chromadb.PersistentClient(path="./chroma_store")


# ── helpers ───────────────────────────────────────────────

def get_or_create_collection(session_id: str):
    """One Chroma collection per session."""
    return chroma_client.get_or_create_collection(
        name=f"session_{session_id}",
    )


def embed(texts: list[str]) -> list[list[float]]:
    return embedder.encode(texts, convert_to_numpy=True).tolist()


def retrieve_chunks(session_id: str, query: str, n: int = 4) -> list[str]:
    col = get_or_create_collection(session_id)
    results = col.query(
        query_embeddings=embed([query]),
        n_results=min(n, col.count() or 1),
    )
    return results["documents"][0] if results["documents"] else []


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
    remaining_est = sum(t["estimated_hours"] for t in pending)
    projected = remaining_est * pace
    hours_left = hours_until_deadline(deadline_str)
    return {
        "pace_ratio": round(pace, 2),
        "remaining_estimated_hours": round(remaining_est, 2),
        "projected_hours_needed": round(projected, 2),
        "hours_until_deadline": round(hours_left, 2),
        "on_track": projected <= hours_left,
        "projection_message": (
            f"At your current pace (×{round(pace,2)}), "
            f"remaining topics will take ~{round(projected,1)}h "
            f"but you only have {round(hours_left,1)}h left."
            if projected > hours_left else
            f"You're on track. ~{round(projected,1)}h of work, "
            f"{round(hours_left,1)}h remaining."
        )
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


@app.post("/sessions/{session_id}/parse-syllabus")
async def parse_syllabus(session_id: str, file: UploadFile = File(None), raw_text: str = Form("")):
    try:
        # Step 1 — extract text
        if file:
            contents = await file.read()
            doc = fitz.open(stream=contents, filetype="pdf")
            raw_text = "\n".join(page.get_text() for page in doc)

        if not raw_text.strip():
            raise HTTPException(400, "No text provided")

        # Step 2 — chunk into sentences/paragraphs and store in Chroma
        chunks = [p.strip() for p in raw_text.split("\n\n") if len(p.strip()) > 40]
        col = get_or_create_collection(session_id)
        col.upsert(
            ids=[f"chunk_{i}" for i in range(len(chunks))],
            documents=chunks,
            embeddings=embed(chunks),
        )

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


# ══════════════════════════════════════════════════════════
# TASK 2 — Live Pace Tracker
# ══════════════════════════════════════════════════════════

class CompleteTopicBody(BaseModel):
    actual_minutes: int


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

    total_deferred_hours = sum(t["estimated_hours"] for t in deferred)
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


@app.post("/topics/{topic_id}/depth-check/start")
def depth_check_start(topic_id: str, body: DepthCheckStart):
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
        "pace_ratio": pace["pace_ratio"],
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
    ctx = get_session_context(session_id)
    rag_chunks = retrieve_chunks(session_id, body.message)
    rag_context = "\n\n".join(rag_chunks) if rag_chunks else ""

    system = f"""You are SocraBot, an always-on study assistant. Be concise and direct.

Current session status:
- Current topic: {ctx['current_topic'] or 'None set'}
- Pace ratio: {ctx['pace_ratio']} (1.0 = on estimate, >1.0 = slower than expected)
- Hours remaining until deadline: {ctx['hours_remaining']}
- Projected hours needed: {ctx['projected_hours_needed']}
- On track: {ctx['on_track']}
- Deferred topics: {ctx['deferred_count']}

Relevant curriculum context:
{rag_context}

Answer based on this real data. Never give generic responses."""

    history = body.conversation_history + [{"role": "user", "content": body.message}]

    reply = _chat(history, system)
    history.append({"role": "assistant", "content": reply})

    supabase.table("bubble_chat_logs").insert({
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "role": "assistant",
        "content": reply,
        "context_snapshot": ctx,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return {"reply": reply, "conversation_history": history}


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


# ── run ──────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)