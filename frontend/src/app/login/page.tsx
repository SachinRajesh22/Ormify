"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { ThemeToggle } from "../../components/ThemeToggle";

// ── Animation constants ───────────────────────────────────────
const CIRC = 150.8; // 2π × 24 (radius of ring)

type Mode = "login" | "signup";

// ── OrmifyIntro ───────────────────────────────────────────────
// Plays once, then calls onDone() to reveal the real form.
function OrmifyIntro({ onDone }: { onDone: () => void }) {
  const rollingORef  = useRef<HTMLDivElement>(null);
  const ringArcRef   = useRef<SVGCircleElement>(null);
  const ringGapRef   = useRef<SVGCircleElement>(null);
  const ringSvgRef   = useRef<SVGSVGElement>(null);
  const letterRefs   = useRef<(HTMLSpanElement | null)[]>([]);
  const wrapRef      = useRef<HTMLDivElement>(null);
  const headerRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms); timers.push(t); return t;
    };

    function ease(t: number)    { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
    function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }
    function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

    function tween(dur: number, tick: (t: number) => void, done?: () => void) {
      const start = performance.now();
      function step(now: number) {
        const raw = Math.min((now - start) / dur, 1);
        tick(raw);
        if (raw < 1) requestAnimationFrame(step);
        else done?.();
      }
      requestAnimationFrame(step);
    }

    const o   = rollingORef.current!;
    const arc = ringArcRef.current!;
    const gap = ringGapRef.current!;
    const svg = ringSvgRef.current!;

    // 1 — roll O in
    after(() => {
      o.style.opacity = "1";
      tween(600, t => {
        const e = ease(t);
        o.style.transform = `translateX(${lerp(-180, 0, e)}px) rotate(${lerp(0, 360, e)}deg)`;
      }, () => {
        o.style.transform = "translateX(0) rotate(0deg)";
        o.style.boxShadow = "0 0 24px rgba(123,97,255,0.65)";
      });
    }, 200);

    // 2 — letters appear
    [900, 1080, 1230, 1360, 1470].forEach((t, i) => {
      after(() => {
        const el = letterRefs.current[i];
        if (!el) return;
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      }, t);
    });

    // 3 — show ring
    after(() => {
      svg.style.opacity = "1";
      o.style.boxShadow = "none";
    }, 1800);

    // 4 — crack open
    after(() => {
      tween(700, t => {
        const e = easeOut(t);
        gap.style.strokeDasharray  = `${lerp(0, 48, e)} ${CIRC}`;
        gap.style.strokeDashoffset = String(lerp(0, -24, e));
        arc.style.strokeDashoffset = String(lerp(CIRC, 8, e));
      });
    }, 1850);

    // 5 — O glows purple while open
    after(() => {
      o.style.transition  = "box-shadow 0.3s ease, background 0.3s ease";
      o.style.background  = "#9B7FFF";
      o.style.boxShadow   = "0 0 0 6px rgba(123,97,255,0.25), 0 0 32px rgba(123,97,255,0.6)";
    }, 2100);

    // 6 — seal ring
    after(() => {
      tween(550, t => {
        const e = ease(t);
        gap.style.strokeDasharray  = `${lerp(48, 0, e)} ${CIRC}`;
        arc.style.strokeDashoffset = String(lerp(8, 0, e));
      }, () => {
        gap.style.strokeDasharray  = `0 ${CIRC}`;
        arc.style.strokeDashoffset = "0";
      });
    }, 2700);

    // 7 — ring flashes bright then fades
    after(() => { arc.style.transition = "stroke 0.2s ease"; arc.style.stroke = "#C4B5FD"; }, 3280);
    after(() => { svg.style.transition = "opacity 0.3s ease"; svg.style.opacity = "0"; },     3500);

    // 8 — O snaps back clean
    after(() => {
      o.style.background = "#7B61FF";
      o.style.boxShadow  = "0 0 28px rgba(123,97,255,0.55)";
    }, 3300);

    // 9 — whole word floats up and fades
    after(() => {
      const wrap = wrapRef.current!;
      wrap.style.transition = "opacity 0.3s ease, transform 0.7s cubic-bezier(0.34,1.2,0.64,1)";
      wrap.style.opacity    = "0";
      wrap.style.transform  = "translate(-50%, -160px) scale(0.65)";
    }, 3800);

    // 10 — small header O appears
    after(() => {
      const h = headerRef.current!;
      h.style.transition = "opacity 0.45s ease";
      h.style.opacity    = "1";
    }, 4200);

    // 11 — hand off to real form
    after(() => { onDone(); }, 4500);

    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D0D0F]">

      {/* small O that floats to top before handoff */}
      <div
        ref={headerRef}
        style={{ opacity: 0, position: "absolute", top: 28, left: "50%", transform: "translateX(-50%)" }}
        className="flex items-center gap-2.5"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7B61FF] text-sm font-bold text-white"
          style={{ boxShadow: "0 0 20px rgba(123,97,255,0.6)" }}>
          O
        </div>
        <span className="text-base font-bold tracking-tight text-[#EEEEF2]">Ormify</span>
      </div>

      {/* word mark */}
      <div
        ref={wrapRef}
        style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", gap: 0 }}
      >
        {/* O + ring */}
        <div style={{ position: "relative", width: 44, height: 44, marginRight: 2, flexShrink: 0 }}>
          <div
            ref={rollingORef}
            style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "#7B61FF", opacity: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 22, fontWeight: 800,
            }}
          >
            O
          </div>

          <svg
            ref={ringSvgRef}
            viewBox="0 0 56 56"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ position: "absolute", inset: -6, width: "calc(100% + 12px)", height: "calc(100% + 12px)", opacity: 0, pointerEvents: "none" }}
          >
            {/* faint track */}
            <circle cx="28" cy="28" r="24" stroke="rgba(123,97,255,0.15)" strokeWidth="2.5" />
            {/* active arc */}
            <circle
              ref={ringArcRef}
              cx="28" cy="28" r="24"
              stroke="#7B61FF" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC}
              transform="rotate(-90 28 28)"
            />
            {/* gap eraser — same colour as bg */}
            <circle
              ref={ringGapRef}
              cx="28" cy="28" r="24"
              stroke="#0D0D0F" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`0 ${CIRC}`}
              strokeDashoffset="0"
              transform="rotate(-90 28 28)"
            />
          </svg>
        </div>

        {/* r m i f y */}
        {["r","m","i","f","y"].map((ch, i) => (
          <span
            key={ch}
            ref={el => { letterRefs.current[i] = el; }}
            style={{
              fontSize: 36, fontWeight: 800, color: "#EEEEF2",
              opacity: 0, transform: "translateY(10px)",
              transition: "opacity 0.18s ease, transform 0.18s ease",
              letterSpacing: "-0.03em", display: "inline-block",
            }}
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main login page ───────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();
  const [animDone, setAnimDone] = useState(false);
  const [visible,  setVisible]  = useState(false);   // controls fade-in of form
  const [mode,     setMode]     = useState<Mode>("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [message,  setMessage]  = useState<string | null>(null);

  function handleAnimDone() {
    setAnimDone(true);
    // tiny delay so the form mounts before fading in
    setTimeout(() => setVisible(true), 60);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
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
    <>
      {/* animation overlay — unmounts once done */}
      {!animDone && <OrmifyIntro onDone={handleAnimDone} />}

      {/* real login — fades in after animation */}
      <main
        className="orm-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 text-zinc-950 dark:text-white"
        style={{
          opacity:    visible ? 1 : 0,
          transition: "opacity 0.5s ease",
          visibility: animDone ? "visible" : "hidden",
        }}
      >
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
            {/* mode toggle */}
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1 dark:bg-white/5">
              {(["login", "signup"] as Mode[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(null); setMessage(null); }}
                  className={`rounded-lg py-2 text-sm font-semibold transition ${
                    mode === m
                      ? "orm-primary"
                      : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  {m === "login" ? "Log in" : "Sign up"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Email
                </label>
                <input
                  id="email" type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="orm-input w-full rounded-xl px-4 py-3 text-sm placeholder:text-zinc-400"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Password
                </label>
                <input
                  id="password" type="password" required minLength={6}
                  value={password} onChange={e => setPassword(e.target.value)}
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
                {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            {mode === "login" ? (
              <>New here?{" "}
                <button type="button" onClick={() => setMode("signup")} className="font-semibold text-[#7B61FF] hover:underline">
                  Create an account
                </button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button type="button" onClick={() => setMode("login")} className="font-semibold text-[#7B61FF] hover:underline">
                  Log in
                </button>
              </>
            )}
          </p>
        </section>
      </main>
    </>
  );
}