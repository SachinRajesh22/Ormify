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

interface ScheduleTopic {
  id: string;
  name: string;
  estimated_hours: number;
  status: string;
}

interface ScheduleDay {
  day: number;
  date: string;
  planned_hours: number;
  topics: ScheduleTopic[];
}

interface ScheduleData {
  session_title: string;
  days_left: number;
  hours_per_day: number;
  total_planned_days?: number;
  feasible?: boolean;
  overrun_days?: number;
  days: ScheduleDay[];
  message: string;
}

function formatDeadline(deadline: string) {
  return new Date(deadline).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SchedulePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<RawSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSessions() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }

      try {
        const res = await fetch(`${API}/sessions?user_id=${data.user.id}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const payload = (await res.json()) as RawSession[];
        setSessions(payload);
        setSelectedId(payload[0]?.id ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      } finally {
        setLoadingSessions(false);
      }
    }

    void loadSessions();
  }, [router]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    async function loadSchedule(sessionId: string) {
      setLoadingSchedule(true);
      setError(null);
      try {
        const res = await fetch(`${API}/sessions/${sessionId}/schedule`);
        if (!res.ok) throw new Error(`${res.status}`);
        setSchedule(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load schedule");
        setSchedule(null);
      } finally {
        setLoadingSchedule(false);
      }
    }

    void loadSchedule(selectedId);
  }, [selectedId]);

  const selectedSession = useMemo(() => sessions.find((session) => session.id === selectedId) ?? null, [selectedId, sessions]);

  return (
    <main className="orm-bg min-h-screen px-6 py-8 text-zinc-950 dark:text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#10CFA8]">Schedule</p>
            <h1 className="text-3xl font-bold tracking-tight">Study schedule</h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Plan remaining topics across the days before your deadline.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="orm-ghost rounded-xl px-4 py-2 text-sm font-semibold transition"
          >
            Back to dashboard
          </button>
        </header>

        {loadingSessions ? (
          <section className="orm-panel orm-panel-violet rounded-2xl p-6 text-sm text-zinc-500 dark:text-zinc-300">
            Loading sessions...
          </section>
        ) : sessions.length === 0 ? (
          <section className="orm-panel rounded-2xl px-6 py-12 text-center">
            <p className="font-semibold text-zinc-800 dark:text-zinc-200">No sessions yet.</p>
            <button
              type="button"
              onClick={() => router.push("/session")}
              className="orm-primary mt-5 rounded-xl px-5 py-3 text-sm font-semibold transition"
            >
              Create session
            </button>
          </section>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
            <aside className="space-y-3">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedId(session.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    session.id === selectedId
                      ? "border-[#7B61FF]/60 bg-[#7B61FF]/10 shadow-[0_0_24px_rgba(123,97,255,0.18)]"
                      : "border-zinc-200 bg-white/70 hover:border-[#7B61FF]/30 dark:border-white/10 dark:bg-[#141416]/70"
                  }`}
                >
                  <p className="truncate font-semibold">{session.title}</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Due {formatDeadline(session.deadline)}</p>
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {(session.topics ?? []).filter((topic) => topic.status === "pending" || topic.status === "in_progress").length} topics to plan
                  </p>
                </button>
              ))}
            </aside>

            <section className="orm-panel orm-panel-violet rounded-2xl p-5">
              {error ? (
                <p className="text-sm text-red-500">Could not load schedule: {error}</p>
              ) : loadingSchedule ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-300">Building schedule...</p>
              ) : schedule ? (
                <>
                  <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">{schedule.session_title}</h2>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{schedule.message}</p>
                    </div>
                    <div className="flex gap-2 text-center text-xs">
                      <div className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-white/5">
                        <p className="font-mono text-lg font-bold">{schedule.days_left}</p>
                        <p className="text-zinc-500 dark:text-zinc-400">days left</p>
                      </div>
                      <div className="rounded-xl bg-[#10CFA8]/10 px-3 py-2 text-[#0E9E81] dark:text-[#10CFA8]">
                        <p className="font-mono text-lg font-bold">{schedule.hours_per_day}</p>
                        <p>h/day</p>
                      </div>
                    </div>
                  </header>

                  {selectedSession && (
                    <button
                      type="button"
                      onClick={() => router.push(`/study/${selectedSession.id}`)}
                      className="orm-primary mb-5 rounded-xl px-4 py-2 text-sm font-semibold transition"
                    >
                      Start studying
                    </button>
                  )}

                  {schedule.days.length === 0 ? (
                    <div className="rounded-xl bg-zinc-100 px-5 py-8 text-center text-sm text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
                      {schedule.message}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {schedule.days.map((day) => (
                        <article key={`${day.day}-${day.date}`} className="rounded-2xl border border-zinc-200 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                          <div className="mb-4 flex items-center justify-between gap-4">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Day {day.day}</p>
                              <h3 className="mt-1 font-semibold">{day.date}</h3>
                            </div>
                            <span className="rounded-full bg-[#7B61FF]/10 px-3 py-1 text-xs font-bold text-[#7B61FF]">
                              {day.planned_hours}h planned
                            </span>
                          </div>
                          <div className="space-y-2">
                            {day.topics.map((topic) => (
                              <div key={topic.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-100 px-3 py-2 text-sm dark:bg-[#0D0D0F]/70">
                                <span className="truncate">{topic.name}</span>
                                <span className="flex-shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{topic.estimated_hours}h</span>
                              </div>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-300">Select a session to view its schedule.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
