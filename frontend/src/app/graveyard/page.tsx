"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API } from "../../lib/api";
import { supabase } from "../../lib/supabase";

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

function formatDeadline(deadline: string) {
  return new Date(deadline).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function GraveyardIndexPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<RawSession[]>([]);
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

  const deferredSessions = useMemo(() => {
    return sessions
      .map((session) => ({
        ...session,
        deferredCount: (session.topics ?? []).filter((topic) => topic.status === "deferred").length,
      }))
      .filter((session) => session.deferredCount > 0);
  }, [sessions]);

  return (
    <main className="orm-bg min-h-screen px-6 py-8 text-zinc-950 dark:text-white">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#EF4444]">Graveyard</p>
            <h1 className="text-3xl font-bold tracking-tight">Deferred topics</h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Review sessions with deferred topics and recover them when you are ready.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="orm-ghost rounded-xl px-4 py-2 text-sm font-semibold transition"
          >
            Back to dashboard
          </button>
        </header>

        {loading ? (
          <section className="orm-panel orm-panel-violet rounded-2xl p-6 text-sm text-zinc-500 dark:text-zinc-300">
            Loading deferred topics...
          </section>
        ) : error ? (
          <section className="orm-panel orm-panel-red rounded-2xl p-6 text-sm text-red-500">
            Could not load sessions: {error}
          </section>
        ) : deferredSessions.length === 0 ? (
          <section className="orm-panel rounded-2xl px-6 py-12 text-center">
            <p className="font-semibold text-zinc-800 dark:text-zinc-200">No deferred topics right now.</p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">When you defer topics during study, they will appear here.</p>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {deferredSessions.map((session) => (
              <article key={session.id} className="orm-panel orm-panel-red rounded-2xl p-5">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{session.title}</h2>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Deadline: {formatDeadline(session.deadline)}</p>
                  </div>
                  <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-500">
                    {session.deferredCount} deferred
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/graveyard/${session.id}`)}
                  className="orm-primary w-full rounded-xl py-3 text-sm font-semibold transition"
                >
                  Open graveyard
                </button>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
