"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API } from "../../lib/api";
import { supabase } from "../../lib/supabase";

type SessionStatus = "active" | "upcoming" | "completed";

interface RawTopic {
  id: string;
  status: string;
}

interface RawSession {
  id: string;
  title: string;
  deadline: string;
  topics: RawTopic[];
}

function statusFor(session: RawSession): SessionStatus {
  const topics = session.topics ?? [];
  const started = topics.some((topic) => topic.status === "in_progress" || topic.status === "done");
  if (new Date(session.deadline) < new Date()) return "completed";
  return started ? "active" : "upcoming";
}

function formatDeadline(deadline: string) {
  return new Date(deadline).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SearchSessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<RawSession[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }

      try {
        const res = await fetch(`${API}/sessions?user_id=${data.user.id}`);
        if (!res.ok) throw new Error(`${res.status}`);
        setSessions(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sessions.filter((session) => {
      const status = statusFor(session);
      const searchable = `${session.title} ${status} ${formatDeadline(session.deadline)}`.toLowerCase();
      return searchable.includes(needle);
    });
  }, [query, sessions]);

  return (
    <main className="orm-bg min-h-screen px-6 py-8 text-zinc-950 dark:text-white">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#7B61FF]">Search</p>
            <h1 className="text-3xl font-bold tracking-tight">Search sessions</h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Find a session by name, deadline, or status.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="orm-ghost rounded-xl px-4 py-2 text-sm font-semibold transition"
          >
            Back to dashboard
          </button>
        </header>

        <section className="orm-panel orm-panel-violet mb-5 rounded-2xl p-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Session availability
          </label>
          <input
            className="orm-input w-full rounded-xl px-4 py-3 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search DSA, active, 30 Jun..."
            autoFocus
          />
        </section>

        {loading ? (
          <section className="orm-panel rounded-2xl p-6 text-sm text-zinc-500 dark:text-zinc-300">Loading sessions...</section>
        ) : error ? (
          <section className="orm-panel orm-panel-red rounded-2xl p-6 text-sm text-red-500">Could not load sessions: {error}</section>
        ) : results.length === 0 ? (
          <section className="orm-panel rounded-2xl px-6 py-12 text-center">
            <p className="font-semibold text-zinc-800 dark:text-zinc-200">No matching sessions found.</p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Try a different name, status, or deadline.</p>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {results.map((session) => {
              const topics = session.topics ?? [];
              const done = topics.filter((topic) => topic.status === "done").length;
              const deferred = topics.filter((topic) => topic.status === "deferred").length;
              const status = statusFor(session);
              return (
                <article key={session.id} className="orm-panel rounded-2xl p-5">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold">{session.title}</h2>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Deadline: {formatDeadline(session.deadline)}</p>
                    </div>
                    <span className="rounded-full bg-[#7B61FF]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#7B61FF]">
                      {status}
                    </span>
                  </div>
                  <div className="mb-5 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-zinc-100 p-3 dark:bg-white/5">
                      <p className="font-mono text-lg font-bold">{topics.length}</p>
                      <p className="text-zinc-500 dark:text-zinc-400">topics</p>
                    </div>
                    <div className="rounded-xl bg-[#10CFA8]/10 p-3 text-[#0E9E81] dark:text-[#10CFA8]">
                      <p className="font-mono text-lg font-bold">{done}</p>
                      <p>done</p>
                    </div>
                    <div className="rounded-xl bg-red-500/10 p-3 text-red-500">
                      <p className="font-mono text-lg font-bold">{deferred}</p>
                      <p>deferred</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/study/${session.id}`)}
                    className="orm-primary w-full rounded-xl py-3 text-sm font-semibold transition"
                  >
                    Open session
                  </button>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
