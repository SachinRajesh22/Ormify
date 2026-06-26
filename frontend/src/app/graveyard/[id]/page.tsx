"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface DeferredTopic {
  id: string;
  name: string;
  estimated_hours: number;
  priority_order: number;
  status: string;
}

interface GraveyardData {
  deferred_topics: DeferredTopic[];
  total_deferred_hours: number;
  hours_until_deadline: number;
  urgency: "low" | "medium" | "high";
  message: string;
}

export default function GraveyardPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.id as string;

  const [data, setData] = useState<GraveyardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/sessions/${sessionId}/graveyard`);
      setData(await r.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function resurface(topicId: string) {
    setActing(topicId);
    try {
      await fetch(`${API}/topics/${topicId}/resurface`, { method: "PATCH" });
      await load();
    } finally { setActing(null); }
  }

  async function recover(topicId: string) {
    setActing(topicId);
    try {
      await fetch(`${API}/topics/${topicId}/recover`, { method: "PATCH" });
      await load();
    } finally { setActing(null); }
  }

  const urgencyStyle = {
    low: { panel: "orm-panel", color: "#10CFA8", label: "Low urgency" },
    medium: { panel: "orm-panel orm-panel-amber", color: "#F59E0B", label: "Medium urgency" },
    high: { panel: "orm-panel orm-panel-red", color: "#EF4444", label: "High urgency" },
  };

  if (loading) {
    return (
      <main className="orm-bg flex min-h-screen items-center justify-center">
        <div className="orm-panel orm-panel-violet rounded-2xl px-6 py-5 text-sm text-zinc-500 dark:text-zinc-300">
          Loading deferred topics...
        </div>
      </main>
    );
  }

  const urgency = data?.urgency ?? "low";
  const style = urgencyStyle[urgency];

  return (
    <div className="orm-bg min-h-screen text-zinc-950 dark:text-white">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-zinc-200/70 bg-white/75 px-6 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f0f0f]/80">
        <button
          onClick={() => router.push(`/study/${sessionId}`)}
          className="orm-ghost rounded-xl px-4 py-2 text-sm font-semibold transition"
        >
          Back to session
        </button>
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Deferred topics</span>
        <div className="w-28" />
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-6 py-8">
        {data && (
          <section className={`${style.panel} rounded-2xl px-5 py-4`}>
            <div className="mb-2 flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: style.color, boxShadow: `0 0 16px ${style.color}` }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: style.color }}>{style.label}</span>
            </div>
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{data.message}</p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-white/5">{data.total_deferred_hours}h deferred</span>
              <span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-white/5">{Math.round(data.hours_until_deadline)}h until deadline</span>
            </div>
          </section>
        )}

        {data?.deferred_topics.length === 0 && (
          <section className="orm-panel rounded-2xl px-6 py-12 text-center">
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">No deferred topics. Nice work.</p>
            <button
              onClick={() => router.push(`/study/${sessionId}`)}
              className="orm-primary mt-5 rounded-xl px-5 py-3 text-sm font-semibold transition"
            >
              Back to session
            </button>
          </section>
        )}

        {(data?.deferred_topics ?? []).map((topic) => (
          <article
            key={topic.id}
            className="orm-panel orm-panel-red rounded-2xl p-5"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-widest text-zinc-400">
                  Priority {topic.priority_order}
                </p>
                <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">{topic.name}</h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">~{topic.estimated_hours}h estimated</p>
              </div>
              <span className="flex-shrink-0 rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-500">
                Deferred
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => resurface(topic.id)}
                disabled={acting === topic.id}
                className="orm-ghost rounded-xl py-3 text-sm font-semibold transition disabled:opacity-50"
              >
                {acting === topic.id ? "Moving..." : "Put back in queue"}
              </button>
              <button
                onClick={() => recover(topic.id)}
                disabled={acting === topic.id}
                className="rounded-xl border border-[#10CFA8]/30 bg-[#10CFA8]/10 py-3 text-sm font-semibold text-[#0E9E81] transition hover:bg-[#10CFA8]/15 disabled:opacity-50 dark:text-[#10CFA8]"
              >
                {acting === topic.id ? "Saving..." : "Mark as done"}
              </button>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}