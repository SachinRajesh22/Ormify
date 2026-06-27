"use client"

import { useRouter } from "next/navigation"

const FAQS = [
  {
    q: "How do I create a study session?",
    a: "Click the '+ New Session' button on your dashboard. Give it a name (e.g. 'DSA Exam'), set a deadline, then either upload your syllabus as a PDF or manually add topics. Ormify will extract and structure the topics automatically from a PDF.",
  },
  {
    q: "What does 'Behind', 'Urgent', and 'Active' mean?",
    a: "'Active' means your session is in progress and on track. 'Urgent' means the deadline is approaching soon (within your buffer window). 'Behind' means the deadline has passed but topics are still incomplete. 'Completed' means every topic is marked done.",
  },
  {
    q: "How does the pace tracker work?",
    a: "Every time you start the timer on a topic and mark it done, Ormify compares your actual time vs the estimated time. This gives a pace ratio — if you're consistently taking longer than estimated, you'll be flagged as behind.",
  },
  {
    q: "What is a depth check?",
    a: "A depth check is a quick AI-generated MCQ quiz on a specific topic to test how well you actually understand it — not just whether you've read it. You can trigger one from any topic card in your study session.",
  },
  {
    q: "What is SocraBot?",
    a: "SocraBot is your AI study assistant available on every page. On a study session page, it has live access to your pace, deadline, and deferred topics so it can give specific advice. Ask it anything — concepts, what to study next, or how you're doing.",
  },
  {
    q: "What is the Graveyard?",
    a: "When you defer a topic (skip it for now), it moves to the Graveyard. You can revisit deferred topics there and choose to resurface them back into your session or mark them as done.",
  },
  {
    q: "How do email notifications work?",
    a: "Go to Settings → Notifications to turn on deadline reminders, daily study nudges, or streak alerts. Once enabled, Ormify will email you automatically — deadline reminders every 6 hours when due within 7 days, daily nudges at 8 AM, and streak alerts at 8 PM.",
  },
  {
    q: "What does the readiness score mean?",
    a: "The readiness score on your dashboard shows how prepared you are for a session based on topics completed and depth check results. 80%+ is considered exam-ready (you can change this threshold in Settings → Study).",
  },
  {
    q: "Can I export my study data?",
    a: "Yes. Go to Settings → Data → Export JSON to download all your sessions and topics as a JSON file.",
  },
]

const STEPS = [
  { n: 1, title: "Create a session", desc: "Hit '+ New Session', name it after your exam, and set the deadline." },
  { n: 2, title: "Add your syllabus", desc: "Upload a PDF or paste your topic list. Ormify extracts everything automatically." },
  { n: 3, title: "Start studying", desc: "Open a session, start the timer on a topic, study it, then mark it done." },
  { n: 4, title: "Check your depth", desc: "After finishing a topic, take a depth check quiz to confirm you actually understood it." },
  { n: 5, title: "Track your pace", desc: "Watch the pace indicator — it tells you if you'll finish before the deadline at your current speed." },
  { n: 6, title: "Ask SocraBot", desc: "Stuck or unsure what to study next? Ask SocraBot the floating AI button anytime." },
]

export default function HelpPage() {
  const router = useRouter()

  return (
    <div className="orm-bg min-h-screen text-zinc-950 dark:text-white">

      {/* Header */}
      <header className="h-16 bg-white/75 dark:bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-zinc-200/70 dark:border-white/10 flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7B61FF] text-xs font-bold text-white shadow-[0_0_16px_rgba(123,97,255,0.6)]">
            O
          </div>
          <span className="font-semibold text-sm">Help & Guide</span>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="orm-ghost text-xs px-3 py-2 rounded-lg transition"
        >
          ← Dashboard
        </button>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-12 space-y-14">

        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#7B61FF] text-2xl font-bold text-white shadow-[0_0_32px_rgba(123,97,255,0.5)]">
            O
          </div>
          <h1 className="text-3xl font-bold tracking-tight">How Ormify works</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-md mx-auto leading-relaxed">
            Ormify helps you plan, track, and ace your exams — with AI-powered depth checks, live pace tracking, and smart reminders.
          </p>
        </div>

        {/* Quick start */}
        <section>
          <h2 className="text-lg font-semibold mb-5">Quick start</h2>
          <div className="space-y-3">
            {STEPS.map((step) => (
              <div key={step.n} className="orm-panel rounded-xl px-5 py-4 flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7B61FF]/15 text-sm font-bold text-[#7B61FF]">
                  {step.n}
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{step.title}</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features overview */}
        <section>
          <h2 className="text-lg font-semibold mb-5">Features at a glance</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: "⏱", title: "Pace tracker", desc: "Live calculation of whether you'll finish before the deadline." },
              { icon: "🧠", title: "Depth checks", desc: "AI MCQ quizzes to verify you understood each topic." },
              { icon: "🤖", title: "SocraBot", desc: "AI assistant with live session context. Ask it anything." },
              { icon: "📅", title: "Study schedule", desc: "Day-by-day plan auto-generated from your topics and deadline." },
              { icon: "⚰️", title: "Graveyard", desc: "Deferred topics tracked here so nothing gets forgotten." },
              { icon: "📊", title: "Honest report", desc: "Pre-exam breakdown of what you truly understand vs surface-read." },
              { icon: "🔔", title: "Email reminders", desc: "Deadline alerts, daily nudges, and streak protection." },
              { icon: "🔍", title: "Search sessions", desc: "Find any past or active session instantly." },
            ].map((f) => (
              <div key={f.title} className="orm-panel rounded-xl px-4 py-4 flex items-start gap-3">
                <span className="text-xl">{f.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{f.title}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-lg font-semibold mb-5">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq) => (
              <details key={faq.q} className="orm-panel rounded-xl group">
                <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-sm font-medium text-zinc-900 dark:text-white list-none select-none">
                  {faq.q}
                  <span className="ml-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180">
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </summary>
                <p className="border-t border-zinc-100 dark:border-white/[0.06] px-5 py-4 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="orm-panel orm-panel-violet rounded-2xl px-6 py-6 text-center space-y-2">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Still need help?</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Reach out to the Ormify team at{" "}
            <a href="mailto:ormify2026@gmail.com" className="text-[#7B61FF] hover:underline font-medium">
              ormify2026@gmail.com
            </a>
          </p>
        </section>

      </div>
    </div>
  )
}
