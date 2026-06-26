"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ThemeToggle } from "../../components/ThemeToggle";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/dashboard");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage("Check your email to confirm your account, then log in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="orm-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 text-zinc-950 dark:text-white">
      <div className="absolute right-10 top-8 z-10">
        <ThemeToggle />
      </div>

      <section className="relative z-10 w-full max-w-md">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-[#7B61FF] shadow-[0_0_32px_rgba(123,97,255,0.75)]" />
          <h1 className="text-4xl font-bold tracking-tight">Ormify</h1>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-300">
            Plan it. Pace it. Know what you actually learned.
          </p>
        </header>

        <div className="orm-panel orm-panel-violet rounded-2xl p-6">
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1 dark:bg-white/5">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setMessage(null);
              }}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === "login"
                  ? "orm-primary"
                  : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
                setMessage(null);
              }}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === "signup"
                  ? "orm-primary"
                  : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="orm-input w-full rounded-xl px-4 py-3 text-sm placeholder:text-zinc-400"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="orm-input w-full rounded-xl px-4 py-3 text-sm placeholder:text-zinc-400"
              />
            </div>

            {error && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
            {message && (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500" role="status">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="orm-primary w-full rounded-xl py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Log in"
                : "Create account"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          {mode === "login" ? (
            <>
              New here?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-semibold text-[#7B61FF] hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("login")}
                className="font-semibold text-[#7B61FF] hover:underline"
              >
                Log in
              </button>
            </>
          )}
        </p>
      </section>
    </main>
  );
}
