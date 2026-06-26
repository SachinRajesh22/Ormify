"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ThemeToggle } from "../../components/ThemeToggle"
import { API } from "../../lib/api"
import { supabase } from "../../lib/supabase"
import { useTheme } from "../../lib/theme"

const COLORS = {
  violet: "#7B61FF",
  teal: "#10CFA8",
  amber: "#F59E0B",
  red: "#EF4444",
  darkBg: "#0D0D0F",
  darkPanel: "#141416",
  sidebar: "#0f0f0f",
}

type SessionStatus = "active" | "upcoming" | "completed"

interface StudySession {
  id: string
  name: string
  deadline: string
  topicsTotal: number
  topicsDone: number
  readiness: number
  status: SessionStatus
  avgDepth: number
  mostDeferred: string | null
}

interface PacePoint { topic: string; ratio: number }
interface DeferPoint { topic: string; count: number }
interface DepthPoint { topic: string; score: number }
interface RawTopic { id: string; status: string }

interface RawSession {
  id: string
  title: string
  deadline: string
  topics: RawTopic[]
  [key: string]: unknown
}

// ── NO fake fallback data — charts show empty state when no real data exists ──

function mapSession(r: RawSession): StudySession {
  const topics = r.topics ?? []
  const total = topics.length
  const done = topics.filter(t => t.status === "done").length
  const started = topics.filter(t => t.status === "in_progress" || t.status === "done").length
  const isPast = new Date(r.deadline) < new Date()
  const status: SessionStatus = isPast ? "completed" : started > 0 ? "active" : "upcoming"

  return {
    id: r.id,
    name: r.title,
    deadline: r.deadline,
    topicsTotal: total,
    topicsDone: done,
    readiness: total > 0 ? Math.round((done / total) * 100) : 0,
    status,
    avgDepth: 0,
    mostDeferred: null,
  }
}

function scoreColor(n: number): string {
  return n >= 70 ? COLORS.teal : n >= 50 ? COLORS.amber : n > 0 ? COLORS.red : COLORS.violet
}

function daysUntil(deadline: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 86_400_000))
}

function formatDeadline(deadline: string): string {
  return new Date(deadline).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function LineIcon({ name }: { name: "grid" | "search" | "chart" | "edit" | "calendar" | "plus" | "panel" | "logout" | "user" | "settings" | "help" | "spark" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  const paths: Record<typeof name, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 14 4-4 4 3 5-7" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    panel: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" /></>,
    help: <><circle cx="12" cy="12" r="10" /><path d="M9.5 9a2.5 2.5 0 0 1 4.8 1c0 2-2.3 2.2-2.3 4" /><path d="M12 17h.01" /></>,
    spark: <><path d="M12 2 15 9l7 3-7 3-3 7-3-7-7-3 7-3Z" /></>,
  }
  return <svg {...common}>{paths[name]}</svg>
}

function SidebarItem({ icon, label, active = false, collapsed = false, onClick }: {
  icon: React.ReactNode
  label: string
  active?: boolean
  collapsed?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center gap-3 rounded-lg border border-transparent text-left text-sm transition ${
        collapsed ? "justify-center px-0 py-3" : "px-3 py-3"
      } ${
        active
          ? "bg-zinc-200 text-zinc-950 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] dark:bg-white/10 dark:text-white dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
      }`}
    >
      <span className={active ? "text-zinc-950 dark:text-white" : "text-zinc-500"}>{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

function PopupItem({ icon, label, danger, onClick }: {
  icon: React.ReactNode
  label: string
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition ${
        danger
          ? "text-red-500 hover:bg-red-500/10"
          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
      }`}
    >
      <span className="opacity-70">{icon}</span>
      {label}
    </button>
  )
}

function NeonCard({ children, accent = COLORS.teal, className = "" }: {
  children: React.ReactNode
  accent?: string
  className?: string
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-xl border bg-white/85 p-5 shadow-sm backdrop-blur-xl dark:bg-[#141416]/85 ${className}`}
      style={{
        borderColor: `${accent}66`,
        boxShadow: `0 0 0 1px ${accent}18, 0 0 22px ${accent}22`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-4 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      {children}
    </section>
  )
}

function StatCard({ label, value, color, sub }: {
  label: string
  value: string
  color: string
  sub?: string
}) {
  return (
    <NeonCard accent={color} className="min-h-28">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-100">{label}</p>
          <p className="font-mono text-3xl font-bold leading-none text-zinc-950 dark:text-white">{value}</p>
          {sub && <p className="mt-2 truncate text-sm text-zinc-500 dark:text-zinc-300">{sub}</p>}
        </div>
        <span
          className="rounded-full px-2 py-1 font-mono text-xs font-semibold text-white shadow-lg"
          style={{ background: color, boxShadow: `0 0 16px ${color}66` }}
        >
          {color.toUpperCase()}
        </span>
      </div>
    </NeonCard>
  )
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, { label: string; color: string }> = {
    active:    { label: "Active",    color: COLORS.violet },
    upcoming:  { label: "Upcoming",  color: COLORS.teal   },
    completed: { label: "Completed", color: "#8A8A9A"     },
  }
  const { label, color } = map[status]
  return (
    <span
      className="rounded-full px-2 py-1 text-xs font-semibold"
      style={{ background: `${color}22`, color }}
    >
      {label}
    </span>
  )
}

function SessionCard({ session, now, onClick, onDelete }: {
  session: StudySession
  now: number
  onClick: () => void
  onDelete: () => void
}) {
  const pct = Math.round((session.topicsDone / session.topicsTotal) * 100) || 0
  const accent = scoreColor(session.readiness)
  const days = daysUntil(session.deadline, now)

  return (
    <NeonCard accent={accent} className="group min-h-36 cursor-pointer p-4">
      <article onClick={onClick} className="flex h-full flex-col justify-between">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
          title="Delete session"
        >
          ×
        </button>
        <header>
          <div className="mb-3 flex items-start justify-between gap-3 pr-5">
            <h3 className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{session.name}</h3>
            <StatusBadge status={session.status} />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-300">
            Deadline: {session.status === "completed" ? "Completed" : `${days}d left, ${formatDeadline(session.deadline)}`}
          </p>
        </header>
        <footer className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300">
            <span>Readiness: {session.readiness}%</span>
            <span>{session.topicsDone}/{session.topicsTotal} topics</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: accent, boxShadow: `0 0 16px ${accent}` }}
            />
          </div>
        </footer>
      </article>
    </NeonCard>
  )
}

// ── Charts — show empty state instead of fake data ────────────────────────────

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-zinc-200 dark:border-white/10">
      <p className="text-sm text-zinc-400 dark:text-zinc-600">{message}</p>
    </div>
  )
}

function PaceLineChart({ data, isDark }: { data: PacePoint[]; isDark: boolean }) {
  if (data.length === 0) return <EmptyChart message="No completed topics yet — pace chart will appear here" />

  const W = 920
  const H = 250
  const PAD = { t: 18, r: 24, b: 78, l: 46 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b
  const minV = 0
  const maxV = 2.2
  const x = (i: number) => data.length <= 1 ? PAD.l + iW / 2 : PAD.l + (i / (data.length - 1)) * iW
  const y = (v: number) => PAD.t + ((maxV - v) / (maxV - minV)) * iH
  const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d.ratio).toFixed(1)}`).join(" ")
  const fill = `${PAD.l},${H - PAD.b} ${line} ${W - PAD.r},${H - PAD.b}`
  const grid  = isDark ? "rgba(255,255,255,0.09)" : "rgba(24,24,27,0.12)"
  const label = isDark ? "#A1A1AA" : "#52525B"
  const splitLabel = (topic: string) => {
    const words = topic.split(" ")
    if (words.length < 2) return [topic]
    const mid = Math.ceil(words.length / 2)
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")]
  }

  return (
    <svg className="block w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pace accuracy line chart">
      <defs>
        <linearGradient id="paceFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={COLORS.violet} stopOpacity="0.42" />
          <stop offset="100%" stopColor={COLORS.violet} stopOpacity="0" />
        </linearGradient>
        <filter id="paceGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {[0, 0.5, 1, 1.5, 2].map(v => (
        <g key={v}>
          <line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke={grid} strokeDasharray={v === 1 ? "5 5" : "2 4"} />
          <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill={label}>{v.toFixed(1)}x</text>
        </g>
      ))}
      {data.map((_, i) => (
        <line key={i} x1={x(i)} y1={PAD.t} x2={x(i)} y2={H - PAD.b} stroke={grid} strokeWidth="1" />
      ))}
      <line x1={PAD.l} y1={y(1)} x2={W - PAD.r} y2={y(1)} stroke={COLORS.teal} strokeDasharray="7 6" opacity="0.7" />
      <polygon points={fill} fill="url(#paceFill)" />
      <polyline points={line} fill="none" stroke={COLORS.violet} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" filter="url(#paceGlow)" />
      {data.map((d, i) => (
        <g key={`${d.topic}-${i}`}>
          <circle cx={x(i)} cy={y(d.ratio)} r="5" fill={COLORS.violet} stroke={isDark ? "#0D0D0F" : "#FFFFFF"} strokeWidth="2" />
          <text x={x(i)} y={H - 42} textAnchor="middle" fontSize="10" fill={label}>
            {splitLabel(d.topic).map((linePart, lineIndex) => (
              <tspan key={`${linePart}-${lineIndex}`} x={x(i)} dy={lineIndex === 0 ? 0 : 12}>{linePart}</tspan>
            ))}
          </text>
        </g>
      ))}
    </svg>
  )
}

function HBarChart({ data, isDark }: { data: DeferPoint[]; isDark: boolean }) {
  if (data.length === 0) return <EmptyChart message="No deferred topics yet" />

  // top 3 only
  const top3 = data.slice(0, 3)
  const max = Math.max(...top3.map(d => d.count), 1)

  return (
    <div className="space-y-4">
      {top3.map((d, i) => (
        <div key={`${d.topic}-${i}`} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3">
          <span className="truncate text-right text-sm text-zinc-600 dark:text-zinc-300">{d.topic}</span>
          <div className="h-4 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(d.count / max) * 100}%`,
                background: isDark
                  ? "linear-gradient(90deg, #991B1B, #EF4444)"
                  : "linear-gradient(90deg, #B91C1C, #F87171)",
                boxShadow: `0 0 22px ${COLORS.red}88`,
              }}
            />
          </div>
          <span className="font-mono text-sm text-zinc-700 dark:text-zinc-200">{d.count}</span>
        </div>
      ))}
    </div>
  )
}

function VBarChart({ data }: { data: DepthPoint[] }) {
  if (data.length === 0) return <EmptyChart message="No depth checks yet" />

  return (
    <div className="flex h-48 items-end gap-6 px-4 pt-4">
      {data.slice(0, 5).map((d, i) => {
        const gradient = d.score >= 80
          ? "linear-gradient(180deg, #10CFA8 0%, #8AD84B 100%)"
          : d.score >= 65
            ? "linear-gradient(180deg, #12D6B0 0%, #22C55E 100%)"
            : "linear-gradient(180deg, #F59E0B 0%, #EF4444 100%)"
        return (
          <div key={`${d.topic}-${i}`} className="flex flex-1 flex-col items-center justify-end gap-2">
            <span className="font-mono text-sm font-semibold text-zinc-700 dark:text-zinc-100">{d.score}</span>
            <div
              className="w-full max-w-28 rounded-t-lg transition-all duration-500"
              style={{ height: `${Math.max(d.score, 8)}%`, background: gradient, boxShadow: "0 0 24px rgba(16,207,168,0.32)" }}
            />
            <span className="w-full truncate text-center text-xs text-zinc-500 dark:text-zinc-400">{d.topic}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const [showAnalytics, setShowAnalytics] = useState(true)
  const [email, setEmail]       = useState<string | null>(null)
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [paceData, setPaceData] = useState<PacePoint[]>([])
  const [deferData, setDeferData] = useState<DeferPoint[]>([])
  const [depthData, setDepthData] = useState<DepthPoint[]>([])
  const [weeklyCount,    setWeeklyCount]    = useState<number | null>(null)
  const [totalSessions,  setTotalSessions]  = useState<number | null>(null)
  const [activeSessions, setActiveSessions] = useState<number | null>(null)
  const [loading, setLoading]       = useState(true)
  const [sessionsErr, setSessionsErr] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push("/login"); return }
      setEmail(data.user.email ?? null)
      const uid = data.user.id

      setLoading(true)
      try {
        const res = await fetch(`${API}/sessions?user_id=${uid}`)
        if (!res.ok) throw new Error(`${res.status}`)
        const mapped = (await res.json() as RawSession[]).map(mapSession)
        setSessions(mapped)

        const active = mapped.find(s => s.status === "active")

        await Promise.all([
          // ── real session summary (total + active count) ──
          fetch(`${API}/users/${uid}/sessions/summary`)
            .then(r => r.ok ? r.json() : null)
            .then((d: { total_sessions: number; active_sessions: number } | null) => {
              if (d) {
                setTotalSessions(d.total_sessions)
                setActiveSessions(d.active_sessions)
              }
            })
            .catch(() => {}),

          // ── real weekly topics count ──
          fetch(`${API}/users/${uid}/topics/weekly`)
            .then(r => r.ok ? r.json() : null)
            .then((d: { count: number } | null) => {
              if (d != null) setWeeklyCount(d.count)
            })
            .catch(() => {}),

          // ── pace chart (active session only) ──
          active
            ? fetch(`${API}/sessions/${active.id}/analytics/pace`)
                .then(r => r.ok ? r.json() : [])
                .then((raw: { topic: string; pace_ratio: number }[]) =>
                  setPaceData(raw.map(p => ({ topic: p.topic, ratio: p.pace_ratio }))))
                .catch(() => {})
            : Promise.resolve(),

          // ── deferred topics — all sessions for this user ──
          fetch(`${API}/users/${uid}/analytics/deferred`)
            .then(r => r.ok ? r.json() : [])
            .then((raw: { topic: string; defer_count: number }[]) =>
              setDeferData(raw.map(d => ({ topic: d.topic, count: d.defer_count }))))
            .catch(() => {}),

          // ── depth scores (active session only) ──
          active
            ? fetch(`${API}/sessions/${active.id}/analytics/depth`)
                .then(r => r.ok ? r.json() : [])
                .then((raw: { topic: string; score: number }[]) => setDepthData(raw))
                .catch(() => {})
            : Promise.resolve(),
        ])
      } catch (err) {
        setSessionsErr(err instanceof Error ? err.message : "Failed to load sessions")
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router])

  // ── Derived stat values — null means "still loading / no data yet" ─────────
  const avgDepth = depthData.length > 0
    ? Math.round(depthData.reduce((a, d) => a + d.score, 0) / depthData.length / 3 * 100)
    : null

  // Top 3 most deferred — real data only
  const topDeferredNames = deferData.slice(0, 3).map(d => d.topic)

  const displayEmail   = email ?? ""
  const visibleSessions = sessions.slice(0, 8)

  return (
    <div className="flex min-h-screen bg-zinc-50 font-sans text-zinc-950 dark:bg-[#0D0D0F] dark:text-white">
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-zinc-200 bg-white/90 text-zinc-950 backdrop-blur-xl transition-all duration-300 dark:border-white/10 dark:bg-[#0f0f0f] dark:text-white ${
          sidebarOpen ? "w-64" : "w-16"
        }`}
      >
        <header className={`flex h-20 items-center ${sidebarOpen ? "justify-between px-5" : "justify-center"}`}>
          {sidebarOpen && (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-[#7B61FF] shadow-[0_0_22px_rgba(123,97,255,0.75)]" />
              <span className="text-lg font-bold tracking-tight text-zinc-950 dark:text-white">Ormify</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <LineIcon name="panel" />
          </button>
        </header>

        <nav className="flex flex-col gap-1 px-3" aria-label="Dashboard navigation">
          <SidebarItem icon={<LineIcon name="grid" />}     label="Dashboard"     active collapsed={!sidebarOpen} />
          <SidebarItem icon={<LineIcon name="search" />}   label="Search sessions" collapsed={!sidebarOpen} />
          <SidebarItem icon={<LineIcon name="chart" />}    label="Analytics"     onClick={() => setShowAnalytics(v => !v)} collapsed={!sidebarOpen} />
          <SidebarItem icon={<LineIcon name="edit" />}     label="Depth checks"  collapsed={!sidebarOpen} />
          <SidebarItem icon={<LineIcon name="calendar" />} label="Schedule"      onClick={() => router.push("/schedule")} collapsed={!sidebarOpen} />
          <SidebarItem icon={<LineIcon name="plus" />}     label="New session"   onClick={() => router.push("/session")} collapsed={!sidebarOpen} />
        </nav>

        {sidebarOpen && sessions.filter(s => s.status === "upcoming").length > 0 && (
          <section className="mt-6 px-4">
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Pinned</p>
            <div className="space-y-1">
              {sessions.filter(s => s.status === "upcoming").slice(0, 3).map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => router.push(`/study/${s.id}`)}
                  className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className={`mt-4 min-h-0 flex-1 overflow-y-auto px-4 ${sidebarOpen ? "block" : "hidden"}`}>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Recents</p>
          {sessions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-400 dark:text-zinc-600">No sessions yet</p>
          ) : (
            <div className="space-y-1">
              {sessions.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => router.push(`/study/${s.id}`)}
                  className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-white/5"
                >
                  <p className="truncate text-sm text-zinc-700 dark:text-zinc-300">{s.name}</p>
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
                    {s.status === "completed" ? "Completed" : `${daysUntil(s.deadline, now)}d left, ${s.topicsTotal} topics`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <footer className="relative border-t border-zinc-200 p-3 dark:border-white/10">
          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute bottom-full left-3 right-3 z-20 mb-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1C1C1F]">
                <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 dark:border-white/10">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7B61FF] text-sm font-bold text-white">
                    {displayEmail[0]?.toUpperCase() ?? "U"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">Profile</p>
                    <p className="truncate text-xs text-zinc-500">{displayEmail}</p>
                  </div>
                </div>
                <PopupItem icon={<LineIcon name="user" />}     label="Profile" />
                <PopupItem icon={<LineIcon name="settings" />} label="Settings" />
                <PopupItem icon={<LineIcon name="help" />}     label="Help" />
                <div className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="opacity-70"><LineIcon name="spark" /></span>
                  <span className="flex-1">Theme</span>
                  <ThemeToggle />
                </div>
                <div className="border-t border-zinc-100 dark:border-white/10">
                  <PopupItem
                    icon={<LineIcon name="logout" />}
                    label="Log out"
                    danger
                    onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => setProfileOpen(v => !v)}
            className={`flex w-full items-center rounded-xl transition hover:bg-zinc-100 dark:hover:bg-white/5 ${
              sidebarOpen ? "gap-3 px-2 py-2 text-left" : "justify-center py-2"
            }`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7B61FF] text-sm font-bold text-white shadow-[0_0_18px_rgba(123,97,255,0.65)]">
              {displayEmail[0]?.toUpperCase() ?? "U"}
            </div>
            {sidebarOpen && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">Profile</p>
                  <p className="truncate text-xs text-zinc-500">{displayEmail}</p>
                </div>
                <span className="text-zinc-400 dark:text-zinc-600">⌃</span>
              </>
            )}
          </button>
        </footer>
      </aside>

      <main
        className={`relative min-h-screen flex-1 overflow-hidden transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-16"
        }`}
      >
        <div
          className="absolute inset-0 bg-zinc-50 dark:bg-[#0D0D0F]"
          style={{
            backgroundImage: isDark
              ? "linear-gradient(rgba(123,97,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(16,207,168,0.08) 1px, transparent 1px), radial-gradient(circle at 80% 8%, rgba(123,97,255,0.18), transparent 30%), radial-gradient(circle at 18% 28%, rgba(16,207,168,0.12), transparent 24%)"
              : "linear-gradient(rgba(123,97,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(16,207,168,0.08) 1px, transparent 1px), radial-gradient(circle at 80% 8%, rgba(123,97,255,0.12), transparent 30%), radial-gradient(circle at 18% 28%, rgba(16,207,168,0.10), transparent 24%)",
            backgroundSize: "96px 96px, 96px 96px, auto, auto",
          }}
        />
        <div className="absolute inset-0 dark:bg-[linear-gradient(120deg,transparent_0%,rgba(123,97,255,0.08)_45%,transparent_75%)]" />

        <div className="relative mx-auto max-w-7xl px-8 py-8">
          <header className="mb-6 flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">Your sessions</h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {totalSessions != null ? totalSessions : sessions.length} sessions
                {" · "}
                {activeSessions != null ? activeSessions : sessions.filter(s => s.status === "active").length} active
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/session")}
              className="flex items-center gap-2 rounded-xl bg-[#7B61FF] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_22px_rgba(123,97,255,0.55)] transition hover:opacity-90"
            >
              <LineIcon name="plus" />
              New session
            </button>
          </header>

          {/* ── Stat cards — real data only, honest empty states ── */}
          <section className="mb-4 grid gap-4 lg:grid-cols-3" aria-label="Learning summary">
            <StatCard
              label="Topics this week"
              value={weeklyCount != null ? String(weeklyCount) : "—"}
              color={COLORS.violet}
              sub={weeklyCount === 0 ? "Complete a topic to start tracking" : undefined}
            />
            <StatCard
              label="Avg depth score"
              value={avgDepth != null ? `${avgDepth}%` : "—"}
              color={COLORS.teal}
              sub={avgDepth == null ? "Run a depth check to see your score" : "across checked topics"}
            />
            <StatCard
              label="Most deferred"
              value={topDeferredNames[0] ?? "—"}
              color={COLORS.amber}
              sub={
                topDeferredNames.length > 1
                  ? `Also: ${topDeferredNames.slice(1).join(", ")}`
                  : topDeferredNames.length === 0
                    ? "No deferred topics yet"
                    : undefined
              }
            />
          </section>

          {/* ── Session cards ── */}
          <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Active sessions">
            {loading ? (
              <NeonCard accent={COLORS.violet} className="col-span-full">
                <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading sessions...</p>
              </NeonCard>
            ) : sessionsErr ? (
              <NeonCard accent={COLORS.red} className="col-span-full">
                <p className="py-8 text-center text-sm text-red-500">Could not load sessions: {sessionsErr}</p>
              </NeonCard>
            ) : visibleSessions.length === 0 ? (
              <NeonCard accent={COLORS.teal} className="col-span-full">
                <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">No sessions yet. Create one above.</p>
              </NeonCard>
            ) : (
              visibleSessions.map(s => (
                <SessionCard
                  key={s.id}
                  session={s}
                  now={now}
                  onClick={() => router.push(`/study/${s.id}`)}
                  onDelete={async () => {
                    if (!confirm(`Delete "${s.name}"?`)) return
                    await fetch(`${API}/sessions/${s.id}`, { method: "DELETE" })
                    setSessions(prev => prev.filter(x => x.id !== s.id))
                  }}
                />
              ))
            )}
          </section>

          {/* ── Analytics ── */}
          <section aria-label="Learning analytics" className="space-y-4">
            <NeonCard accent={COLORS.violet} className="p-4">
              <header className="mb-2 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Learning Analytics</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Pace accuracy across completed topics</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAnalytics(v => !v)}
                  className="text-zinc-500 transition hover:text-zinc-950 dark:hover:text-white"
                  aria-label={showAnalytics ? "Hide analytics" : "Show analytics"}
                >
                  {showAnalytics ? "⌃" : "⌄"}
                </button>
              </header>
              {showAnalytics && <PaceLineChart data={paceData} isDark={isDark} />}
            </NeonCard>

            {showAnalytics && (
              <div className="grid gap-4 lg:grid-cols-2">
                <NeonCard accent={COLORS.teal}>
                  <header className="mb-5 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Most deferred topics</h2>
                    {deferData.length > 0 && (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">top 3</span>
                    )}
                  </header>
                  <HBarChart data={deferData} isDark={isDark} />
                </NeonCard>

                <NeonCard accent={COLORS.teal} className="relative">
                  <span className="absolute right-6 top-4 text-zinc-300 dark:text-white/25">
                    <LineIcon name="spark" />
                  </span>
                  <header className="mb-2">
                    <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Depth scores per topic</h2>
                  </header>
                  <VBarChart data={depthData} />
                </NeonCard>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
<<<<<<< Updated upstream
}
=======
}
>>>>>>> Stashed changes
