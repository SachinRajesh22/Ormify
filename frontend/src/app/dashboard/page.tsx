"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { ThemeToggle } from "../../components/ThemeToggle"
import { useTheme } from "../../lib/theme"

// Hex values used only in SVG elements and dynamic inline styles (where Tailwind classes can't reach)
const COLORS = {
  violet: "#7B61FF",
  teal:   "#10CFA8",
  amber:  "#F59E0B",
  red:    "#EF4444",
  muted:  "#8A8A9A",
  hint:   "#4A4A5A",
}

// ── Types ─────────────────────────────────────────────────────
type SessionStatus = "active" | "upcoming" | "completed"

interface StudySession {
  id:           string
  name:         string
  deadline:     string
  topicsTotal:  number
  topicsDone:   number
  readiness:    number
  status:       SessionStatus
  avgDepth:     number
  mostDeferred: string | null
}

interface PacePoint  { topic: string; ratio: number }
interface DeferPoint { topic: string; count: number }
interface DepthPoint { topic: string; score: number }

// ── Dummy data ────────────────────────────────────────────────
const SESSIONS: StudySession[] = [
  {
    id: "s1", name: "DSA Exam", deadline: "2026-06-22",
    topicsTotal: 12, topicsDone: 5, readiness: 41,
    status: "active", avgDepth: 62, mostDeferred: "Dynamic Programming",
  },
  {
    id: "s2", name: "OS Mid Sem", deadline: "2026-06-28",
    topicsTotal: 8, topicsDone: 6, readiness: 72,
    status: "upcoming", avgDepth: 78, mostDeferred: "Memory Management",
  },
  {
    id: "s3", name: "DBMS Finals", deadline: "2026-06-15",
    topicsTotal: 10, topicsDone: 10, readiness: 63,
    status: "completed", avgDepth: 65, mostDeferred: null,
  },
  {
    id: "s4", name: "Computer Networks", deadline: "2026-07-05",
    topicsTotal: 9, topicsDone: 0, readiness: 0,
    status: "upcoming", avgDepth: 0, mostDeferred: null,
  },
]

const PACE_DATA: PacePoint[] = [
  { topic: "Arrays",  ratio: 1.25 },
  { topic: "Lists",   ratio: 1.2  },
  { topic: "Sorting", ratio: 0.85 },
  { topic: "BST",     ratio: 1.6  },
  { topic: "Graphs",  ratio: 1.3  },
  { topic: "DP",      ratio: 1.8  },
]

const DEFER_DATA: DeferPoint[] = [
  { topic: "Dynamic Programming", count: 4 },
  { topic: "Graphs",              count: 3 },
  { topic: "Trees",               count: 2 },
  { topic: "Recursion",           count: 2 },
  { topic: "Tries",               count: 1 },
]

const DEPTH_DATA: DepthPoint[] = [
  { topic: "Arrays",  score: 90 },
  { topic: "Lists",   score: 67 },
  { topic: "Sorting", score: 85 },
  { topic: "BST",     score: 33 },
  { topic: "DP",      score: 33 },
  { topic: "Queues",  score: 75 },
]

function scoreColor(n: number): string {
  return n >= 70 ? COLORS.teal : n >= 50 ? COLORS.amber : n > 0 ? COLORS.red : COLORS.hint
}

// ── Sub-components ────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-stone-500 dark:text-[#8A8A9A] uppercase tracking-[0.08em] font-medium mb-3 m-0">
      {children}
    </p>
  )
}

function StatCard({
  label, value, color, sub,
}: {
  label: string; value: string; color: string; sub?: string
}) {
  return (
    <div className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-white/[0.06] rounded-xl px-5 py-4">
      <p className="text-[10px] text-stone-500 dark:text-[#8A8A9A] uppercase tracking-[0.07em] font-medium mb-2 m-0">
        {label}
      </p>
      <p className="font-mono text-[26px] font-bold tracking-tight m-0" style={{ color }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-stone-500 dark:text-[#6B6B80] mt-1 m-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {sub}
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, { label: string; color: string }> = {
    active:    { label: "Active",    color: COLORS.violet },
    upcoming:  { label: "Upcoming",  color: COLORS.teal   },
    completed: { label: "Completed", color: COLORS.muted  },
  }
  const { label, color } = map[status]
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-[0.04em]"
      style={{ background: color + "22", color }}
    >
      {label}
    </span>
  )
}

function SessionCard({
  session, onClick,
}: {
  session: StudySession; onClick: () => void
}) {
  const pct  = Math.round((session.topicsDone / session.topicsTotal) * 100) || 0
  const col  = scoreColor(session.readiness)
  const days = Math.max(0, Math.ceil((new Date(session.deadline).getTime() - Date.now()) / 86_400_000))

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-white/[0.06] rounded-xl px-5 py-[1.125rem] cursor-pointer transition-colors hover:bg-stone-50 dark:hover:bg-[#1A1A1E] hover:border-stone-300 dark:hover:border-white/[0.11]"
    >
      {/* Top row */}
      <div className="flex justify-between items-start mb-3.5">
        <div>
          <div className="flex items-center gap-2 mb-[5px]">
            <span className="font-semibold text-sm text-stone-900 dark:text-[#EEEEF2]">{session.name}</span>
            <StatusBadge status={session.status} />
          </div>
          <p className="text-[11px] text-stone-500 dark:text-[#8A8A9A] m-0">
            {session.topicsTotal} topics
            {session.status !== "completed"
              ? ` · ${days}d left · due ${new Date(session.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
              : " · Completed"}
          </p>
        </div>
        <div className="text-right flex-shrink-0 ml-3">
          <div className="font-mono text-[22px] font-bold tracking-tight leading-none" style={{ color: col }}>
            {session.readiness}%
          </div>
          <div className="text-[9px] text-stone-500 dark:text-[#6B6B80] uppercase tracking-[0.05em] mt-0.5">readiness</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2.5">
        <div className="flex justify-between mb-1.5">
          <span className="text-[10px] text-stone-500 dark:text-[#6B6B80]">{session.topicsDone}/{session.topicsTotal} topics</span>
          <span className="text-[10px] text-stone-500 dark:text-[#6B6B80]">{pct}%</span>
        </div>
        <div className="h-[3px] bg-stone-200 dark:bg-white/[0.05] rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} />
        </div>
      </div>

      {session.mostDeferred && (
        <p className="text-[10px] text-stone-500 dark:text-[#6B6B80] m-0">
          Most deferred:{" "}
          <span style={{ color: COLORS.amber }}>{session.mostDeferred}</span>
        </p>
      )}
    </div>
  )
}

// ── SVG charts (inline styles required for SVG fill/stroke attributes) ────

function PaceLineChart({ data, isDark }: { data: PacePoint[]; isDark: boolean }) {
  const W = 480, H = 130
  const PAD = { t: 12, r: 20, b: 32, l: 36 }
  const iW  = W - PAD.l - PAD.r
  const iH  = H - PAD.t - PAD.b
  const minV = 0, maxV = 2.2

  const x = (i: number) => PAD.l + (i / (data.length - 1)) * iW
  const y = (v: number) => PAD.t + ((maxV - v) / (maxV - minV)) * iH
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.ratio).toFixed(1)}`).join(" ")
  const refY = y(1)
  const gridStroke = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)"
  const labelFill  = isDark ? COLORS.hint  : "#A1A1AA"
  const mutedFill  = isDark ? COLORS.muted : "#71717A"

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>
      {[0.5, 1.0, 1.5, 2.0].map(v => (
        <line key={v} x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)}
          stroke={gridStroke} strokeWidth={1} />
      ))}
      <line x1={PAD.l} y1={refY} x2={W - PAD.r} y2={refY}
        stroke={COLORS.teal} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
      <text x={PAD.l - 4} y={refY + 4} textAnchor="end" fontSize={8} fill={mutedFill}>1.0×</text>
      {[0, 0.5, 1.5, 2.0].map(v => (
        <text key={v} x={PAD.l - 4} y={y(v) + 4} textAnchor="end" fontSize={8} fill={labelFill}>{v}</text>
      ))}
      <polyline points={pts} fill="none" stroke={COLORS.violet} strokeWidth={1.8} strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.ratio)} r={3.5} fill={COLORS.violet} />
          <circle cx={x(i)} cy={y(d.ratio)} r={6}   fill={COLORS.violet} opacity={0.15} />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill={labelFill}>{d.topic}</text>
        </g>
      ))}
    </svg>
  )
}

function HBarChart({ data, color, isDark }: { data: DeferPoint[]; color: string; isDark: boolean }) {
  const max      = Math.max(...data.map(d => d.count))
  const barBg    = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"
  const textMuted = isDark ? COLORS.muted : "#71717A"
  const textHint  = isDark ? COLORS.hint  : "#A1A1AA"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 130, fontSize: 11, color: textMuted, textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.topic}
          </span>
          <div style={{ flex: 1, height: 9, background: barBg, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(d.count / max) * 100}%`, background: color, borderRadius: 99, transition: "width 0.6s ease" }} />
          </div>
          <span style={{ fontSize: 10, color: textHint, width: 14, flexShrink: 0, fontFamily: "monospace" }}>{d.count}</span>
        </div>
      ))}
    </div>
  )
}

function VBarChart({ data, isDark }: { data: DepthPoint[]; isDark: boolean }) {
  const textHint = isDark ? COLORS.hint : "#A1A1AA"
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110, paddingTop: 20 }}>
      {data.map((d, i) => {
        const col = d.score >= 70 ? COLORS.teal : d.score >= 50 ? COLORS.amber : COLORS.red
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 9, color: col, fontFamily: "monospace", fontWeight: 600 }}>{d.score}</span>
            <div style={{ width: "100%", height: `${d.score}%`, background: col, borderRadius: "3px 3px 0 0", opacity: 0.85 }} />
            <span style={{ fontSize: 9, color: textHint, textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d.topic}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    async function getUser() {
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        setEmail(data.user.email ?? null)
      } else {
        router.push("/login")
      }
    }
    getUser()
  }, [router])

  const activeSessions      = SESSIONS.filter(s => s.status === "active").length
  const totalTopicsThisWeek = SESSIONS.reduce((a, s) => a + s.topicsDone, 0)
  const sessionsWithDepth   = SESSIONS.filter(s => s.avgDepth > 0)
  const avgDepth = sessionsWithDepth.length
    ? Math.round(sessionsWithDepth.reduce((a, s) => a + s.avgDepth, 0) / sessionsWithDepth.length)
    : 0
  const topDeferred = DEFER_DATA[0]?.topic ?? "—"

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#0D0D0F] text-stone-900 dark:text-[#EEEEF2] font-sans">

      {/* Header */}
      <header className="sticky top-0 z-50 h-14 flex items-center justify-between px-8 border-b border-stone-200 dark:border-white/[0.06] bg-stone-50 dark:bg-[#0D0D0F]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#7B61FF] flex items-center justify-center text-[13px] font-bold text-white">
            O
          </div>
          <span className="font-bold text-[15px] tracking-tight">Ormify</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-500 dark:text-[#8A8A9A]">{email ?? ""}</span>
          <ThemeToggle />
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              router.push("/login")
            }}
            className="text-xs text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-white/[0.12] rounded-md px-2.5 py-1 cursor-pointer bg-transparent hover:text-stone-900 dark:hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-[920px] mx-auto px-6 py-8">

        {/* Page header + New Session CTA */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight m-0 mb-[5px]">
              Your sessions
            </h1>
            <p className="text-[13px] text-stone-500 dark:text-[#8A8A9A] m-0">
              {SESSIONS.length} sessions · {activeSessions} active
            </p>
          </div>
          <button
            onClick={() => router.push("/session")}
            className="bg-[#7B61FF] text-white rounded-[9px] px-5 py-2.5 text-[13px] font-semibold cursor-pointer border-none tracking-tight hover:opacity-90 transition-opacity"
          >
            + New session
          </button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <StatCard label="Topics this week"  value={String(totalTopicsThisWeek)} color={COLORS.violet} />
          <StatCard label="Avg depth score"   value={avgDepth + "%"}              color={COLORS.teal}   sub="across all sessions" />
          <StatCard label="Most deferred"     value=""                            color={COLORS.amber}  sub={topDeferred} />
        </div>

        {/* Sessions grid */}
        <div className="grid grid-cols-2 gap-3 mb-10">
          {SESSIONS.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              onClick={() => router.push(`/study/${s.id}`)}
            />
          ))}
        </div>

        {/* Analytics section */}
        <div className="border-t border-stone-200 dark:border-white/[0.06] pt-7">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-base font-bold tracking-tight m-0 mb-1">
                Learning analytics
              </h2>
              <p className="text-xs text-stone-500 dark:text-[#8A8A9A] m-0">
                Pace, depth, and deferral patterns across all sessions
              </p>
            </div>
            <button
              onClick={() => setShowAnalytics(v => !v)}
              className="text-xs rounded-lg px-3.5 py-[7px] cursor-pointer border"
              style={{
                color: COLORS.violet,
                background: COLORS.violet + "18",
                borderColor: COLORS.violet + "33",
              }}
            >
              {showAnalytics ? "Hide ↑" : "Show analytics ↓"}
            </button>
          </div>

          {showAnalytics && (
            <div className="flex flex-col gap-3">

              {/* Pace line chart */}
              <div className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-white/[0.06] rounded-xl px-5 py-[1.125rem]">
                <SectionLabel>Pace accuracy — actual vs estimated (ratio)</SectionLabel>
                <PaceLineChart data={PACE_DATA} isDark={isDark} />
                <p className="text-[10px] text-stone-500 dark:text-[#6B6B80] mt-2 m-0">
                  Dashed line = perfect estimation (1.0×). Above = you underestimated how long that topic takes.
                </p>
              </div>

              {/* Two-col charts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-white/[0.06] rounded-xl px-5 py-[1.125rem]">
                  <SectionLabel>Most deferred topics — chronic blind spots</SectionLabel>
                  <HBarChart data={DEFER_DATA} color={COLORS.red} isDark={isDark} />
                </div>
                <div className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-white/[0.06] rounded-xl px-5 py-[1.125rem]">
                  <SectionLabel>Depth scores per topic</SectionLabel>
                  <VBarChart data={DEPTH_DATA} isDark={isDark} />
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
