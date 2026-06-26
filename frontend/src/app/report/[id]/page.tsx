"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ReportData {
  readiness_score: number;
  genuinely_understood: string[];
  surface_read_only: string[];
  deferred_never_touched: string[];
  never_opened: string[];
  recommended_focus: string[];
  hours_until_deadline: number;
}

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 70 ? "#10CFA8" :
    score >= 40 ? "#F59E0B" :
                  "#EF4444";
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative h-32 w-32 flex-shrink-0">
      <svg className="h-32 w-32 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-zinc-200 dark:text-white/10" />
        <circle
          cx="50" cy="50" r={r}
          fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 10px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">/ 100</span>
      </div>
    </div>
  );
}

function TopicGroup({
  label, topics, color, emptyText,
}: { label: string; topics: string[]; color: string; emptyText: string }) {
  return (
    <section className="orm-panel rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>{label}</p>
        {topics.length > 0 && (
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
            {topics.length} topic{topics.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {topics.length === 0 ? (
        <p className="text-sm italic text-zinc-400 dark:text-zinc-500">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {topics.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <span className="mt-0.5 flex-shrink-0 font-bold" style={{ color }}>·</span>
              {t}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.id as string;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/sessions/${sessionId}/report`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <main className="orm-bg flex min-h-screen items-center justify-center">
        <div className="orm-panel orm-panel-violet rounded-2xl px-6 py-5 text-sm text-zinc-500 dark:text-zinc-300">
          Generating your report...
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="orm-bg flex min-h-screen items-center justify-center">
        <div className="orm-panel orm-panel-red rounded-2xl px-6 py-5 text-sm text-red-500">
          Could not load report.
        </div>
      </main>
    );
  }

  const scoreLabel =
    data.readiness_score >= 70 ? { text: "Strong", color: "#10CFA8" } :
    data.readiness_score >= 40 ? { text: "Moderate", color: "#F59E0B" } :
                                  { text: "Needs work", color: "#EF4444" };

  return (
    <div className="orm-bg min-h-screen text-zinc-950 dark:text-white">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-zinc-200/70 bg-white/75 px-6 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f0f0f]/80">
        <button
          onClick={() => router.push(`/study/${sessionId}`)}
          className="orm-ghost rounded-xl px-4 py-2 text-sm font-semibold transition"
        >
          Back to session
        </button>
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Honest report</span>
        <div className="w-28" />
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <section className="orm-panel orm-panel-violet rounded-2xl p-6">
          <div className="flex items-center gap-6">
            <ScoreRing score={Math.round(data.readiness_score)} />
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-400">Overall readiness</p>
              <p className="text-4xl font-bold" style={{ color: scoreLabel.color }}>{scoreLabel.text}</p>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                {Math.round(data.hours_until_deadline)}h until deadline
              </p>
            </div>
          </div>

          {data.recommended_focus.length > 0 && (
            <div className="mt-6 border-t border-zinc-200/70 pt-5 dark:border-white/10">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#7B61FF]">
                Recommended focus order
              </p>
              <div className="flex flex-wrap gap-2">
                {data.recommended_focus.map((t, i) => (
                  <span key={i} className="rounded-full bg-[#7B61FF]/10 px-3 py-1.5 text-xs font-semibold text-[#7B61FF]">
                    {i + 1}. {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <TopicGroup
          label="Genuinely understood"
          topics={data.genuinely_understood}
          color="#10CFA8"
          emptyText="No topics reached strong understanding yet."
        />
        <TopicGroup
          label="Surface read only"
          topics={data.surface_read_only}
          color="#F59E0B"
          emptyText="None. You have not marked any topics as done without a depth check."
        />
        <TopicGroup
          label="Deferred"
          topics={data.deferred_never_touched}
          color="#EF4444"
          emptyText="No permanently deferred topics."
        />
        <TopicGroup
          label="Never opened"
          topics={data.never_opened}
          color="#8A8A9A"
          emptyText="All topics have been started."
        />

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => router.push(`/study/${sessionId}`)}
            className="orm-primary flex-1 rounded-xl py-3 text-sm font-semibold transition"
          >
            Back to studying
          </button>
          {data.deferred_never_touched.length > 0 && (
            <button
              onClick={() => router.push(`/graveyard/${sessionId}`)}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500/15"
            >
              Review deferred
            </button>
          )}
        </div>
      </main>
    </div>
  );
}