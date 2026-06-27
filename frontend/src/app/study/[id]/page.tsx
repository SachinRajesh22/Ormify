"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useTheme } from "../../../lib/theme";

// ─── Types ───────────────────────────────────────────────────────────────────

type TopicStatus = "pending" | "in_progress" | "done" | "deferred";

interface Topic {
  id: string;
  name: string;
  estimated_hours: number;
  priority_order: number;
  status: TopicStatus;
}

interface PaceData {
  pace_ratio_avg: number;
  remaining_estimated_hours: number;
  hours_until_deadline: number;
  projection_string: string;
  on_track: "green" | "amber" | "red";
}

interface SessionData {
  id: string;
  title: string;
  deadline: string;
  feasibility_verdict: string | null;
}

interface ChallengeBrief {
  what_it_solves: string;
  must_explain: string[];
  watch_out: string;
}

interface StudyMaterial {
  overview: string;
  key_points: string[];
  explanation: string;
  examples: string[];
  exam_focus: string[];
}

interface VideoItem {
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
}

// MCQ depth check types
interface MCQQuestion {
  question: string;
  options: string[];        // always 3 options
  correct_index: number;    // 0 | 1 | 2
  explanation: string;      // shown after answer
}

interface MCQDepthResult {
  questions: MCQQuestion[];
  score: number;            // 0–3
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCountdown(deadlineISO: string): string {
  const diff = new Date(deadlineISO).getTime() - Date.now();
  if (diff <= 0) return "Deadline passed";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TopicStatus }) {
  const cfg: Record<TopicStatus, { label: string; cls: string }> = {
    pending:     { label: "Pending",     cls: "bg-gray-100 text-gray-500" },
    in_progress: { label: "In Progress", cls: "bg-blue-100 text-blue-600" },
    done:        { label: "Done",        cls: "bg-emerald-100 text-emerald-700" },
    deferred:    { label: "Deferred",    cls: "bg-red-100 text-red-500" },
  };
  const { label, cls } = cfg[status];
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0 ${cls}`}>
      {label}
    </span>
  );
}

function ReadinessScore({ score }: { score: number }) {
  const cfg =
    score >= 3 ? { cls: "bg-emerald-100 text-emerald-700", label: "Strong" } :
    score === 2 ? { cls: "bg-amber-100 text-amber-700", label: "Moderate" } :
                  { cls: "bg-red-100 text-red-600", label: "Weak" };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function PaceBar({ on_track }: { on_track: "green" | "amber" | "red" }) {
  const map = {
    green: { label: "On track",       color: "text-emerald-600", dot: "bg-emerald-500" },
    amber: { label: "Slightly behind", color: "text-amber-600",  dot: "bg-amber-500"  },
    red:   { label: "Behind",          color: "text-red-600",    dot: "bg-red-500"    },
  };
  const { label, color, dot } = map[on_track];
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

// ─── MCQ Depth Check Modal ───────────────────────────────────────────────────
// Single API call → get 3 MCQ questions → user picks → instant scored result.
// No open-text, no multi-round exchange — minimal tokens, fast UX.

interface MCQDepthCheckProps {
  topicId: string;
  topicName: string;
  onClose: () => void;
  onComplete?: (score: number) => void;
}

function DepthCheckModal({ topicId, topicName, onClose, onComplete }: MCQDepthCheckProps) {
  const [phase, setPhase]             = useState<"loading" | "quiz" | "result">("loading");
  const [questions, setQuestions]     = useState<MCQQuestion[]>([]);
  const [current, setCurrent]         = useState(0);
  const [selected, setSelected]       = useState<number | null>(null);
  const [revealed, setRevealed]       = useState(false);
  const [answers, setAnswers]         = useState<number[]>([]);   // chosen index per question
  const [score, setScore]             = useState<number | null>(null);
  const [error, setError]             = useState(false);

  // Fetch all 3 MCQ questions in one shot on mount
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/topics/${topicId}/depth-check/mcq`, { method: "POST" })
      .then(r => r.json())
      .then((data: MCQDepthResult) => {
        if (cancelled) return;
        setQuestions(data.questions);
        setPhase("quiz");
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [topicId]);

  function handleSelect(idx: number) {
    if (revealed) return;
    setSelected(idx);
  }

  function handleReveal() {
    if (selected === null) return;
    setRevealed(true);
  }

  async function handleNext() {
    if (selected === null) return;
    const nextAnswers = [...answers, selected];
    setAnswers(nextAnswers);

    if (current < questions.length - 1) {
      setCurrent(c => c + 1);
      setSelected(null);
      setRevealed(false);
    } else {
      // All questions answered — compute score locally, save to backend
      const correctCount = nextAnswers.filter(
        (ans, i) => ans === questions[i].correct_index
      ).length;
      setScore(correctCount);
      setPhase("result");
      // Save score (fire-and-forget, non-blocking)
      fetch(`${API_BASE}/topics/${topicId}/depth-check/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: correctCount, mode: "mcq" }),
      }).catch(() => {/* silent */});
      onComplete?.(correctCount);
    }
  }

  const q = questions?.[current];
  const isCorrect = revealed && selected !== null && selected === q?.correct_index;

  const scoreLabel =
    score === null ? null
    : score === 3 ? { cls: "bg-emerald-100 text-emerald-700", label: "Strong",  sub: "3/3 correct" }
    : score === 2 ? { cls: "bg-amber-100 text-amber-700",   label: "Moderate", sub: "2/3 correct" }
    : score === 1 ? { cls: "bg-orange-100 text-orange-700", label: "Shaky",    sub: "1/3 correct" }
    :               { cls: "bg-red-100 text-red-600",       label: "Weak",     sub: "0/3 correct" };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="orm-panel orm-panel-violet rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">

        {/* Header — always has a close button */}
        <div className="px-6 py-5 border-b border-zinc-200/70 dark:border-white/10 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500 font-medium mb-1">
              Depth check · {topicName}
            </p>
            {phase === "quiz" && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Question {current + 1} of {questions.length}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Loading */}
          {phase === "loading" && !error && (
            <div className="space-y-3 py-4">
              <div className="h-4 bg-zinc-200 dark:bg-white/10 rounded animate-pulse w-3/4" />
              <div className="h-4 bg-zinc-200 dark:bg-white/10 rounded animate-pulse w-full" />
              <div className="h-4 bg-zinc-200 dark:bg-white/10 rounded animate-pulse w-2/3" />
              <p className="text-xs text-gray-400 dark:text-gray-500 pt-2 text-center">Generating questions…</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="py-4 text-center space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Could not load questions. Check your backend connection.
              </p>
              <button
                onClick={onClose}
                className="text-sm text-purple-600 dark:text-purple-400 hover:underline"
              >
                Close
              </button>
            </div>
          )}

          {/* Quiz */}
          {phase === "quiz" && q && (
            <>
              {/* Progress bar */}
              <div className="h-1 bg-zinc-200 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#7B61FF] rounded-full transition-all duration-300 shadow-[0_0_14px_rgba(123,97,255,0.8)]"
                  style={{ width: `${((current) / questions.length) * 100}%` }}
                />
              </div>

              {/* Question */}
              <p className="text-sm font-medium text-gray-900 dark:text-white leading-relaxed">
                {q.question}
              </p>

              {/* Options */}
              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const isSelected  = selected === i;
                  const isRight     = i === q.correct_index;
                  let cls = "border border-zinc-200 dark:border-white/15 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5";
                  if (revealed) {
                    if (isRight)           cls = "border border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200";
                    else if (isSelected)   cls = "border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300";
                    else                   cls = "border border-gray-100 dark:border-white/10 text-gray-400 dark:text-gray-600";
                  } else if (isSelected) {
                    cls = "border-2 border-[#7B61FF] bg-[#7B61FF]/10 text-[#7B61FF] dark:text-purple-100";
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelect(i)}
                      disabled={revealed}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${cls}`}
                    >
                      <span className="font-mono text-[11px] mr-2 opacity-50">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* Explanation (shown after reveal) */}
              {revealed && (
                <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  isCorrect
                    ? "bg-emerald-50 dark:bg-emerald-900/15 text-emerald-800 dark:text-emerald-200"
                    : "bg-red-50 dark:bg-red-900/15 text-red-800 dark:text-red-200"
                }`}>
                  <span className="font-semibold">{isCorrect ? "Correct! " : "Not quite. "}</span>
                  {q.explanation}
                </div>
              )}

              {/* Action buttons */}
              {!revealed ? (
                <button
                  onClick={handleReveal}
                  disabled={selected === null}
                  className="orm-primary w-full rounded-xl py-3 text-sm font-medium disabled:opacity-40 transition"
                >
                  Check answer
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="orm-primary w-full rounded-xl py-3 text-sm font-medium transition"
                >
                  {current < questions.length - 1 ? "Next question →" : "See results →"}
                </button>
              )}
            </>
          )}

          {/* Result */}
          {phase === "result" && scoreLabel && score !== null && (
            <div className="space-y-4">
              {/* Score badge */}
              <div className="flex items-center gap-3 p-4 bg-zinc-100 dark:bg-white/5 rounded-xl">
                <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${scoreLabel.cls}`}>
                  {scoreLabel.label}
                </span>
                <p className="text-sm text-gray-600 dark:text-gray-300">{scoreLabel.sub}</p>
              </div>

              {/* Per-question recap */}
              <div className="space-y-2">
                {questions.map((qn, i) => {
                  const wasCorrect = answers[i] === qn.correct_index;
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm ${
                        wasCorrect
                          ? "bg-emerald-50 dark:bg-emerald-900/10 text-emerald-800 dark:text-emerald-200"
                          : "bg-red-50 dark:bg-red-900/10 text-red-800 dark:text-red-200"
                      }`}
                    >
                      <span className="flex-shrink-0 font-bold">{wasCorrect ? "✓" : "✗"}</span>
                      <p className="leading-snug">{qn.question}</p>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={onClose}
                className="orm-primary w-full rounded-xl py-3 text-sm font-medium transition"
              >
                Continue studying →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StudyPage() {
  const params    = useParams();
  const router    = useRouter();
  const sessionId = params?.id as string;
  const { theme } = useTheme();
  // isDark retained here for potential future use; suppressed lint with comment
  const _isDark = theme === "dark"; void _isDark;

  const [email,   setEmail]   = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [topics,  setTopics]  = useState<Topic[]>([]);
  const [pace,    setPace]    = useState<PaceData | null>(null);

  const [activeTopicId,   setActiveTopicId]   = useState<string | null>(null);
  const [timerSeconds,    setTimerSeconds]    = useState(0);
  const [timerRunning,    setTimerRunning]    = useState(false);
  const [depthCheckTopic, setDepthCheckTopic] = useState<Topic | null>(null);
  const [depthScores,     setDepthScores]     = useState<Record<string, number>>({});
  const [briefs,          setBriefs]          = useState<Record<string, ChallengeBrief | "loading" | "error">>({});
  const [studyMaterials,  setStudyMaterials]  = useState<Record<string, StudyMaterial | "loading" | "error">>({});
  const [videos,          setVideos]          = useState<Record<string, VideoItem[]>>({});
  const [materialExpanded, setMaterialExpanded] = useState(true);
  const [loading,  setLoading]  = useState(true);
  const [deferToast, setDeferToast] = useState(false);
  const [markDoneLoading, setMarkDoneLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setEmail(data.user.email ?? null);
      else router.push("/login");
    });
  }, [router]);

  // ── Fetch session + topics + pace ────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [sessRes, topicsRes, paceRes, scoresRes] = await Promise.all([
        fetch(`${API_BASE}/sessions/${sessionId}`),
        fetch(`${API_BASE}/sessions/${sessionId}/topics`),
        fetch(`${API_BASE}/sessions/${sessionId}/pace`),
        fetch(`${API_BASE}/sessions/${sessionId}/depth-scores`),
      ]);
      const sessData: SessionData     = await sessRes.json();
      const topicsData: Topic[]       = await topicsRes.json();
      const paceData: PaceData        = await paceRes.json();
      const scoresData: Record<string, number> = scoresRes.ok ? await scoresRes.json() : {};

      setDepthScores((prev) => ({ ...prev, ...scoresData }));
      setSession(sessData);
      const sorted = [...topicsData].sort((a, b) => a.priority_order - b.priority_order);
      setTopics(sorted);
      setPace(paceData);

      setActiveTopicId((prev) => {
        if (prev) return prev;
        const first = sorted.find((t) => t.status === "pending" || t.status === "in_progress");
        return first?.id ?? null;
      });
    } catch {
      // backend not reachable — silent
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    void Promise.resolve().then(fetchAll);
  }, [sessionId, fetchAll]);

  // ── Challenge Brief + Study Material ─────────────────────────────────────
  useEffect(() => {
    if (!activeTopicId) return;
    if (!briefs[activeTopicId]) {
      void Promise.resolve().then(() => {
        setBriefs((prev) => ({ ...prev, [activeTopicId]: "loading" }));
        fetch(`${API_BASE}/topics/${activeTopicId}/challenge-brief`)
          .then((r) => r.json())
          .then((data) => setBriefs((prev) => ({ ...prev, [activeTopicId]: data })))
          .catch(() => setBriefs((prev) => ({ ...prev, [activeTopicId]: "error" })));
      });
    }
    if (!studyMaterials[activeTopicId]) {
      void Promise.resolve().then(() => {
        setStudyMaterials((prev) => ({ ...prev, [activeTopicId]: "loading" }));
        fetch(`${API_BASE}/topics/${activeTopicId}/study-material`)
          .then((r) => r.json())
          .then((data) => setStudyMaterials((prev) => ({ ...prev, [activeTopicId]: data })))
          .catch(() => setStudyMaterials((prev) => ({ ...prev, [activeTopicId]: "error" })));
      });
    }
  }, [activeTopicId, briefs, studyMaterials]);

  // ── Topic Videos ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTopicId || videos[activeTopicId]) return;
    fetch(`${API_BASE}/topics/${activeTopicId}/videos`)
      .then((r) => r.json())
      .then((data) => setVideos((prev) => ({ ...prev, [activeTopicId]: data.videos ?? [] })))
      .catch(() => {});
  }, [activeTopicId, videos]);

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  function handleTopicSwitch(topicId: string) {
    setActiveTopicId(topicId);
    setTimerSeconds(0);
    setTimerRunning(false);
  }

  // ── Mark Done — auto-uses timer, no modal needed ──────────────────────────
  async function markDone() {
    if (!activeTopicId || markDoneLoading) return;
    setTimerRunning(false);
    setMarkDoneLoading(true);

    // Use timer seconds directly; convert to minutes (minimum 1)
    const minutes = Math.max(1, Math.round(timerSeconds / 60));

    try {
      await fetch(`${API_BASE}/topics/${activeTopicId}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual_minutes: minutes }),
      });
      const doneTopic = topics.find((t) => t.id === activeTopicId);
      await fetchAll();
      setTimerSeconds(0);
      if (doneTopic) setDepthCheckTopic(doneTopic);
    } catch {
      // backend failed — still reset timer locally
      setTimerSeconds(0);
    } finally {
      setMarkDoneLoading(false);
    }
  }

  // ── Defer ─────────────────────────────────────────────────────────────────
  async function deferTopic() {
    if (!activeTopicId) return;
    try {
      await fetch(`${API_BASE}/topics/${activeTopicId}/defer`, { method: "PATCH" });
      setTimerRunning(false);
      setTimerSeconds(0);
      setDeferToast(true);
      setTimeout(() => setDeferToast(false), 3000);
      await fetchAll();
      const next = topics.find(
        (t) => t.id !== activeTopicId && (t.status === "pending" || t.status === "in_progress")
      );
      if (next) setActiveTopicId(next.id);
    } catch {
      // silent
    }
  }

  const activeTopic    = topics.find((t) => t.id === activeTopicId) || null;
  const pendingCount   = topics.filter((t) => t.status === "pending" || t.status === "in_progress").length;
  const doneCount      = topics.filter((t) => t.status === "done").length;
  const deferredCount  = topics.filter((t) => t.status === "deferred").length;

  if (loading) {
    return (
      <div className="orm-bg min-h-screen flex items-center justify-center">
        <div className="orm-panel orm-panel-violet rounded-2xl px-6 py-5 text-zinc-400 text-sm">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="orm-bg min-h-screen flex flex-col text-zinc-950 dark:text-white">

      {/* ── Top nav ─────────────────────────────────────────────────────────── */}
      <header className="h-16 bg-white/75 dark:bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-zinc-200/70 dark:border-white/10 flex items-center justify-between px-5 flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          {session?.title && (
            <span className="font-semibold text-sm text-zinc-950 dark:text-white truncate max-w-[240px]">
              {session.title}
            </span>
          )}
          {session?.deadline && (
            <span className="text-xs text-zinc-500 dark:text-zinc-300 bg-zinc-100 dark:bg-white/10 px-3 py-1 rounded-full font-medium">
              {formatCountdown(session.deadline)} left
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{email ?? ""}</span>
          <button
            onClick={() => router.push("/dashboard")}
            className="orm-ghost text-xs px-3 py-2 rounded-lg transition"
          >
            Dashboard
          </button>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-white/15 px-3 py-2 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <aside className="w-72 bg-[#0f0f0f] border-r border-white/10 flex flex-col flex-shrink-0 overflow-hidden text-white">
          {/* Pace health strip */}
          <div className="px-4 py-4 border-b border-white/10">
            {pace ? (
              <PaceBar on_track={pace.on_track} />
            ) : (
              <div className="text-xs text-zinc-500">Loading pace...</div>
            )}
            <div className="mt-3 flex gap-3 text-xs text-zinc-500">
              <span>{doneCount} done</span>
              {deferredCount > 0 && <span>{deferredCount} deferred</span>}
              <span>{pendingCount} left</span>
            </div>
          </div>

          {/* Topics list */}
          <div className="flex-1 overflow-y-auto py-2">
            <p className="px-4 pb-2 text-[10px] uppercase tracking-widest text-zinc-600 font-medium">
              Topics · {topics.length}
            </p>
            {topics.map((topic, i) => (
              <div
                key={topic.id}
                onClick={() => handleTopicSwitch(topic.id)}
                className={`group relative px-3 py-2.5 cursor-pointer transition-colors border-r-2 ${
                  topic.id === activeTopicId
                    ? "bg-[#7B61FF]/15 border-[#7B61FF]"
                    : "hover:bg-white/5 border-transparent"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-zinc-600 font-mono mt-0.5 w-4 flex-shrink-0">
                    {i + 1}.
                  </span>
                  <div className="flex-1 min-w-0 pr-7">
                    <p className={`text-[13px] leading-snug ${
                      topic.id === activeTopicId
                        ? "text-purple-200 font-semibold"
                        : "text-zinc-300"
                    } ${topic.status === "deferred" ? "line-through text-zinc-600" : ""}`}>
                      {topic.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <StatusBadge status={topic.status} />
                      <span className="text-[9px] text-zinc-600">~{topic.estimated_hours}h</span>
                      {depthScores[topic.id] != null && (
                        <ReadinessScore score={depthScores[topic.id]} />
                      )}
                    </div>
                  </div>
                </div>
                {/* Quiz button — visible on hover */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDepthCheckTopic(topic); }}
                  title="Check readiness"
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-[10px] bg-[#7B61FF]/25 text-purple-100 px-2 py-1 rounded-full font-semibold transition-opacity hover:bg-[#7B61FF]/40"
                >
                  Quiz
                </button>
              </div>
            ))}
          </div>

          {/* Graveyard link */}
          {deferredCount > 0 && (
            <div className="border-t border-white/10 p-3">
              <button
                onClick={() => router.push(`/graveyard/${sessionId}`)}
                className="w-full flex items-center gap-2 text-xs text-red-400 hover:text-red-300 font-medium"
              >
                <span>{deferredCount} deferred — view graveyard →</span>
              </button>
            </div>
          )}
        </aside>

        {/* ── Main area ────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Pace projection banner */}
          {pace && (
            <div
              className={`orm-panel rounded-xl px-4 py-3 text-sm font-medium ${
                pace.on_track === "green"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : pace.on_track === "amber"
                  ? "orm-panel-amber text-amber-700 dark:text-amber-300"
                  : "orm-panel-red text-red-700 dark:text-red-300"
              }`}
            >
              {pace.projection_string}
            </div>
          )}

          {/* Active topic card */}
          {activeTopic ? (
            <div className="orm-panel rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-200/70 dark:border-white/10">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-medium mb-1">
                      Active topic
                    </p>
                    <h2 className="text-xl font-semibold text-zinc-950 dark:text-white">{activeTopic.name}</h2>
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-white/5 px-2.5 py-1 rounded-full">
                    ~{activeTopic.estimated_hours}h estimated
                  </span>
                </div>
              </div>

              {/* Challenge Brief */}
              {(() => {
                const brief = activeTopicId ? briefs[activeTopicId] : undefined;
                if (!brief || brief === "error") return null;
                if (brief === "loading") return (
                  <div className="px-6 py-4 border-b border-zinc-200/70 dark:border-white/10">
                    <p className="text-xs uppercase tracking-widest text-purple-400 font-medium mb-2">Challenge brief</p>
                    <div className="space-y-2">
                      <div className="h-3 bg-zinc-200 dark:bg-white/10 rounded animate-pulse w-3/4" />
                      <div className="h-3 bg-zinc-200 dark:bg-white/10 rounded animate-pulse w-1/2" />
                    </div>
                  </div>
                );
                return (
                  <div className="px-6 py-4 border-b border-zinc-200/70 dark:border-white/10 bg-[#7B61FF]/10">
                    <p className="text-xs uppercase tracking-widest text-purple-500 dark:text-purple-400 font-semibold mb-3">
                      Challenge brief
                    </p>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-medium mb-1">
                          What this solves
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{brief.what_it_solves}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-medium mb-1.5">
                          You must be able to explain
                        </p>
                        <ul className="space-y-1">
                          {brief.must_explain.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                              <span className="text-purple-400 font-bold mt-0.5">·</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase tracking-widest text-amber-500 dark:text-amber-400 font-semibold mb-0.5">
                          Watch out
                        </p>
                        <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">{brief.watch_out}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {activeTopicId && videos[activeTopicId]?.length > 0 && (
                <div className="px-6 py-4 border-b border-gray-50 dark:border-white/10">
                  <p className="text-xs uppercase tracking-widest text-red-500 font-semibold mb-3">
                    Watch first
                  </p>
                  <div className="flex flex-col gap-3">
                    {videos[activeTopicId].map((v, i) => (
                      <a
                        key={i}
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-white/10 p-2 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <Image
                          src={v.thumbnail}
                          alt={v.title}
                          width={96}
                          height={56}
                          unoptimized
                          className="w-24 h-14 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug">
                            {v.title}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{v.channel}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Study Material */}
              {(() => {
                const mat = activeTopicId ? studyMaterials[activeTopicId] : undefined;
                if (!mat || mat === "error") return null;
                const isLoading = mat === "loading";
                return (
                  <div className="border-b border-zinc-200/70 dark:border-white/10">
                    <button
                      onClick={() => setMaterialExpanded((e) => !e)}
                      className="w-full px-6 py-3 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <span className="text-xs uppercase tracking-widest text-indigo-500 dark:text-indigo-400 font-semibold">
                        Study material
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 text-sm font-medium">
                        {materialExpanded ? "−" : "+"}
                      </span>
                    </button>

                    {materialExpanded && (
                      <div className="px-6 pb-5 space-y-4">
                        {isLoading ? (
                          <div className="space-y-2 pt-1">
                            {[0.9, 0.7, 0.85, 0.6].map((w, i) => (
                              <div
                                key={i}
                                className="h-3 bg-zinc-200 dark:bg-white/10 rounded animate-pulse"
                                style={{ width: `${w * 100}%` }}
                              />
                            ))}
                          </div>
                        ) : (
                          <>
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed pt-1">{mat.overview}</p>
                            {mat.key_points.length > 0 && (
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-semibold mb-2">
                                  Key points
                                </p>
                                <ul className="space-y-1.5">
                                  {mat.key_points.map((pt, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                                      <span className="text-indigo-400 font-bold mt-0.5 flex-shrink-0">·</span>
                                      {pt}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {mat.explanation && (
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-semibold mb-2">
                                  Explanation
                                </p>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                                  {mat.explanation}
                                </p>
                              </div>
                            )}
                            {mat.examples.length > 0 && (
                              <div className="bg-indigo-50 dark:bg-indigo-900/15 rounded-xl p-4">
                                <p className="text-[10px] uppercase tracking-widest text-indigo-500 dark:text-indigo-400 font-semibold mb-2">
                                  Real-world examples
                                </p>
                                <ul className="space-y-1.5">
                                  {mat.examples.map((ex, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-indigo-900 dark:text-indigo-200">
                                      <span className="font-bold text-indigo-400 flex-shrink-0">{i + 1}.</span>
                                      {ex}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {mat.exam_focus.length > 0 && (
                              <div className="bg-emerald-50 dark:bg-emerald-900/15 rounded-xl p-4">
                                <p className="text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-semibold mb-2">
                                  Exam focus
                                </p>
                                <ul className="space-y-1.5">
                                  {mat.exam_focus.map((ef, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-emerald-900 dark:text-emerald-200">
                                      <span className="text-emerald-500 font-bold flex-shrink-0">→</span>
                                      {ef}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Timer */}
              <div className="px-6 py-5 border-b border-zinc-200/70 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">Time on this topic</p>
                    <p className="text-3xl font-mono font-bold text-zinc-950 dark:text-white tracking-tight">
                      {formatTimer(timerSeconds)}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const starting = !timerRunning;
                      setTimerRunning(starting);
                      if (starting && activeTopicId) {
                        const t = topics.find((x) => x.id === activeTopicId);
                        if (t?.status === "pending") {
                          fetch(`${API_BASE}/topics/${activeTopicId}/start`, { method: "PATCH" })
                            .then(() => fetchAll());
                        }
                      }
                    }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      timerRunning
                        ? "bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/15"
                        : "orm-primary"
                    }`}
                  >
                    {timerRunning ? "Pause" : "Start timer"}
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <div className="px-6 py-4 flex gap-3">
                <button
                  onClick={markDone}
                  disabled={markDoneLoading}
                  className="flex-1 rounded-xl bg-[#10CFA8] py-3 text-sm font-semibold text-white shadow-[0_0_18px_rgba(16,207,168,0.35)] transition hover:opacity-90 disabled:opacity-60"
                >
                  {markDoneLoading ? "Saving…" : "Mark done"}
                </button>
                <button
                  onClick={deferTopic}
                  className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500/15"
                >
                  Defer
                </button>
                <button
                  onClick={() => activeTopic && setDepthCheckTopic(activeTopic)}
                  className="orm-ghost flex-1 rounded-xl py-3 text-sm font-semibold transition"
                >
                  Check readiness
                </button>
              </div>

              {/* Readiness score row */}
              {activeTopic && depthScores[activeTopic.id] != null && (
                <div className="px-6 pb-4">
                  <div className="rounded-xl bg-zinc-100 dark:bg-white/5 px-4 py-2.5 flex items-center gap-3">
                    <ReadinessScore score={depthScores[activeTopic.id]} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Last readiness check result</span>
                    <button
                      onClick={() => activeTopic && setDepthCheckTopic(activeTopic)}
                      className="ml-auto text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium"
                    >
                      Re-check →
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* All done / empty state */
            <div className="orm-panel orm-panel-violet rounded-2xl px-6 py-12 text-center">
              <p className="text-gray-600 dark:text-gray-300 font-medium">All topics done or deferred.</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Check the graveyard or view your report.</p>
              <div className="flex gap-3 justify-center mt-5">
                <button
                  onClick={() => router.push(`/report/${sessionId}`)}
                  className="orm-primary rounded-xl px-4 py-2.5 text-sm font-medium"
                >
                  View honest report →
                </button>
                {deferredCount > 0 && (
                  <button
                    onClick={() => router.push(`/graveyard/${sessionId}`)}
                    className="orm-ghost rounded-xl px-4 py-2.5 text-sm"
                  >
                    Graveyard →
                  </button>
                )}
                <button
                  onClick={() => router.push("/dashboard")}
                  className="orm-ghost rounded-xl px-4 py-2.5 text-sm"
                >
                  ← Dashboard
                </button>
              </div>
            </div>
          )}

          {/* Session progress overview */}
          <div className="orm-panel rounded-2xl p-5">
            <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500 font-medium mb-3">
              Session progress
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-[#10CFA8]/10 rounded-xl">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{doneCount}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Done</p>
              </div>
              <div className="text-center p-3 bg-zinc-100 dark:bg-white/5 rounded-xl">
                <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{pendingCount}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Remaining</p>
              </div>
              <div className="text-center p-3 bg-red-500/10 rounded-xl">
                <p className="text-2xl font-bold text-red-500 dark:text-red-400">{deferredCount}</p>
                <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">Deferred</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1.5">
                <span>Overall</span>
                <span>{topics.length > 0 ? Math.round((doneCount / topics.length) * 100) : 0}%</span>
              </div>
              <div className="h-2 bg-zinc-200 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#10CFA8] rounded-full transition-all duration-500 shadow-[0_0_14px_rgba(16,207,168,0.7)]"
                  style={{ width: topics.length > 0 ? `${(doneCount / topics.length) * 100}%` : "0%" }}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Modals & overlays ────────────────────────────────────────────────── */}

      {depthCheckTopic && (
        <DepthCheckModal
          topicId={depthCheckTopic.id}
          topicName={depthCheckTopic.name}
          onComplete={(score) =>
            setDepthScores((prev) => ({ ...prev, [depthCheckTopic.id]: score }))
          }
          onClose={() => {
            setDepthCheckTopic(null);
            fetchAll();
          }}
        />
      )}

      {deferToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-950 text-white text-sm px-4 py-2.5 rounded-xl z-50 shadow-lg border border-white/10">
          Added to graveyard. We&apos;ll remind you.
        </div>
      )}

    </div>
  );
}
