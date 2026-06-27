"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { API } from "../../lib/api"

interface Usage {
  is_premium: boolean
  calls_today: number
  limit: number | null
}

export default function UpgradePage() {
  const router = useRouter()
  const [usage, setUsage] = useState<Usage | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [upgraded, setUpgraded] = useState(false)
  const [upgradeError, setUpgradeError] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelError, setCancelError] = useState("")
  const [email, setEmail] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push("/login"); return }
      setEmail(data.user.email ?? "")
      fetch(`${API}/users/${data.user.id}/ai-usage`)
        .then(r => r.ok ? r.json() : null)
        .then((d: Usage | null) => { if (d) setUsage(d) })
        .catch(() => {})
    })
  }, [router])

  async function handleCancel() {
    setCancelling(true)
    setCancelError("")
    try {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return
      const res = await fetch(`${API}/users/${data.user.id}/cancel-subscription`, { method: "POST" })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setCancelled(true)
      setTimeout(() => router.push("/dashboard"), 2000)
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Could not reach the server.")
    } finally {
      setCancelling(false)
      setCancelConfirm(false)
    }
  }

  async function handleUpgrade() {
    setUpgrading(true)
    setUpgradeError("")
    try {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return
      const res = await fetch(`${API}/users/${data.user.id}/upgrade`, { method: "POST" })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setUpgraded(true)
      setTimeout(() => router.push("/dashboard"), 2000)
    } catch (e) {
      setUpgradeError(e instanceof Error ? e.message : "Could not reach the server. Make sure the backend is running.")
    } finally {
      setUpgrading(false)
    }
  }

  const isPremium = usage?.is_premium
  const pct = usage && usage.limit ? Math.min(100, Math.round((usage.calls_today / usage.limit) * 100)) : 0

  return (
    <div className="orm-bg min-h-screen text-zinc-950 dark:text-white">

      {/* Header */}
      <header className="h-16 bg-white/75 dark:bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-zinc-200/70 dark:border-white/10 flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7B61FF] text-xs font-bold text-white shadow-[0_0_16px_rgba(123,97,255,0.6)]">
            O
          </div>
          <span className="font-semibold text-sm">Upgrade</span>
        </div>
        <button onClick={() => router.push("/dashboard")} className="orm-ghost text-xs px-3 py-2 rounded-lg transition">
          ← Dashboard
        </button>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-14 space-y-12">

        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">Unlock unlimited AI</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-md mx-auto leading-relaxed">
            Free users get {usage?.limit ?? 20} AI calls per day. Premium removes all limits — unlimited depth checks, SocraBot, and study materials.
          </p>
        </div>

        {/* Usage bar (free users only) */}
        {usage && !isPremium && (
          <div className="orm-panel rounded-2xl px-6 py-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Today&apos;s AI usage</span>
              <span className={`font-semibold ${pct >= 100 ? "text-red-500" : pct >= 75 ? "text-amber-500" : "text-emerald-500"}`}>
                {usage.calls_today} / {usage.limit} calls
              </span>
            </div>
            <div className="h-2.5 bg-zinc-200 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-[#7B61FF]"} shadow-[0_0_12px_rgba(123,97,255,0.6)]`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {pct >= 100 && (
              <p className="text-xs text-red-500 font-medium">Limit reached — AI features are paused until midnight UTC. Upgrade to continue now.</p>
            )}
          </div>
        )}

        {/* Already premium */}
        {isPremium && (
          <div className="orm-panel orm-panel-violet rounded-2xl px-6 py-6 text-center space-y-4">
            {cancelled ? (
              <>
                <p className="text-2xl">✓</p>
                <p className="font-semibold text-zinc-900 dark:text-white">Subscription cancelled</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">You&apos;ve been moved to the free plan. Redirecting…</p>
              </>
            ) : (
              <>
                <p className="text-2xl">✦</p>
                <p className="font-semibold text-zinc-900 dark:text-white">You&apos;re on Premium</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Enjoy unlimited AI across all of Ormify.</p>
                {!cancelConfirm ? (
                  <button
                    onClick={() => setCancelConfirm(true)}
                    className="text-xs text-zinc-400 hover:text-red-500 transition underline underline-offset-2 mt-1"
                  >
                    Cancel subscription
                  </button>
                ) : (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Are you sure? You&apos;ll lose unlimited AI access.</p>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="rounded-lg bg-red-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition disabled:opacity-60"
                      >
                        {cancelling ? "Cancelling…" : "Yes, cancel"}
                      </button>
                      <button
                        onClick={() => setCancelConfirm(false)}
                        className="rounded-lg border border-zinc-200 dark:border-white/10 px-4 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 transition"
                      >
                        Keep Premium
                      </button>
                    </div>
                    {cancelError && <p className="text-xs text-red-500">{cancelError}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Pricing cards */}
        {!isPremium && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

            {/* Free */}
            <div className="orm-panel rounded-2xl px-6 py-7 space-y-5 flex flex-col">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-1">Free</p>
                <p className="text-3xl font-bold">₹0</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Forever free</p>
              </div>
              <ul className="space-y-2.5 flex-1">
                {[
                  `${usage?.limit ?? 20} AI calls per day`,
                  "Unlimited sessions & topics",
                  "Pace tracker",
                  "Study schedule",
                  "Graveyard & reports",
                  "Email reminders",
                ].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="text-emerald-500 font-bold">✓</span>{f}
                  </li>
                ))}
              </ul>
              <div className="rounded-xl border border-zinc-200 dark:border-white/10 py-2.5 text-center text-sm font-medium text-zinc-400">
                Your current plan
              </div>
            </div>

            {/* Premium */}
            <div className="relative rounded-2xl border-2 border-[#7B61FF] bg-white dark:bg-[#141416] px-6 py-7 space-y-5 flex flex-col shadow-[0_0_32px_rgba(123,97,255,0.18)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#7B61FF] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                Most popular
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[#7B61FF] mb-1">Premium</p>
                <div className="flex items-end gap-1">
                  <p className="text-3xl font-bold">₹149</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">/ month</p>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Billed monthly</p>
              </div>
              <ul className="space-y-2.5 flex-1">
                {[
                  "Unlimited AI calls",
                  "Unlimited sessions & topics",
                  "Pace tracker",
                  "Study schedule",
                  "Graveyard & reports",
                  "Email reminders",
                  "Priority support",
                ].map((f, i) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-700 dark:text-zinc-200">
                    <span className={`font-bold ${i === 0 ? "text-[#7B61FF]" : "text-emerald-500"}`}>✓</span>{f}
                  </li>
                ))}
              </ul>

              {upgraded ? (
                <div className="rounded-xl bg-emerald-500 py-3 text-center text-sm font-semibold text-white">
                  Upgraded! Redirecting…
                </div>
              ) : (
                <>
                  <button
                    onClick={handleUpgrade}
                    disabled={upgrading}
                    className="rounded-xl bg-[#7B61FF] py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(123,97,255,0.4)] transition hover:opacity-90 disabled:opacity-60"
                  >
                    {upgrading ? "Activating…" : "Get Premium →"}
                  </button>
                  {upgradeError && (
                    <p className="text-xs text-red-500 text-center">{upgradeError}</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* What counts as an AI call */}
        <section className="orm-panel rounded-2xl px-6 py-5 space-y-4">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">What counts as an AI call?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { icon: "🧠", label: "Depth check quiz", count: "1 per quiz" },
              { icon: "🤖", label: "SocraBot message", count: "1 per message" },
              { icon: "📖", label: "Study material", count: "1 per topic" },
              { icon: "⚡", label: "Challenge brief", count: "1 per topic" },
              { icon: "📄", label: "Syllabus parse", count: "1 per upload" },
            ].map(item => (
              <div key={item.label} className="rounded-xl bg-zinc-50 dark:bg-white/5 px-3 py-3 space-y-1">
                <span className="text-lg">{item.icon}</span>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{item.label}</p>
                <p className="text-[10px] text-zinc-400">{item.count}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Contact */}
        {!isPremium && (
          <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
            Questions? Email us at{" "}
            <a href={`mailto:ormify2026@gmail.com?subject=Ormify Premium - ${email}`} className="text-[#7B61FF] hover:underline">
              ormify2026@gmail.com
            </a>
          </p>
        )}
      </div>
    </div>
  )
}
