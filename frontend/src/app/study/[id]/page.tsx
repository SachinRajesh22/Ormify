"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { ThemeToggle } from "../../../components/ThemeToggle"
import { useTheme } from "../../../lib/theme"

const COLORS = {
  violet: "#7B61FF",
  teal:   "#10CFA8",
  amber:  "#F59E0B",
  red:    "#EF4444",
  muted:  "#8A8A9A",
  hint:   "#4A4A5A",
}

// ── Types ─────────────────────────────────────────────────────
type TopicStatus = "pending" | "done" | "deferred"

interface Topic {
  id:            string
  name:          string
  estimatedHours: number
  status:        TopicStatus
  actualHours?:  number
  deferredAt?:   string
}

interface SessionInfo {
  name:     string
  deadline: string
}

// ── Dummy data per session ─────────────────────────────────────
const SESSION_MAP: Record<string, SessionInfo> = {
  s1: { name: "DSA Exam",           deadline: "2026-06-22" },
  s2: { name: "OS Mid Sem",         deadline: "2026-06-28" },
  s3: { name: "DBMS Finals",        deadline: "2026-06-15" },
  s4: { name: "Computer Networks",  deadline: "2026-07-05" },
}

const INITIAL_TOPICS: Record<string, Topic[]> = {
  s1: [
    { id: "t01", name: "Arrays & Strings",        estimatedHours: 2,   status: "done",     actualHours: 2.5 },
    { id: "t02", name: "Linked Lists",             estimatedHours: 1.5, status: "done",     actualHours: 1   },
    { id: "t03", name: "Stacks & Queues",          estimatedHours: 1.5, status: "done",     actualHours: 1.5 },
    { id: "t04", name: "Sorting Algorithms",       estimatedHours: 1.5, status: "done",     actualHours: 2   },
    { id: "t05", name: "Binary Search",            estimatedHours: 1,   status: "done",     actualHours: 0.5 },
    { id: "t06", name: "Trees & BST",              estimatedHours: 3,   status: "pending"                    },
    { id: "t07", name: "Graphs & BFS/DFS",         estimatedHours: 3,   status: "pending"                    },
    { id: "t08", name: "Hash Maps & Sets",         estimatedHours: 1.5, status: "pending"                    },
    { id: "t09", name: "Heaps & Priority Queues",  estimatedHours: 2,   status: "pending"                    },
    { id: "t10", name: "Recursion & Backtracking", estimatedHours: 2,   status: "pending"                    },
    { id: "t11", name: "Dynamic Programming",      estimatedHours: 4,   status: "deferred", deferredAt: "2026-06-17" },
    { id: "t12", name: "Tries",                    estimatedHours: 1.5, status: "deferred", deferredAt: "2026-06-18" },
  ],
  s2: [
    { id: "t01", name: "Processes & Threads",  estimatedHours: 2,   status: "done",    actualHours: 2   },
    { id: "t02", name: "CPU Scheduling",       estimatedHours: 2,   status: "done",    actualHours: 1.5 },
    { id: "t03", name: "Synchronization",      estimatedHours: 2.5, status: "done",    actualHours: 3   },
    { id: "t04", name: "Deadlocks",            estimatedHours: 2,   status: "done",    actualHours: 2   },
    { id: "t05", name: "Memory Management",    estimatedHours: 2.5, status: "done",    actualHours: 2.5 },
    { id: "t06", name: "Virtual Memory",       estimatedHours: 2,   status: "done",    actualHours: 2   },
    { id: "t07", name: "File Systems",         estimatedHours: 2,   status: "pending"                   },
    { id: "t08", name: "I/O Management",       estimatedHours: 1.5, status: "pending"                   },
  ],
  s3: [
    { id: "t01", name: "ER Model",             estimatedHours: 1.5, status: "done", actualHours: 1.5 },
    { id: "t02", name: "Relational Model",     estimatedHours: 2,   status: "done", actualHours: 2   },
    { id: "t03", name: "SQL Fundamentals",     estimatedHours: 2,   status: "done", actualHours: 2.5 },
    { id: "t04", name: "Joins & Subqueries",   estimatedHours: 2,   status: "done", actualHours: 2   },
    { id: "t05", name: "Normalization",        estimatedHours: 2.5, status: "done", actualHours: 3   },
    { id: "t06", name: "Transactions & ACID",  estimatedHours: 2,   status: "done", actualHours: 2   },
    { id: "t07", name: "Concurrency Control",  estimatedHours: 2,   status: "done", actualHours: 1.5 },
    { id: "t08", name: "Recovery",             estimatedHours: 1.5, status: "done", actualHours: 1.5 },
    { id: "t09", name: "Indexing & B-trees",   estimatedHours: 2,   status: "done", actualHours: 2   },
    { id: "t10", name: "Query Optimization",   estimatedHours: 2,   status: "done", actualHours: 2   },
  ],
  s4: [
    { id: "t01", name: "OSI & TCP/IP Models",      estimatedHours: 1.5, status: "pending" },
    { id: "t02", name: "Physical Layer",           estimatedHours: 1,   status: "pending" },
    { id: "t03", name: "Data Link Layer",          estimatedHours: 2,   status: "pending" },
    { id: "t04", name: "Network Layer & IP",       estimatedHours: 2.5, status: "pending" },
    { id: "t05", name: "Routing Algorithms",       estimatedHours: 2,   status: "pending" },
    { id: "t06", name: "Transport Layer & TCP",    estimatedHours: 2,   status: "pending" },
    { id: "t07", name: "Application Layer",        estimatedHours: 1.5, status: "pending" },
    { id: "t08", name: "DNS & HTTP",               estimatedHours: 1,   status: "pending" },
    { id: "t09", name: "Network Security",         estimatedHours: 2,   status: "pending" },
  ],
}

// ── Helpers ────────────────────────────────────────────────────
function daysLeft(deadline: string): number {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000))
}

function computeReadiness(topics: Topic[]): number {
  if (!topics.length) return 0
  return Math.round((topics.filter(t => t.status === "done").length / topics.length) * 100)
}

type PaceStatus = "ahead" | "on_track" | "behind" | "done"

function computePace(topics: Topic[], deadline: string): PaceStatus {
  if (topics.every(t => t.status === "done")) return "done"
  const days      = daysLeft(deadline)
  const hoursLeft = topics.filter(t => t.status === "pending").reduce((a, t) => a + t.estimatedHours, 0)
  const ratio     = (days * 6) / (hoursLeft || 0.01)
  if (ratio > 1.5) return "ahead"
  if (ratio >= 0.85) return "on_track"
  return "behind"
}

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000))
}

// ── Sub-components ─────────────────────────────────────────────

function StatCard({ label, value, color, sub }: {
  label: string; value: string; color: string; sub?: string
}) {
  return (
    <div className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-white/[0.06] rounded-xl px-4 py-3">
      <p className="text-[10px] text-stone-500 dark:text-[#8A8A9A] uppercase tracking-[0.07em] font-medium mb-1.5 m-0">
        {label}
      </p>
      <p className="font-mono text-[22px] font-bold tracking-tight m-0" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-stone-500 dark:text-[#6B6B80] mt-1 m-0">{sub}</p>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function StudyPage() {
  const router   = useRouter()
  const params   = useParams()
  const { theme } = useTheme()
  const isDark   = theme === "dark"
  const sessionId = params?.id as string

  const session = SESSION_MAP[sessionId]
  const [topics, setTopics]             = useState<Topic[]>(INITIAL_TOPICS[sessionId] ?? [])
  const [email, setEmail]               = useState<string | null>(null)
  const [markingId, setMarkingId]       = useState<string | null>(null)
  const [hoursInput, setHoursInput]     = useState("")
  const [expandDone, setExpandDone]     = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setEmail(data.user.email ?? null)
      else router.push("/login")
    })
  }, [router])

  if (!session) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#0D0D0F] flex items-center justify-center">
        <div className="text-center">
          <p className="text-stone-500 dark:text-[#8A8A9A] mb-4">Session not found.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-[#7B61FF] bg-none border-none cursor-pointer text-sm"
          >
            ← Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  const pending   = topics.filter(t => t.status === "pending")
  const deferred  = topics.filter(t => t.status === "deferred")
  const done      = topics.filter(t => t.status === "done")
  const readiness = computeReadiness(topics)
  const pace      = computePace(topics, session.deadline)
  const dl        = daysLeft(session.deadline)
  const hoursLeft = pending.reduce((a, t) => a + t.estimatedHours, 0)

  const paceConfig: Record<PaceStatus, { label: string; color: string; icon: string; msg: string }> = {
    ahead:    { label: "Ahead of schedule",  color: COLORS.teal,  icon: "↑",
      msg: `${hoursLeft.toFixed(1)}h of topics with ${dl} days left — you have room to go deeper.` },
    on_track: { label: "On track",           color: COLORS.amber, icon: "→",
      msg: `${hoursLeft.toFixed(1)}h left across ${pending.length} topics with ${dl} days remaining. Stay consistent.` },
    behind:   { label: "Behind schedule",    color: COLORS.red,   icon: "!",
      msg: `${hoursLeft.toFixed(1)}h of topics in ${dl} days — consider deferring lower-priority ones.` },
    done:     { label: "All topics covered", color: COLORS.teal,  icon: "✓",
      msg: "Use remaining time for revision and depth checks." },
  }

  function markDone(id: string) {
    const hours = parseFloat(hoursInput) || topics.find(t => t.id === id)?.estimatedHours || 0
    setTopics(prev => prev.map(t => t.id === id ? { ...t, status: "done", actualHours: hours } : t))
    setMarkingId(null)
    setHoursInput("")
  }

  function defer(id: string) {
    const today = new Date().toISOString().split("T")[0]
    setTopics(prev => prev.map(t => t.id === id ? { ...t, status: "deferred", deferredAt: today } : t))
  }

  function undefer(id: string) {
    setTopics(prev => prev.map(t => t.id === id ? { ...t, status: "pending", deferredAt: undefined } : t))
  }

  const scoreColor = (n: number) =>
    n >= 70 ? COLORS.teal : n >= 50 ? COLORS.amber : n > 0 ? COLORS.red : COLORS.hint

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#0D0D0F] text-stone-900 dark:text-[#EEEEF2] font-sans">

      {/* Header */}
      <header className="sticky top-0 z-50 h-14 flex items-center justify-between px-8 border-b border-stone-200 dark:border-white/[0.06] bg-stone-50 dark:bg-[#0D0D0F]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#7B61FF] flex items-center justify-center text-[13px] font-bold text-white">
            O
          </div>
          <span className="font-bold text-[15px] tracking-tight">Ormify</span>
          <span className="text-stone-300 dark:text-white/[0.15] text-base mx-1">/</span>
          <span className="text-sm text-stone-500 dark:text-[#8A8A9A]">{session.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-500 dark:text-[#8A8A9A]">{email ?? ""}</span>
          <ThemeToggle />
          <button
            onClick={() => router.push("/dashboard")}
            className="text-xs text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-white/[0.12] rounded-md px-3 py-1 cursor-pointer bg-transparent hover:text-stone-900 dark:hover:text-white transition-colors"
          >
            ← Dashboard
          </button>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
            className="text-xs text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-white/[0.12] rounded-md px-2.5 py-1 cursor-pointer bg-transparent hover:text-stone-900 dark:hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-[760px] mx-auto px-6 py-8">

        {/* Session title */}
        <div className="mb-6">
          <h1 className="text-[22px] font-bold tracking-tight m-0 mb-1">{session.name}</h1>
          <p className="text-xs text-stone-500 dark:text-[#8A8A9A] m-0">
            {dl > 0 ? `${dl} day${dl !== 1 ? "s" : ""} until deadline` : "Deadline passed"} · {topics.length} topics total
          </p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-2.5 mb-5">
          <StatCard
            label="Done"
            value={`${done.length}/${topics.length}`}
            color={scoreColor(readiness)}
          />
          <StatCard
            label="Readiness"
            value={`${readiness}%`}
            color={scoreColor(readiness)}
          />
          <StatCard
            label="Hours left"
            value={`${hoursLeft.toFixed(1)}h`}
            color={COLORS.violet}
            sub={`${pending.length} topics`}
          />
          <StatCard
            label="Days left"
            value={`${dl}d`}
            color={dl <= 2 ? COLORS.red : dl <= 5 ? COLORS.amber : COLORS.teal}
          />
        </div>

        {/* Pace banner */}
        <div
          className="flex items-center gap-3 rounded-[10px] px-4 py-3.5 mb-7 border"
          style={{
            background: paceConfig[pace].color + "15",
            borderColor: paceConfig[pace].color + "33",
          }}
        >
          <span
            className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold"
            style={{ background: paceConfig[pace].color + "22", color: paceConfig[pace].color }}
          >
            {paceConfig[pace].icon}
          </span>
          <div>
            <div className="font-semibold text-[13px] mb-0.5" style={{ color: paceConfig[pace].color }}>
              {paceConfig[pace].label}
            </div>
            <p className="text-[11px] text-stone-500 dark:text-[#8A8A9A] m-0 leading-relaxed">
              {paceConfig[pace].msg}
            </p>
          </div>
        </div>

        {/* Pending topics */}
        {pending.length > 0 && (
          <section className="mb-6">
            <p className="text-[10px] text-stone-500 dark:text-[#8A8A9A] uppercase tracking-[0.08em] font-medium mb-2.5 m-0">
              To study — {pending.length} topic{pending.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-col gap-1.5">
              {pending.map((t, i) => (
                <div key={t.id}>
                  <div
                    className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-white/[0.06] flex items-center gap-3 px-4 py-3"
                    style={{ borderRadius: markingId === t.id ? "10px 10px 0 0" : 10 }}
                  >
                    <span className="font-mono text-[11px] text-stone-500 dark:text-[#6B6B80] w-[22px] flex-shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-[13px] text-stone-900 dark:text-[#EEEEF2]">{t.name}</span>
                    <span className="font-mono text-[11px] text-stone-500 dark:text-[#6B6B80] flex-shrink-0">
                      ~{t.estimatedHours}h
                    </span>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => { setMarkingId(markingId === t.id ? null : t.id); setHoursInput("") }}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-md cursor-pointer border transition-colors"
                        style={{
                          borderColor: COLORS.teal + "44",
                          background: COLORS.teal + "12",
                          color: COLORS.teal,
                        }}
                      >
                        ✓ Done
                      </button>
                      <button
                        onClick={() => defer(t.id)}
                        className="text-[11px] px-2.5 py-1 rounded-md cursor-pointer border border-stone-300 dark:border-white/[0.1] bg-transparent text-stone-600 dark:text-stone-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                      >
                        Defer
                      </button>
                    </div>
                  </div>

                  {/* Inline done form */}
                  {markingId === t.id && (
                    <div
                      className="flex items-center gap-2.5 px-4 py-2.5 border border-t-0"
                      style={{
                        borderRadius: "0 0 10px 10px",
                        background: isDark ? "#111113" : "#F5F5F6",
                        borderColor: COLORS.teal + "33",
                      }}
                    >
                      <span className="text-[11px] text-stone-500 dark:text-[#8A8A9A]">
                        Actual hours spent:
                      </span>
                      <input
                        type="number"
                        value={hoursInput}
                        onChange={e => setHoursInput(e.target.value)}
                        placeholder={String(t.estimatedHours)}
                        min={0.5} max={20} step={0.5}
                        autoFocus
                        className="w-14 text-center text-xs rounded-md px-2 py-1 outline-none border text-stone-900 dark:text-[#EEEEF2] bg-white dark:bg-[#141416] border-stone-200 dark:border-white/[0.06] focus:border-[#10CFA8]"
                      />
                      <span className="text-[11px] text-stone-600 dark:text-stone-300">hours</span>
                      <button
                        onClick={() => markDone(t.id)}
                        className="text-[11px] font-semibold px-3 py-1 rounded-md border-none cursor-pointer"
                        style={{ background: COLORS.teal, color: "#0D0D0F" }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setMarkingId(null); setHoursInput("") }}
                        className="text-[11px] px-2.5 py-1 rounded-md cursor-pointer bg-transparent border border-stone-300 dark:border-white/[0.1] text-stone-600 dark:text-stone-300"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Deferred topics */}
        {deferred.length > 0 && (
          <section className="mb-6">
            <p className="text-[10px] uppercase tracking-[0.08em] font-medium mb-2.5 m-0" style={{ color: COLORS.amber }}>
              Deferred — {deferred.length} topic{deferred.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-col gap-1.5">
              {deferred.map(t => {
                const days  = t.deferredAt ? daysSince(t.deferredAt) : 0
                const urgent = dl <= 3
                return (
                  <div
                    key={t.id}
                    className="bg-white dark:bg-[#141416] rounded-[10px] px-4 py-3 flex items-center gap-3 border"
                    style={{ borderColor: urgent ? COLORS.amber + "44" : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)") }}
                  >
                    <span className="flex-1 text-[13px] text-stone-900 dark:text-[#EEEEF2]">{t.name}</span>
                    <span className="text-[10px]" style={{ color: urgent ? COLORS.amber : (isDark ? "#6B6B80" : "#4A4A5A") }}>
                      deferred {days === 0 ? "today" : `${days}d ago`}
                    </span>
                    {urgent && (
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full tracking-[0.04em]"
                        style={{ background: COLORS.amber + "22", color: COLORS.amber }}
                      >
                        URGENT
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-stone-500 dark:text-[#6B6B80]">~{t.estimatedHours}h</span>
                    <button
                      onClick={() => undefer(t.id)}
                      className="text-[11px] px-2.5 py-1 rounded-md cursor-pointer border transition-colors"
                      style={{
                        borderColor: COLORS.violet + "44",
                        background: COLORS.violet + "12",
                        color: COLORS.violet,
                      }}
                    >
                      Tackle now
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Completed topics (collapsible) */}
        {done.length > 0 && (
          <section>
            <button
              onClick={() => setExpandDone(v => !v)}
              className="flex items-center gap-1.5 text-[10px] text-stone-500 dark:text-[#6B6B80] uppercase tracking-[0.08em] font-medium bg-transparent border-none cursor-pointer mb-2.5 p-0 hover:text-stone-600 transition-colors"
            >
              <span>{expandDone ? "▾" : "▸"}</span>
              Completed — {done.length} topic{done.length !== 1 ? "s" : ""}
            </button>
            {expandDone && (
              <div className="flex flex-col">
                {done.map(t => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 py-2.5 px-1 border-b border-stone-100 dark:border-white/[0.04] last:border-0"
                  >
                    <span className="text-xs w-[18px] flex-shrink-0" style={{ color: COLORS.teal }}>✓</span>
                    <span className="flex-1 text-[13px] text-stone-500 dark:text-[#6B6B80]">{t.name}</span>
                    {t.actualHours !== undefined && (
                      <span className="font-mono text-[11px] text-stone-500 dark:text-[#6B6B80]">
                        {t.actualHours}h
                        {t.actualHours > t.estimatedHours && (
                          <span style={{ color: COLORS.amber }}>
                            {" "}(+{(t.actualHours - t.estimatedHours).toFixed(1)}h)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* SocraBot FAB */}
      <button
        onClick={() => alert("SocraBot coming soon!")}
        title="Ask SocraBot"
        className="fixed bottom-7 right-7 w-13 h-13 rounded-full border-none cursor-pointer text-xl flex items-center justify-center text-white"
        style={{
          width: 52, height: 52,
          background: COLORS.violet,
          boxShadow: `0 4px 20px ${COLORS.violet}44`,
        }}
      >
        💬
      </button>
    </div>
  )
}
