"use client"

import { useState,useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"

// ── Color tokens ──────────────────────────────────────────────
const C = {
  bg:        "#0D0D0F",
  card:      "#141416",
  cardHov:   "#1A1A1E",
  surface:   "#111113",
  border:    "rgba(255,255,255,0.06)",
  borderHov: "rgba(255,255,255,0.11)",
  text:      "#EEEEF2",
  muted:     "#8A8A9A",
  hint:      "#4A4A5A",
  violet:    "#7B61FF",
  teal:      "#10CFA8",
  amber:     "#F59E0B",
  red:       "#EF4444",
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
  { topic: "Arrays",   ratio: 1.25 },
  { topic: "Lists",    ratio: 1.2  },
  { topic: "Sorting",  ratio: 0.85 },
  { topic: "BST",      ratio: 1.6  },
  { topic: "Graphs",   ratio: 1.3  },
  { topic: "DP",       ratio: 1.8  },
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

// ── Helper: score color ───────────────────────────────────────
const scoreColor = (n: number) =>
  n >= 70 ? C.teal : n >= 50 ? C.amber : n > 0 ? C.red : C.hint

// ── Sub-components ────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, color: C.muted, margin: "0 0 12px",
      textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500,
    }}>
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
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "1rem 1.25rem",
    }}>
      <p style={{ fontSize: 10, color: C.muted, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </p>
      <p style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color, margin: 0, letterSpacing: "-0.02em" }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 11, color: C.hint, margin: "5px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, { label: string; color: string }> = {
    active:    { label: "Active",    color: C.violet },
    upcoming:  { label: "Upcoming",  color: C.teal   },
    completed: { label: "Completed", color: C.muted  },
  }
  const { label, color } = map[status]
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
      background: color + "22", color, letterSpacing: "0.04em",
    }}>
      {label}
    </span>
  )
}

function SessionCard({
  session, onClick,
}: {
  session: StudySession; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  const pct  = Math.round((session.topicsDone / session.topicsTotal) * 100) || 0
  const col  = scoreColor(session.readiness)
  const days = Math.max(0, Math.ceil((new Date(session.deadline).getTime() - Date.now()) / 86_400_000))

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? C.cardHov : C.card,
        border: `1px solid ${hov ? C.borderHov : C.border}`,
        borderRadius: 12, padding: "1.125rem 1.25rem",
        cursor: "pointer", transition: "background 0.12s, border-color 0.12s",
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{session.name}</span>
            <StatusBadge status={session.status} />
          </div>
          <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
            {session.topicsTotal} topics
            {session.status !== "completed"
              ? ` · ${days}d left · due ${new Date(session.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
              : " · Completed"}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
          <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: col, letterSpacing: "-0.02em" }}>
            {session.readiness}%
          </div>
          <div style={{ fontSize: 9, color: C.hint, textTransform: "uppercase", letterSpacing: "0.05em" }}>readiness</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: C.hint }}>{session.topicsDone}/{session.topicsTotal} topics</span>
          <span style={{ fontSize: 10, color: C.hint }}>{pct}%</span>
        </div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 99 }} />
        </div>
      </div>

      {/* Most deferred */}
      {session.mostDeferred && (
        <p style={{ fontSize: 10, color: C.hint, margin: 0 }}>
          Most deferred:{" "}
          <span style={{ color: C.amber }}>{session.mostDeferred}</span>
        </p>
      )}
    </div>
  )
}

// ── SVG Pace line chart ───────────────────────────────────────
function PaceLineChart({ data }: { data: PacePoint[] }) {
  const W = 480, H = 130
  const PAD = { t: 12, r: 20, b: 32, l: 36 }
  const iW  = W - PAD.l - PAD.r
  const iH  = H - PAD.t - PAD.b
  const minV = 0, maxV = 2.2

  const x = (i: number) => PAD.l + (i / (data.length - 1)) * iW
  const y = (v: number) => PAD.t + ((maxV - v) / (maxV - minV)) * iH
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.ratio).toFixed(1)}`).join(" ")
  const refY = y(1)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>
      {/* Grid lines */}
      {[0.5, 1.0, 1.5, 2.0].map(v => (
        <line key={v} x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)}
          stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
      ))}
      {/* Reference line at 1.0 */}
      <line x1={PAD.l} y1={refY} x2={W - PAD.r} y2={refY}
        stroke={C.teal} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
      <text x={PAD.l - 4} y={refY + 4} textAnchor="end" fontSize={8} fill={C.muted}>1.0×</text>
      {/* Y axis labels */}
      {[0, 0.5, 1.5, 2.0].map(v => (
        <text key={v} x={PAD.l - 4} y={y(v) + 4} textAnchor="end" fontSize={8} fill={C.hint}>{v}</text>
      ))}
      {/* Line */}
      <polyline points={pts} fill="none" stroke={C.violet} strokeWidth={1.8} strokeLinejoin="round" />
      {/* Dots + labels */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.ratio)} r={3.5} fill={C.violet} />
          <circle cx={x(i)} cy={y(d.ratio)} r={6}   fill={C.violet} opacity={0.15} />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill={C.hint}>{d.topic}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Horizontal bar chart ──────────────────────────────────────
function HBarChart({ data, color }: { data: DeferPoint[]; color: string }) {
  const max = Math.max(...data.map(d => d.count))
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 130, fontSize: 11, color: C.muted, textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.topic}
          </span>
          <div style={{ flex: 1, height: 9, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(d.count / max) * 100}%`, background: color, borderRadius: 99, transition: "width 0.6s ease" }} />
          </div>
          <span style={{ fontSize: 10, color: C.hint, width: 14, flexShrink: 0, fontFamily: "monospace" }}>{d.count}</span>
        </div>
      ))}
    </div>
  )
}

// ── Vertical bar chart ────────────────────────────────────────
function VBarChart({ data }: { data: DepthPoint[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110, paddingTop: 20 }}>
      {data.map((d, i) => {
        const col = d.score >= 70 ? C.teal : d.score >= 50 ? C.amber : C.red
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 9, color: col, fontFamily: "monospace", fontWeight: 600 }}>{d.score}</span>
            <div style={{ width: "100%", height: `${d.score}%`, background: col, borderRadius: "3px 3px 0 0", opacity: 0.85 }} />
            <span style={{ fontSize: 9, color: C.hint, textAlign: "center", width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    async function getUser() {
      const { data } = await supabase.auth.getUser()

      if (data.user) {
        setEmail(data.user.email ?? null)
      }
    }

    getUser()
  }, [])

  const activeSessions   = SESSIONS.filter(s => s.status === "active").length
  const totalTopicsThisWeek = SESSIONS.reduce((a, s) => a + s.topicsDone, 0)
  const sessionsWithDepth   = SESSIONS.filter(s => s.avgDepth > 0)
  const avgDepth = sessionsWithDepth.length
    ? Math.round(sessionsWithDepth.reduce((a, s) => a + s.avgDepth, 0) / sessionsWithDepth.length)
    : 0
  const topDeferred = DEFER_DATA[0]?.topic ?? "—"
  

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Top bar ── */}
      <header style={{
        borderBottom: `1px solid ${C.border}`, padding: "0 2rem",
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, background: C.bg, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: C.violet,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: "#fff",
          }}>M</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>Ormify</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, color: C.muted }}>
         {email ?? "Loading..."}
        </span>          
        <button
             onClick={async () => {
            await supabase.auth.signOut()
            router.push("/login")
            }}

            style={{
            fontSize: 12, color: C.hint, background: "none",
            border: `1px solid ${C.border}`, borderRadius: 6,
            padding: "4px 10px", cursor: "pointer",
          }}>
            Sign out
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ maxWidth: 920, margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* Page header + New Session CTA */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.75rem" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 5px", letterSpacing: "-0.025em" }}>
              Your sessions
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {SESSIONS.length} sessions · {activeSessions} active
            </p>
          </div>
          <button
            onClick={() => router.push("/session")}
            style={{
              background: C.violet, color: "#fff", borderRadius: 9,
              padding: "10px 20px", fontSize: 13, fontWeight: 600,
              cursor: "pointer", border: "none", letterSpacing: "-0.01em",
              transition: "opacity 0.12s",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            + New session
          </button>
        </div>

        {/* ── Summary strip ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: "2rem" }}>
          <StatCard label="Topics this week"  value={String(totalTopicsThisWeek)} color={C.violet} />
          <StatCard label="Avg depth score"   value={avgDepth + "%"}              color={C.teal}   sub="across all sessions" />
          <StatCard label="Most deferred"     value=""                            color={C.amber}  sub={topDeferred} />
        </div>

        {/* ── Sessions grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: "2.5rem" }}>
          {SESSIONS.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              onClick={() => router.push(`/study/${s.id}`)}
            />
          ))}
        </div>

        {/* ── Analytics section ── */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "1.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showAnalytics ? "1.5rem" : 0 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.015em" }}>
                Learning analytics
              </h2>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                Pace, depth, and deferral patterns across all sessions
              </p>
            </div>
            <button
              onClick={() => setShowAnalytics(v => !v)}
              style={{
                fontSize: 12, color: C.violet,
                background: C.violet + "18",
                border: `1px solid ${C.violet}33`,
                borderRadius: 7, padding: "7px 14px", cursor: "pointer",
              }}
            >
              {showAnalytics ? "Hide ↑" : "Show analytics ↓"}
            </button>
          </div>

          {showAnalytics && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Pace line chart — full width */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "1.125rem 1.25rem" }}>
                <SectionLabel>Pace accuracy — actual vs estimated (ratio)</SectionLabel>
                <PaceLineChart data={PACE_DATA} />
                <p style={{ fontSize: 10, color: C.hint, margin: "8px 0 0" }}>
                  Dashed line = perfect estimation (1.0×). Above = you underestimated how long that topic takes.
                </p>
              </div>

              {/* Two-col row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "1.125rem 1.25rem" }}>
                  <SectionLabel>Most deferred topics — chronic blind spots</SectionLabel>
                  <HBarChart data={DEFER_DATA} color={C.red} />
                </div>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "1.125rem 1.25rem" }}>
                  <SectionLabel>Depth scores per topic</SectionLabel>
                  <VBarChart data={DEPTH_DATA} />
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
