"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ThemeToggle } from "../../../components/ThemeToggle";
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
  feasibility_verdict: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

function StatusDot({ status }: { status: TopicStatus }) {
  const map: Record<TopicStatus, string> = {
    pending: "bg-gray-300",
    in_progress: "bg-blue-500",
    done: "bg-emerald-500",
    deferred: "bg-red-500",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${map[status]}`}
    />
  );
}

function PaceBar({ on_track }: { on_track: "green" | "amber" | "red" }) {
  const map = {
    green: { label: "On track", color: "text-emerald-600", dot: "bg-emerald-500" },
    amber: { label: "Slightly behind", color: "text-amber-600", dot: "bg-amber-500" },
    red: { label: "Behind", color: "text-red-600", dot: "bg-red-500" },
  };
  const { label, color, dot } = map[on_track];
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

// ─── Depth Check Modal ───────────────────────────────────────────────────────

interface DepthCheckProps {
  topicId: string;
  topicName: string;
  onClose: () => void;
}

function DepthCheckModal({ topicId, topicName, onClose }: DepthCheckProps) {
  const [phase, setPhase] = useState<"input" | "exchange" | "result">("input");
  const [explanation, setExplanation] = useState("");
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [userResponse, setUserResponse] = useState("");
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function startCheck() {
    if (!explanation.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/topics/${topicId}/depth-check/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_explanation: explanation }),
      });
      const data = await res.json();
      setCurrentQuestion(data.question);
      setConversation([{ role: "user", content: explanation }, { role: "assistant", content: data.question }]);
      setPhase("exchange");
    } catch {
      // handle gracefully — keep modal open
    } finally {
      setLoading(false);
    }
  }

  async function respond() {
    if (!userResponse.trim()) return;
    setLoading(true);
    const newConversation: ChatMessage[] = [...conversation, { role: "user", content: userResponse }];
    try {
      const res = await fetch(`${API_BASE}/topics/${topicId}/depth-check/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_response: userResponse, conversation_history: newConversation }),
      });
      const data = await res.json();
      const nextLevel = level + 1;
      setLevel(nextLevel);
      setConversation([...newConversation, { role: "assistant", content: data.question || data.reveal }]);
      setUserResponse("");

      if (data.complete || nextLevel > 3) {
        // save and show result
        await fetch(`${API_BASE}/topics/${topicId}/depth-check/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level_reached: nextLevel,
            score: data.score,
            conversation_history: [...newConversation, { role: "assistant", content: data.reveal || data.question }],
          }),
        });
        setScore(data.score);
        setCurrentQuestion(data.reveal || data.question);
        setPhase("result");
      } else {
        setCurrentQuestion(data.question);
      }
    } catch {
      // keep open
    } finally {
      setLoading(false);
    }
  }

  const scoreLabel =
    score === null ? null
    : score >= 3 ? { emoji: "🟢", label: "Strong", sub: "Resolved at level 1" }
    : score === 2 ? { emoji: "🟡", label: "Moderate", sub: "Needed level 2" }
    : { emoji: "🔴", label: "Surface only", sub: "Gap revealed at level 3" };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <p className="text-xs uppercase tracking-widest text-gray-400 font-medium mb-1">Depth check</p>
          <h2 className="text-lg font-semibold text-gray-900">
            You just finished <span className="text-purple-600">{topicName}</span>. How well did you actually get it?
          </h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          {phase === "input" && (
            <>
              <p className="text-sm text-gray-600">Explain it in your own words. Don't look at your notes.</p>
              <textarea
                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 h-32"
                placeholder="Write your explanation here..."
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
              <button
                onClick={startCheck}
                disabled={loading || !explanation.trim()}
                className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Thinking..." : "Submit →"}
              </button>
            </>
          )}

          {phase === "exchange" && (
            <>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">
                <span className="text-xs text-purple-500 font-medium block mb-1">Level {level}</span>
                {currentQuestion}
              </div>
              <textarea
                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 h-24"
                placeholder="Your answer..."
                value={userResponse}
                onChange={(e) => setUserResponse(e.target.value)}
              />
              <button
                onClick={respond}
                disabled={loading || !userResponse.trim()}
                className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Thinking..." : "Respond →"}
              </button>
            </>
          )}

          {phase === "result" && scoreLabel && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">
                {currentQuestion}
              </div>
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                <span className="text-2xl">{scoreLabel.emoji}</span>
                <div>
                  <p className="font-semibold text-gray-900">{scoreLabel.label}</p>
                  <p className="text-xs text-gray-500">{scoreLabel.sub}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-purple-700 transition-colors"
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

// ─── SocraBot Bubble ─────────────────────────────────────────────────────────

function SocraBotBubble({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hey! Ask me anything — your pace, a concept, what to study next." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: input };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/bubble/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, conversation_history: updated }),
      });
      const data = await res.json();
      setMessages([...updated, { role: "assistant", content: data.response }]);
    } catch {
      setMessages([...updated, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-40 flex flex-col overflow-hidden" style={{ height: "420px" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-purple-600">
            <div className="flex items-center gap-2">
              <span className="text-white text-lg">🤖</span>
              <span className="text-white font-semibold text-sm">SocraBot</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-purple-200 hover:text-white text-lg leading-none">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] text-sm px-3 py-2 rounded-xl leading-relaxed ${
                    m.role === "user"
                      ? "bg-purple-600 text-white rounded-br-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-400 text-sm px-3 py-2 rounded-xl rounded-bl-sm">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="border-t border-gray-100 p-2 flex gap-2">
            <input
              className="flex-1 text-sm bg-gray-50 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="Ask anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button
              onClick={send}
              disabled={loading}
              className="bg-purple-600 text-white rounded-lg px-3 text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              →
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 w-12 h-12 bg-purple-600 text-white rounded-full shadow-lg flex items-center justify-center text-xl hover:bg-purple-700 transition-all z-40 hover:scale-105"
      >
        🤖
      </button>
    </>
  );
}

// ─── Mark Done Modal ──────────────────────────────────────────────────────────

interface MarkDoneModalProps {
  timerSeconds: number;
  onConfirm: (minutes: number) => void;
  onCancel: () => void;
}

function MarkDoneModal({ timerSeconds, onConfirm, onCancel }: MarkDoneModalProps) {
  const [minutes, setMinutes] = useState(Math.round(timerSeconds / 60));
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">How long did this actually take?</h3>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <span className="text-sm text-gray-500">minutes</span>
        </div>
        <p className="text-xs text-gray-400">Timer was at {formatTimer(timerSeconds)}</p>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(minutes)}
            className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-emerald-700"
          >
            Confirm done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StudyPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.id as string;
  const { theme } = useTheme();
const isDark = theme === "dark";

const [email, setEmail] = useState<string | null>(null);

  const [session, setSession] = useState<SessionData | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [pace, setPace] = useState<PaceData | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [showMarkDone, setShowMarkDone] = useState(false);
  const [depthCheckTopic, setDepthCheckTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [deferToast, setDeferToast] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch session + topics + pace ────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [sessRes, topicsRes, paceRes] = await Promise.all([
        fetch(`${API_BASE}/sessions/${sessionId}`),
        fetch(`${API_BASE}/sessions/${sessionId}/topics`),
        fetch(`${API_BASE}/sessions/${sessionId}/pace`),
      ]);
      const sessData: SessionData = await sessRes.json();
      const topicsData: Topic[] = await topicsRes.json();
      const paceData: PaceData = await paceRes.json();

      setSession(sessData);
      const sorted = [...topicsData].sort((a, b) => a.priority_order - b.priority_order);
      setTopics(sorted);
      setPace(paceData);

      // auto-set active topic = first pending/in_progress
      if (!activeTopicId) {
        const first = sorted.find((t) => t.status === "pending" || t.status === "in_progress");
        if (first) setActiveTopicId(first.id);
      }
    } catch {
      // backend not reachable yet — silent
    } finally {
      setLoading(false);
    }
  }, [sessionId, activeTopicId]);

  useEffect(() => {
    if (sessionId) fetchAll();
  }, [sessionId]);
  useEffect(() => {
  supabase.auth.getUser().then(({ data }) => {
    if (data.user) {
      setEmail(data.user.email ?? null);
    } else {
      router.push("/login");
    }
  });
}, [router]);

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

  // ── Mark Done ─────────────────────────────────────────────────────────────
  async function confirmDone(minutes: number) {
    if (!activeTopicId) return;
    setShowMarkDone(false);
    setTimerRunning(false);
    try {
      await fetch(`${API_BASE}/topics/${activeTopicId}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual_minutes: minutes }),
      });
      const doneTopic = topics.find((t) => t.id === activeTopicId);
      // refresh topics
      await fetchAll();
      setTimerSeconds(0);
      // trigger depth check
      if (doneTopic) setDepthCheckTopic(doneTopic);
    } catch {
      // backend call failed, still update local
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
      // advance to next pending
      const next = topics.find((t) => t.id !== activeTopicId && (t.status === "pending" || t.status === "in_progress"));
      if (next) setActiveTopicId(next.id);
    } catch {
      // silent
    }
  }

  const activeTopic = topics.find((t) => t.id === activeTopicId) || null;
  const pendingCount = topics.filter((t) => t.status === "pending" || t.status === "in_progress").length;
  const doneCount = topics.filter((t) => t.status === "done").length;
  const deferredCount = topics.filter((t) => t.status === "deferred").length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading session...</div>
      </div>
    );
  }

  return (
<div className={`min-h-screen flex flex-col ${
  isDark
    ? "bg-[#0D0D0F] text-white"
    : "bg-gray-50 text-gray-900"
}`}>      {/* ── Top nav ────────────────────────────────────────────────────────── */}
      <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
  {session?.deadline && (
    <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
      ⏱ {formatCountdown(session.deadline)}
    </span>
  )}

  <span className="text-xs text-gray-500">
    {email ?? ""}
  </span>

  <ThemeToggle />

  <button
    onClick={() => router.push("/dashboard")}
    className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
  >
    ← Dashboard
  </button>

  <button
    onClick={async () => {
      await supabase.auth.signOut();
      router.push("/login");
    }}
    className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
  >
    Sign out
  </button>
</div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <aside className="w-64 bg-white border-r border-gray-100 flex flex-col flex-shrink-0 overflow-hidden">
          {/* Pace health strip */}
          <div className="px-4 py-3 border-b border-gray-100">
            {pace ? (
              <PaceBar on_track={pace.on_track} />
            ) : (
              <div className="text-xs text-gray-400">Loading pace...</div>
            )}
            <div className="mt-2 flex gap-3 text-xs text-gray-500">
              <span>{doneCount} done</span>
              <span>{deferredCount > 0 ? `${deferredCount} deferred` : ""}</span>
              <span>{pendingCount} left</span>
            </div>
          </div>

          {/* Topics list */}
          <div className="flex-1 overflow-y-auto py-2">
            <p className="px-4 pb-1 text-[10px] uppercase tracking-widest text-gray-400 font-medium">Topics</p>
            {topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => handleTopicSwitch(topic.id)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2.5 hover:bg-gray-50 transition-colors ${
                  topic.id === activeTopicId ? "bg-purple-50" : ""
                }`}
              >
                <StatusDot status={topic.status} />
                <span
                  className={`text-sm flex-1 leading-snug ${
                    topic.id === activeTopicId ? "text-purple-700 font-medium" : "text-gray-700"
                  } ${topic.status === "deferred" ? "line-through text-gray-400" : ""}`}
                >
                  {topic.name}
                </span>
                {topic.status === "deferred" && <span className="text-sm">💀</span>}
              </button>
            ))}
          </div>

          {/* Graveyard link */}
          {deferredCount > 0 && (
            <div className="border-t border-gray-100 p-3">
              <button
                onClick={() => router.push(`/graveyard/${sessionId}`)}
                className="w-full flex items-center gap-2 text-xs text-red-500 hover:text-red-600 font-medium"
              >
                <span>⚰️</span>
                <span>{deferredCount} in graveyard</span>
              </button>
            </div>
          )}
        </aside>

        {/* ── Main area ────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Pace projection banner */}
          {pace && (
            <div
              className={`rounded-xl px-4 py-3 text-sm font-medium border ${
                pace.on_track === "green"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : pace.on_track === "amber"
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {pace.projection_string}
            </div>
          )}

          {/* Active topic card */}
          {activeTopic ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-gray-400 font-medium mb-1">Active topic</p>
                    <h2 className="text-xl font-semibold text-gray-900">{activeTopic.name}</h2>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">
                    ~{activeTopic.estimated_hours}h estimated
                  </span>
                </div>
              </div>

              {/* Timer */}
              <div className="px-6 py-5 border-b border-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Time on this topic</p>
                    <p className="text-3xl font-mono font-bold text-gray-900 tracking-tight">
                      {formatTimer(timerSeconds)}
                    </p>
                  </div>
                  <button
                    onClick={() => setTimerRunning((r) => !r)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      timerRunning
                        ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        : "bg-purple-600 text-white hover:bg-purple-700"
                    }`}
                  >
                    {timerRunning ? "⏸ Pause" : "▶ Start timer"}
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <div className="px-6 py-4 flex gap-3">
                <button
                  onClick={() => setShowMarkDone(true)}
                  className="flex-1 bg-emerald-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  ✓ Mark done
                </button>
                <button
                  onClick={deferTopic}
                  className="flex-1 border border-red-200 text-red-600 rounded-xl py-3 text-sm font-medium hover:bg-red-50 transition-colors"
                >
                  ⏭ Defer
                </button>
                <button
                  onClick={() => {
                    // opens SocraBot — dispatching a custom event
                    document.dispatchEvent(new Event("open-socrabot"));
                  }}
                  className="flex-1 border border-purple-200 text-purple-600 rounded-xl py-3 text-sm font-medium hover:bg-purple-50 transition-colors"
                >
                  💬 Need help
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-12 text-center">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-gray-600 font-medium">All topics done or deferred.</p>
              <p className="text-gray-400 text-sm mt-1">Check the graveyard or view your report.</p>
              <div className="flex gap-3 justify-center mt-5">
                <button
                  onClick={() => router.push(`/report/${sessionId}`)}
                  className="bg-purple-600 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-purple-700"
                >
                  View honest report →
                </button>
                {deferredCount > 0 && (
                  <button
                    onClick={() => router.push(`/graveyard/${sessionId}`)}
                    className="border border-gray-200 text-gray-600 rounded-xl px-4 py-2.5 text-sm hover:bg-gray-50"
                  >
                    ⚰️ Graveyard
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Session progress overview */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs uppercase tracking-widest text-gray-400 font-medium mb-3">Session progress</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-emerald-50 rounded-xl">
                <p className="text-2xl font-bold text-emerald-600">{doneCount}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Done</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-gray-700">{pendingCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">Remaining</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-xl">
                <p className="text-2xl font-bold text-red-500">{deferredCount}</p>
                <p className="text-xs text-red-500 mt-0.5">Deferred</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                <span>Overall</span>
                <span>{topics.length > 0 ? Math.round((doneCount / topics.length) * 100) : 0}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: topics.length > 0 ? `${(doneCount / topics.length) * 100}%` : "0%" }}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Modals & overlays ────────────────────────────────────────────────── */}

      {showMarkDone && (
        <MarkDoneModal
          timerSeconds={timerSeconds}
          onConfirm={confirmDone}
          onCancel={() => setShowMarkDone(false)}
        />
      )}

      {depthCheckTopic && (
        <DepthCheckModal
          topicId={depthCheckTopic.id}
          topicName={depthCheckTopic.name}
          onClose={() => {
            setDepthCheckTopic(null);
            fetchAll();
          }}
        />
      )}

      {deferToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl z-50 shadow-lg">
          Added to graveyard. We'll remind you.
        </div>
      )}

      <SocraBotBubble sessionId={sessionId} />
    </div>
  );
}
