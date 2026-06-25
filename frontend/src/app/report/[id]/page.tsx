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
    score >= 70 ? "#10b981" :
    score >= 40 ? "#f59e0b" :
                  "#ef4444";
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-white/10" />
        <circle
          cx="50" cy="50" r={r}
          fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[9px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-medium">/ 100</span>
      </div>
    </div>
  );
}

function TopicGroup({
  label, topics, color, emptyText,
}: { label: string; topics: string[]; color: string; emptyText: string }) {
  if (topics.length === 0) return (
    <div className="bg-white dark:bg-[#141416] rounded-2xl border border-gray-100 dark:border-white/10 p-5">
      <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color }}>{label}</p>
      <p className="text-sm text-gray-400 dark:text-gray-500 italic">{emptyText}</p>
    </div>
  );
  return (
    <div className="bg-white dark:bg-[#141416] rounded-2xl border border-gray-100 dark:border-white/10 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color }}>{label}</p>
        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{topics.length} topic{topics.length !== 1 ? "s" : ""}</span>
      </div>
      <ul className="space-y-1.5">
        {topics.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-bold mt-0.5 flex-shrink-0" style={{ color }}>·</span>
            {t}
          </li>
        ))}
      </ul>
    </div>
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
      <div className="min-h-screen bg-gray-50 dark:bg-[#0D0D0F] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Generating your report...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0D0D0F] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Could not load report.</p>
      </div>
    );
  }

  const scoreLabel =
    data.readiness_score >= 70 ? { text: "Strong", color: "#10b981" } :
    data.readiness_score >= 40 ? { text: "Moderate", color: "#f59e0b" } :
                                  { text: "Needs work", color: "#ef4444" };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0D0D0F] text-gray-900 dark:text-white">
      {/* Header */}
      <header className="h-14 bg-white dark:bg-[#141416] border-b border-gray-100 dark:border-white/10 flex items-center justify-between px-6">
        <button
          onClick={() => router.push(`/study/${sessionId}`)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-white/15 px-3 py-1.5 rounded-lg transition-colors"
        >
          ← Back to session
        </button>
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Honest report</span>
        <div />
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        {/* Score hero card */}
        <div className="bg-white dark:bg-[#141416] rounded-2xl border border-gray-100 dark:border-white/10 p-6">
          <div className="flex items-center gap-6">
            <ScoreRing score={Math.round(data.readiness_score)} />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-medium mb-1">Overall readiness</p>
              <p className="text-3xl font-bold" style={{ color: scoreLabel.color }}>{scoreLabel.text}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {Math.round(data.hours_until_deadline)}h until deadline
              </p>
            </div>
          </div>

          {data.recommended_focus.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-50 dark:border-white/10">
              <p className="text-[10px] uppercase tracking-widest text-purple-500 dark:text-purple-400 font-semibold mb-2">
                Recommended focus order
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.recommended_focus.map((t, i) => (
                  <span key={i} className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-full">
                    {i + 1}. {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Topic breakdown */}
        <TopicGroup
          label="Genuinely understood"
          topics={data.genuinely_understood}
          color="#10b981"
          emptyText="No topics reached strong understanding yet."
        />
        <TopicGroup
          label="Surface read only"
          topics={data.surface_read_only}
          color="#f59e0b"
          emptyText="None — you haven't marked any topics as done without a depth check."
        />
        <TopicGroup
          label="Deferred — never touched"
          topics={data.deferred_never_touched}
          color="#ef4444"
          emptyText="No permanently deferred topics."
        />
        <TopicGroup
          label="Never opened"
          topics={data.never_opened}
          color="#6b7280"
          emptyText="All topics have been started."
        />

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => router.push(`/study/${sessionId}`)}
            className="flex-1 bg-purple-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            Back to studying →
          </button>
          {data.deferred_never_touched.length > 0 && (
            <button
              onClick={() => router.push(`/graveyard/${sessionId}`)}
              className="border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              Review deferred
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
