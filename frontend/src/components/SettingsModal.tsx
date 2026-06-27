"use client"

import { useState, useEffect, useCallback } from "react"
import { useTheme } from "../lib/theme"
import { supabase } from "../lib/supabase"
import { useRouter } from "next/navigation"
import { API } from "../lib/api"

// ── Types ──────────────────────────────────────────────────────
type Difficulty = "easy" | "balanced" | "hard"
type Section = "General" | "Study" | "SocraBot" | "Notifications" | "Data" | "Account"

export interface OrmifySettings {
  sidebarExpanded: boolean
  dailyTopicGoal: number
  readinessThreshold: number
  deadlineBuffer: number
  difficulty: Difficulty
  questionsPerSession: number
  socraBotHints: boolean
  deadlineReminders: boolean
  dailyReminder: boolean
  streakAlerts: boolean
}

const DEFAULTS: OrmifySettings = {
  sidebarExpanded: true,
  dailyTopicGoal: 5,
  readinessThreshold: 80,
  deadlineBuffer: 1,
  difficulty: "balanced",
  questionsPerSession: 5,
  socraBotHints: true,
  deadlineReminders: true,
  dailyReminder: false,
  streakAlerts: true,
}

export function loadOrmifySettings(): OrmifySettings {
  if (typeof window === "undefined") return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem("ormify-settings")
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<OrmifySettings>) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

function saveSettings(s: OrmifySettings) {
  localStorage.setItem("ormify-settings", JSON.stringify(s))
}

// ── Shared styles ──────────────────────────────────────────────
const selectCls =
  "rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-zinc-900 dark:text-zinc-100 px-3 py-1.5 focus:outline-none focus:border-[#7B61FF] cursor-pointer transition"
const numCls =
  "w-20 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-zinc-900 dark:text-zinc-100 px-3 py-1.5 text-center focus:outline-none focus:border-[#7B61FF] transition"

// ── Sub-components ─────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7B61FF] ${
        checked ? "bg-[#7B61FF]" : "bg-zinc-300 dark:bg-zinc-600"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  )
}

function Row({ label, description, control }: {
  label: string
  description?: string
  control: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-zinc-100 py-4 last:border-0 dark:border-white/[0.06]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

function SectionHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{sub}</p>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────
function Icon({ d, extra }: { d: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {d}{extra}
    </svg>
  )
}

const NAV_ITEMS: { key: Section; icon: React.ReactNode }[] = [
  {
    key: "General",
    icon: <Icon d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" /></>} />,
  },
  {
    key: "Study",
    icon: <Icon d={<><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>} />,
  },
  {
    key: "SocraBot",
    icon: <Icon d={<path d="M12 2 15 9l7 3-7 3-3 7-3-7-7-3 7-3Z" />} />,
  },
  {
    key: "Notifications",
    icon: <Icon d={<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>} />,
  },
  {
    key: "Data",
    icon: <Icon d={<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" /></>} />,
  },
  {
    key: "Account",
    icon: <Icon d={<><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" /></>} />,
  },
]

// ── Main component ─────────────────────────────────────────────
export function SettingsModal({ open, onClose, userEmail, onSidebarDefaultChange, onSettingsChange }: {
  open: boolean
  onClose: () => void
  userEmail: string
  onSidebarDefaultChange?: (expanded: boolean) => void
  onSettingsChange?: (settings: OrmifySettings) => void
}) {
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()
  const [active, setActive] = useState<Section>("General")
  const [s, setS] = useState<OrmifySettings>(DEFAULTS)
  const [exportBusy, setExportBusy] = useState(false)
  const [clearBusy, setClearBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // On open: load local settings then overlay notification prefs from Supabase
  useEffect(() => {
    if (!open) return
    setS(loadOrmifySettings())
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      fetch(`${API}/users/${data.user.id}/preferences`)
        .then(r => r.ok ? r.json() : null)
        .then((prefs: { deadline_reminders: boolean; daily_reminder: boolean; streak_alerts: boolean } | null) => {
          if (!prefs) return
          setS(prev => ({
            ...prev,
            deadlineReminders: prefs.deadline_reminders,
            dailyReminder:     prefs.daily_reminder,
            streakAlerts:      prefs.streak_alerts,
          }))
        })
        .catch(() => {})
    })
  }, [open])

  const set = useCallback(<K extends keyof OrmifySettings>(key: K, val: OrmifySettings[K]) => {
    setS(prev => {
      const next = { ...prev, [key]: val }
      saveSettings(next)
      return next
    })
    setTimeout(() => onSettingsChange?.(loadOrmifySettings()), 0)
  }, [onSettingsChange])

  // Saves all 3 notification toggles to Supabase after any one changes
  async function saveNotifPrefs(overrides: Partial<Pick<OrmifySettings, "deadlineReminders" | "dailyReminder" | "streakAlerts">>) {
    const { data } = await supabase.auth.getUser()
    if (!data.user?.email) return
    const current = loadOrmifySettings()
    const merged  = { ...current, ...overrides }
    await fetch(`${API}/users/${data.user.id}/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:                data.user.email,
        deadline_reminders:   merged.deadlineReminders,
        daily_reminder:       merged.dailyReminder,
        streak_alerts:        merged.streakAlerts,
      }),
    }).catch(() => {})
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  async function handleExport() {
    setExportBusy(true)
    try {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return
      const res = await fetch(`${API}/sessions?user_id=${data.user.id}`)
      if (!res.ok) return
      const blob = new Blob([await res.text()], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `ormify-sessions-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportBusy(false)
    }
  }

  async function handleClearAnalytics() {
    if (!confirm("Clear all analytics history? Pace, depth, and deferral records will be deleted. Sessions stay intact.")) return
    setClearBusy(true)
    try {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return
      await fetch(`${API}/users/${data.user.id}/analytics`, { method: "DELETE" })
    } finally {
      setClearBusy(false)
    }
  }

  async function handleDeleteAccount() {
    if (!confirm("Permanently delete your account and ALL data? This cannot be undone.")) return
    if (!confirm("Are you absolutely sure? Everything will be gone.")) return
    setDeleteBusy(true)
    try {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return
      await fetch(`${API}/users/${data.user.id}`, { method: "DELETE" })
      await supabase.auth.signOut()
      router.push("/login")
    } finally {
      setDeleteBusy(false)
    }
  }

  async function sendNotification(type: string) {
    const { data } = await supabase.auth.getUser()
    if (!data.user?.email) return
    await fetch(`${API}/users/${data.user.id}/notifications/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.user.email, type }),
    }).catch(() => {})
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (!open) return null

  function renderContent() {
    switch (active) {
      case "General":
        return (
          <>
            <SectionHeading title="General" sub="Appearance and interface preferences." />
            <Row
              label="Appearance"
              description="Switch between light and dark interface."
              control={
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                    theme === "dark"
                      ? "border-[#7B61FF]/40 bg-[#7B61FF]/10 text-[#b9adff]"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {theme === "dark" ? (
                    <>
                      <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                      Dark
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                      </svg>
                      Light
                    </>
                  )}
                </button>
              }
            />
            <Row
              label="Sidebar default"
              description="Start with the sidebar expanded when you open the dashboard."
              control={<Toggle checked={s.sidebarExpanded} onChange={v => {
                set("sidebarExpanded", v)
                onSidebarDefaultChange?.(v)
              }} />}
            />
          </>
        )

      case "Study":
        return (
          <>
            <SectionHeading title="Study preferences" sub="Control how Ormify tracks and measures your progress." />
            <Row
              label="Daily topic goal"
              description="Number of topics you aim to study each day."
              control={
                <input
                  type="number" min={1} max={50}
                  value={s.dailyTopicGoal}
                  onChange={e => set("dailyTopicGoal", Math.max(1, parseInt(e.target.value) || 1))}
                  className={numCls}
                />
              }
            />
            <Row
              label="Readiness threshold"
              description="Minimum % completion to consider a session exam-ready."
              control={
                <select value={s.readinessThreshold} onChange={e => set("readinessThreshold", parseInt(e.target.value))} className={selectCls}>
                  {[60, 70, 75, 80, 85, 90, 95, 100].map(v => <option key={v} value={v}>{v}%</option>)}
                </select>
              }
            />
            <Row
              label="Deadline buffer"
              description="Start marking urgency N days before the actual exam date."
              control={
                <select value={s.deadlineBuffer} onChange={e => set("deadlineBuffer", parseInt(e.target.value))} className={selectCls}>
                  <option value={0}>Same day</option>
                  <option value={1}>1 day before</option>
                  <option value={2}>2 days before</option>
                  <option value={3}>3 days before</option>
                </select>
              }
            />
          </>
        )

      case "SocraBot":
        return (
          <>
            <SectionHeading title="SocraBot" sub="Tune how your AI study companion quizzes you." />
            <Row
              label="Question difficulty"
              description="How challenging SocraBot's depth-check questions are."
              control={
                <select value={s.difficulty} onChange={e => set("difficulty", e.target.value as Difficulty)} className={selectCls}>
                  <option value="easy">Easy</option>
                  <option value="balanced">Balanced</option>
                  <option value="hard">Hard</option>
                </select>
              }
            />
            <Row
              label="Questions per session"
              description="How many questions SocraBot asks per depth check."
              control={
                <input
                  type="number" min={1} max={20}
                  value={s.questionsPerSession}
                  onChange={e => set("questionsPerSession", Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  className={numCls}
                />
              }
            />
            <Row
              label="Show hints"
              description="Let SocraBot offer a hint when you're stuck on a question."
              control={<Toggle checked={s.socraBotHints} onChange={v => set("socraBotHints", v)} />}
            />
          </>
        )

      case "Notifications":
        return (
          <>
            <SectionHeading title="Notifications" sub="Toggle on to receive email reminders at your account address." />
            <Row
              label="Deadline reminders"
              description="Automated email every 6 hours when a session is due within 7 days."
              control={<Toggle checked={s.deadlineReminders} onChange={v => {
                set("deadlineReminders", v)
                void saveNotifPrefs({ deadlineReminders: v })
                if (v) void sendNotification("deadline_reminder")
              }} />}
            />
            <Row
              label="Daily study reminder"
              description="Automated email every morning at 8 AM to keep you on track."
              control={<Toggle checked={s.dailyReminder} onChange={v => {
                set("dailyReminder", v)
                void saveNotifPrefs({ dailyReminder: v })
                if (v) void sendNotification("daily_reminder")
              }} />}
            />
            <Row
              label="Streak alerts"
              description="Automated email every evening at 8 PM if you haven't studied today."
              control={<Toggle checked={s.streakAlerts} onChange={v => {
                set("streakAlerts", v)
                void saveNotifPrefs({ streakAlerts: v })
                if (v) void sendNotification("streak_alert")
              }} />}
            />
          </>
        )

      case "Data":
        return (
          <>
            <SectionHeading title="Data & privacy" sub="Manage and export your study data." />
            <Row
              label="Export sessions"
              description="Download all your sessions and topics as a JSON file."
              control={
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exportBusy}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  {exportBusy ? "Exporting…" : "Export JSON"}
                </button>
              }
            />
            <Row
              label="Clear analytics"
              description="Delete your pace, depth, and deferral history. Sessions stay intact."
              control={
                <button
                  type="button"
                  onClick={handleClearAnalytics}
                  disabled={clearBusy}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                >
                  {clearBusy ? "Clearing…" : "Clear"}
                </button>
              }
            />
          </>
        )

      case "Account":
        return (
          <>
            <SectionHeading title="Account" sub="Your login details and account actions." />
            <Row
              label="Email"
              description="Your Ormify account email address."
              control={
                <span className="select-all rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                  {userEmail}
                </span>
              }
            />
            <Row
              label="Sign out"
              description="Sign out of your Ormify account on this device."
              control={
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  Sign out
                </button>
              }
            />
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/5">
              <p className="mb-3 text-sm text-red-700 dark:text-red-400 leading-relaxed">
                This will permanently delete your account, all sessions, topics, analytics, and study history. This cannot be undone.
              </p>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteBusy}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                {deleteBusy ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex h-[580px] w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#141416]">

        {/* Left nav */}
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-zinc-100 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-[#0f0f11]">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Settings
          </p>
          {NAV_ITEMS.map(({ key, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                active === key
                  ? "bg-white text-zinc-950 shadow-sm dark:bg-white/10 dark:text-white"
                  : "text-zinc-600 hover:bg-white/70 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
              }`}
            >
              <span className={active === key ? "text-[#7B61FF]" : ""}>{icon}</span>
              {key}
            </button>
          ))}
        </nav>

        {/* Right panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-white/[0.06]">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Ormify
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Section content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  )
}
