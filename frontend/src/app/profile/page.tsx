"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "../../components/ThemeToggle";
import { API } from "../../lib/api";
import { supabase } from "../../lib/supabase";

interface ProfileUser {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
}

interface SessionSummary {
  total_sessions: number;
  active_sessions: number;
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [weeklyTopics, setWeeklyTopics] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }

      setProfile({
        id: data.user.id,
        email: data.user.email ?? "",
        createdAt: data.user.created_at ?? null,
        lastSignInAt: data.user.last_sign_in_at ?? null,
      });

      await Promise.all([
        fetch(`${API}/users/${data.user.id}/sessions/summary`)
          .then((res) => (res.ok ? res.json() : null))
          .then((payload: SessionSummary | null) => setSummary(payload))
          .catch(() => {}),
        fetch(`${API}/users/${data.user.id}/topics/weekly`)
          .then((res) => (res.ok ? res.json() : null))
          .then((payload: { count: number } | null) => setWeeklyTopics(payload?.count ?? null))
          .catch(() => {}),
      ]);

      setLoading(false);
    }

    void load();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main className="orm-bg min-h-screen px-6 py-8 text-zinc-950 dark:text-white">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#7B61FF]">Profile</p>
            <h1 className="text-3xl font-bold tracking-tight">Account</h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Manage your Ormify profile and workspace preferences.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="orm-ghost rounded-xl px-4 py-2 text-sm font-semibold transition"
          >
            Back to dashboard
          </button>
        </header>

        {loading || !profile ? (
          <section className="orm-panel orm-panel-violet rounded-2xl p-6 text-sm text-zinc-500 dark:text-zinc-300">
            Loading profile...
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <section className="orm-panel orm-panel-violet rounded-2xl p-6">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#7B61FF] text-2xl font-bold text-white shadow-[0_0_24px_rgba(123,97,255,0.55)]">
                  {profile.email[0]?.toUpperCase() ?? "U"}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold">{profile.email}</h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Signed in with Supabase auth</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-zinc-100 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Joined</p>
                  <p className="mt-2 font-semibold">{formatDate(profile.createdAt)}</p>
                </div>
                <div className="rounded-xl bg-zinc-100 p-4 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Last sign in</p>
                  <p className="mt-2 font-semibold">{formatDate(profile.lastSignInAt)}</p>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="orm-panel rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Stats</h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Total sessions</span>
                    <span className="font-mono text-lg font-bold">{summary?.total_sessions ?? "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Active sessions</span>
                    <span className="font-mono text-lg font-bold text-[#10CFA8]">{summary?.active_sessions ?? "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">Topics this week</span>
                    <span className="font-mono text-lg font-bold text-[#7B61FF]">{weeklyTopics ?? "-"}</span>
                  </div>
                </div>
              </section>

              <section className="orm-panel rounded-2xl p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold">Theme</h2>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Switch dashboard appearance.</p>
                  </div>
                  <ThemeToggle />
                </div>
              </section>

              <button
                type="button"
                onClick={signOut}
                className="w-full rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-500 transition hover:bg-red-500/15"
              >
                Log out
              </button>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
