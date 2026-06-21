"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { ThemeToggle } from "../../components/ThemeToggle"
import { useTheme } from "../../lib/theme"
import { API } from "../../lib/api"

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

interface RawTopic { id: string; status: string }

interface RawSession {
  id:       string
  title:    string
  deadline: string
  topics:   RawTopic[]
  [key: string]: unknown
}

function mapSession(r: RawSession): StudySession {
  const topics     = r.topics ?? []
  const total      = topics.length
  const done       = topics.filter(t => t.status === "completed").length
  const isPast     = new Date(r.deadline) < new Date()
  return {
    id:           r.id,
    name:         r.title,
    deadline:     r.deadline,
    topicsTotal:  total,
    topicsDone:   done,
    readiness:    total > 0 ? Math.round((done / total) * 100) : 0,
    status:       isPast ? "completed" : "upcoming",
    avgDepth:     0,
    mostDeferred: null,
  }
}

function scoreColor(n: number): string {
  return n >= 70 ? COLORS.teal : n >= 50 ? COLORS.amber : n > 0 ? COLORS.red : COLORS.hint
}

// ── Sub-components ────────────────────────────────────────────

function SidebarItem({ icon, label, active = false, collapsed = false, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; collapsed?: boolean; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-2.5 rounded-lg text-[13px] font-medium text-left cursor-pointer border-none transition-colors ${
        collapsed ? "justify-center px-0 py-2" : "px-2 py-[7px]"
      } ${
        active
          ? "bg-stone-200 dark:bg-white/[0.08] text-stone-900 dark:text-[#EEEEF2]"
          : "text-stone-600 dark:text-[#8A8A9A] hover:bg-stone-200 dark:hover:bg-white/[0.06] hover:text-stone-900 dark:hover:text-[#EEEEF2] bg-transparent"
      }`}
    >
      <span className="flex-shrink-0 opacity-70">{icon}</span>
      {!collapsed && label}
    </button>
  )
}

function PopupItem({ icon, label, danger, onClick }: {
  icon: React.ReactNode; label: string; danger?: boolean; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors cursor-pointer bg-transparent border-none text-left ${
        danger
          ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
          : "text-stone-700 dark:text-[#AEAEBE] hover:bg-stone-100 dark:hover:bg-white/[0.05]"
      }`}
    >
      <span className="opacity-60 flex-shrink-0">{icon}</span>
      {label}
    </button>
  )
}

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
  session, onClick, onDelete,
}: {
  session: StudySession; onClick: () => void; onDelete: () => void
}) {
  const pct  = Math.round((session.topicsDone / session.topicsTotal) * 100) || 0
  const col  = scoreColor(session.readiness)
  const days = Math.max(0, Math.ceil((new Date(session.deadline).getTime() - Date.now()) / 86_400_000))

  return (
    <div
      onClick={onClick}
      className="relative bg-white dark:bg-[#141416] border border-stone-200 dark:border-white/[0.06] rounded-xl px-5 py-[1.125rem] cursor-pointer transition-colors hover:bg-stone-50 dark:hover:bg-[#1A1A1E] hover:border-stone-300 dark:hover:border-white/[0.11]"
    >
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded-full text-stone-400 dark:text-[#555565] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors text-xs leading-none"
        title="Delete session"
      >
        ×
      </button>
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
        <div className="text-right flex-shrink-0 ml-3 mr-4">
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
  const [email,       setEmail]       = useState<string | null>(null)
  const [sessions,    setSessions]    = useState<StudySession[]>([])
  const [paceData,    setPaceData]    = useState<PacePoint[]>([])
  const [deferData,   setDeferData]   = useState<DeferPoint[]>([])
  const [depthData,   setDepthData]   = useState<DepthPoint[]>([])
  const [loading,     setLoading]     = useState(true)
  const [sessionsErr, setSessionsErr] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { router.push("/login"); return }
      setEmail(data.user.email ?? null)

      setLoading(true)
      try {
        const res = await fetch(`${API}/sessions?user_id=${data.user.id}`)
        if (!res.ok) throw new Error(`${res.status}`)
        const mapped = (await res.json() as RawSession[]).map(mapSession)
        setSessions(mapped)

        const active = mapped.find(s => s.status === "active")
        await Promise.all([
          active
            ? fetch(`${API}/sessions/${active.id}/analytics/pace`)
                .then(r => r.ok ? r.json() : [])
                .then((raw: { topic: string; pace_ratio: number }[]) =>
                  setPaceData(raw.map(p => ({ topic: p.topic, ratio: p.pace_ratio }))))
                .catch(() => {})
            : Promise.resolve(),
          fetch(`${API}/users/${data.user.id}/analytics/deferred`)
            .then(r => r.ok ? r.json() : [])
            .then((raw: { topic: string; defer_count: number }[]) =>
              setDeferData(raw.map(d => ({ topic: d.topic, count: d.defer_count }))))
            .catch(() => {}),
          active
            ? fetch(`${API}/sessions/${active.id}/analytics/depth`)
                .then(r => r.ok ? r.json() : [])
                .then((d: DepthPoint[]) => setDepthData(d))
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

  const activeSessions      = sessions.filter(s => s.status === "active").length
  const totalTopicsThisWeek = sessions.reduce((a, s) => a + s.topicsDone, 0)
  const sessionsWithDepth   = sessions.filter(s => s.avgDepth > 0)
  const avgDepth = sessionsWithDepth.length
    ? Math.round(sessionsWithDepth.reduce((a, s) => a + s.avgDepth, 0) / sessionsWithDepth.length)
    : 0
  const topDeferred = deferData[0]?.topic ?? "—"

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#0D0D0F] text-stone-900 dark:text-[#EEEEF2] font-sans flex">

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-screen flex flex-col bg-stone-100 dark:bg-[#0f0f0f] z-40 transition-all duration-300 ${sidebarOpen ? "w-[260px]" : "w-[52px]"}`}>

        {/* Top: logo + toggle */}
        <div className={`flex items-center h-14 flex-shrink-0 ${sidebarOpen ? "justify-between px-4" : "justify-center"}`}>
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#7B61FF] flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0">O</div>
              <span className="font-bold text-[15px] tracking-tight">Ormify</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 dark:text-[#8A8A9A] hover:bg-stone-200 dark:hover:bg-white/[0.08] transition-colors cursor-pointer bg-transparent border-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M9 3v18"/>
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-0.5 px-2 pt-1 flex-shrink-0">
          <SidebarItem icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
            label="Dashboard" active collapsed={!sidebarOpen} />
          <SidebarItem icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>}
            label="Search sessions" collapsed={!sidebarOpen} />
          <SidebarItem icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
            label="Analytics" onClick={() => setShowAnalytics(v => !v)} collapsed={!sidebarOpen} />
          <SidebarItem icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>}
            label="Depth checks" collapsed={!sidebarOpen} />
          <SidebarItem icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>}
            label="Schedule" collapsed={!sidebarOpen} />
          <SidebarItem icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
            label="New session" onClick={() => router.push("/session")} collapsed={!sidebarOpen} />
        </nav>

        {/* Pinned — upcoming sessions */}
        {sidebarOpen && sessions.filter(s => s.status === "upcoming").length > 0 && (
          <div className="px-3 mt-5 flex-shrink-0">
            <p className="text-[11px] font-semibold text-stone-500 dark:text-[#555565] mb-1 px-1">Pinned</p>
            {sessions.filter(s => s.status === "upcoming").slice(0, 3).map(s => (
              <button
                key={s.id}
                onClick={() => router.push(`/study/${s.id}`)}
                className="w-full text-left px-2 py-1.5 rounded-lg text-[13px] text-stone-700 dark:text-[#AEAEBE] hover:bg-stone-200 dark:hover:bg-white/[0.06] transition-colors truncate cursor-pointer bg-transparent border-none block"
              >
                📌 {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Recents — all sessions scrollable */}
        <div className={`mt-4 flex-1 overflow-y-auto min-h-0 ${sidebarOpen ? "px-3" : "hidden"}`}>
          <p className="text-[11px] font-semibold text-stone-500 dark:text-[#555565] mb-1 px-1">Recents</p>
          {sessions.length === 0 ? (
            <p className="text-[12px] text-stone-400 dark:text-[#555565] px-2 py-1">No sessions yet</p>
          ) : (
            sessions.map(s => {
              const days = Math.max(0, Math.ceil((new Date(s.deadline).getTime() - Date.now()) / 86_400_000))
              return (
                <button
                  key={s.id}
                  onClick={() => router.push(`/study/${s.id}`)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-stone-200 dark:hover:bg-white/[0.06] transition-colors cursor-pointer bg-transparent border-none group"
                >
                  <p className="text-[13px] text-stone-700 dark:text-[#AEAEBE] truncate m-0 leading-tight">{s.name}</p>
                  <p className="text-[11px] text-stone-400 dark:text-[#555565] m-0 mt-0.5">
                    {s.status === "completed" ? "Completed" : `${days}d left · ${s.topicsTotal} topics`}
                  </p>
                </button>
              )
            })
          )}
        </div>

        {/* Bottom: profile button + popup */}
        <div className="flex-shrink-0 border-t border-stone-200 dark:border-white/[0.06] px-2 py-2 relative">

          {/* Profile popup — appears above when open */}
          {profileOpen && (
            <>
              {/* backdrop */}
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute bottom-[calc(100%+4px)] left-2 right-2 z-20 bg-white dark:bg-[#1c1c1e] border border-stone-200 dark:border-white/[0.08] rounded-xl shadow-xl overflow-hidden py-1">
                {/* user info header */}
                <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-stone-100 dark:border-white/[0.06]">
                  <div className="w-8 h-8 rounded-full bg-[#7B61FF] flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0">
                    {(email ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-stone-900 dark:text-[#EEEEF2] truncate m-0 leading-tight">{email?.split("@")[0] ?? ""}</p>
                    <p className="text-[11px] text-stone-400 dark:text-[#555565] truncate m-0">{email ?? ""}</p>
                  </div>
                </div>
                {/* menu items */}
                <PopupItem icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>} label="Profile" />
                <PopupItem icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>} label="Settings" />
                <PopupItem icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>} label="Help" />
                {/* theme row */}
                <div className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-stone-700 dark:text-[#AEAEBE]">
                  <span className="opacity-60"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></span>
                  <span className="flex-1">Theme</span>
                  <ThemeToggle />
                </div>
                <div className="border-t border-stone-100 dark:border-white/[0.06] mt-1 pt-1">
                  <PopupItem
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
                    label="Log out"
                    danger
                    onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Profile trigger button */}
          <button
            onClick={() => setProfileOpen(v => !v)}
            className={`w-full flex items-center rounded-lg hover:bg-stone-200 dark:hover:bg-white/[0.06] transition-colors cursor-pointer bg-transparent border-none ${sidebarOpen ? "gap-2.5 px-2 py-2 text-left" : "justify-center py-2"}`}
          >
            <div className="w-7 h-7 rounded-full bg-[#7B61FF] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
              {(email ?? "?")[0].toUpperCase()}
            </div>
            {sidebarOpen && <>
              <p className="text-[13px] font-medium text-stone-800 dark:text-[#EEEEF2] truncate m-0 flex-1 min-w-0">
                {email?.split("@")[0] ?? ""}
              </p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-stone-400 dark:text-[#555565]"><path d="M7 15l5-5 5 5"/></svg>
            </>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className={`flex-1 min-h-screen transition-all duration-300 ${sidebarOpen ? "ml-[260px]" : "ml-[52px]"}`}>
      <div className="max-w-[860px] mx-auto px-8 py-8">

        {/* Page header + New Session CTA */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight m-0 mb-[5px]">
              Your sessions
            </h1>
            <p className="text-[13px] text-stone-500 dark:text-[#8A8A9A] m-0">
              {sessions.length} sessions · {activeSessions} active
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
          {loading ? (
            <p className="col-span-2 text-sm text-stone-500 dark:text-[#8A8A9A] py-8 text-center">
              Loading sessions…
            </p>
          ) : sessionsErr ? (
            <p className="col-span-2 text-sm text-red-500 py-8 text-center">
              Could not load sessions: {sessionsErr}
            </p>
          ) : sessions.length === 0 ? (
            <p className="col-span-2 text-sm text-stone-500 dark:text-[#8A8A9A] py-8 text-center">
              No sessions yet — create one above.
            </p>
          ) : (
            sessions.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                onClick={() => router.push(`/study/${s.id}`)}
                onDelete={async () => {
                  if (!confirm(`Delete "${s.name}"?`)) return
                  await fetch(`${API}/sessions/${s.id}`, { method: "DELETE" })
                  setSessions(prev => prev.filter(x => x.id !== s.id))
                }}
              />
            ))
          )}
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
                <PaceLineChart data={paceData} isDark={isDark} />
                <p className="text-[10px] text-stone-500 dark:text-[#6B6B80] mt-2 m-0">
                  Dashed line = perfect estimation (1.0×). Above = you underestimated how long that topic takes.
                </p>
              </div>

              {/* Two-col charts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-white/[0.06] rounded-xl px-5 py-[1.125rem]">
                  <SectionLabel>Most deferred topics — chronic blind spots</SectionLabel>
                  <HBarChart data={deferData} color={COLORS.red} isDark={isDark} />
                </div>
                <div className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-white/[0.06] rounded-xl px-5 py-[1.125rem]">
                  <SectionLabel>Depth scores per topic</SectionLabel>
                  <VBarChart data={depthData} isDark={isDark} />
                </div>
              </div>

            </div>
          )}
        </div>
        </div>
      </main>
    </div>
  )
}
