"use client";

import { useEffect, useState } from "react";
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

  async function load() {
    try {
      const r = await fetch(`${API}/sessions/${sessionId}/graveyard`);
      setData(await r.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [sessionId]);

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
    low:    { bar: "bg-emerald-500", badge: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40", label: "Low urgency" },
    medium: { bar: "bg-amber-500",   badge: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40",   label: "Medium urgency" },
    high:   { bar: "bg-red-500",     badge: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/40",         label: "High urgency" },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0D0D0F] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading graveyard...</p>
      </div>
    );
  }

  const urgency = data?.urgency ?? "low";
  const style = urgencyStyle[urgency];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0D0D0F] text-gray-900 dark:text-white">
      {/* Header */}
      <header className="h-14 bg-white dark:bg-[#141416] border-b border-gray-100 dark:border-white/10 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/study/${sessionId}`)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-white/15 px-3 py-1.5 rounded-lg transition-colors"
          >
            ← Back to session
          </button>
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Deferred topics</span>
        <div />
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-5">
        {/* Urgency banner */}
        {data && (
          <div className={`rounded-xl border px-5 py-4 ${style.badge}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] uppercase tracking-widest font-bold`}>{style.label}</span>
            </div>
            <p className="text-sm leading-relaxed">{data.message}</p>
            <div className="mt-3 flex gap-4 text-xs opacity-80">
              <span>{data.total_deferred_hours}h deferred</span>
              <span>{Math.round(data.hours_until_deadline)}h until deadline</span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {data?.deferred_topics.length === 0 && (
          <div className="bg-white dark:bg-[#141416] rounded-2xl border border-gray-100 dark:border-white/10 px-6 py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400 font-medium">No deferred topics — nice work.</p>
            <button
              onClick={() => router.push(`/study/${sessionId}`)}
              className="mt-4 bg-purple-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              Back to session →
            </button>
          </div>
        )}

        {/* Topic list */}
        {(data?.deferred_topics ?? []).map((topic) => (
          <div
            key={topic.id}
            className="bg-white dark:bg-[#141416] rounded-2xl border border-gray-100 dark:border-white/10 p-5"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-medium mb-0.5">
                  Priority {topic.priority_order}
                </p>
                <h3 className="font-semibold text-gray-900 dark:text-white text-base">{topic.name}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">~{topic.estimated_hours}h estimated</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 flex-shrink-0">
                Deferred
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => resurface(topic.id)}
                disabled={acting === topic.id}
                className="flex-1 border border-purple-200 dark:border-purple-800/50 text-purple-600 dark:text-purple-400 rounded-xl py-2.5 text-sm font-medium hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50"
              >
                {acting === topic.id ? "Moving..." : "Put back in queue →"}
              </button>
              <button
                onClick={() => recover(topic.id)}
                disabled={acting === topic.id}
                className="flex-1 border border-emerald-200 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400 rounded-xl py-2.5 text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
              >
                {acting === topic.id ? "Saving..." : "Mark as done ✓"}
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
