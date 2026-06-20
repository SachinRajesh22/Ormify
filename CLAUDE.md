# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two-part monorepo, each part with its own toolchain and env:

- `frontend/` — Next.js 16 (App Router) + React 19 + Tailwind v4 + TypeScript. The actual product UI.
- `backend/` — Python scripts talking to Supabase with the **service** key. Currently just a Supabase client (`supabase_client.py`) and a scratch `test.py`; no package manifest or web server yet.

Ormify is a study-planning app: users create study "sessions" (e.g. "DSA Exam") with a deadline, topics get extracted (intended to come from the Claude API — see `DUMMY_EXTRACTED` / "simulates Claude API response" in `frontend/src/app/session/page.tsx`), and the dashboard tracks readiness, pace, depth, and deferral analytics. Most data on the dashboard/session pages is currently hardcoded dummy data, not yet wired to Supabase.

## Commands

Frontend (run inside `frontend/`):

```bash
npm run dev      # dev server on http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint (flat config, next + typescript rules)
```

There is **no test runner** configured in either part. `backend/test.py` is a manual smoke script, run with `python test.py` from `backend/` after setting up env + the `supabase` Python package (no `requirements.txt` exists — install `supabase` and `python-dotenv` manually).

## Critical: Next.js version

`frontend/AGENTS.md` (loaded via `frontend/CLAUDE.md`) warns that this is Next.js 16, which has breaking changes from older versions in your training data. **Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing Next.js code**, and heed deprecation notices rather than assuming older API shapes.

## Frontend architecture notes

**Two parallel styling systems coexist — match whichever a file already uses:**

1. **Tailwind v4 + global dark mode** (`login/page.tsx`, `layout.tsx`). Dark mode is class-based: `.dark` on `<html>` toggled by `ThemeProvider` in `src/lib/theme.tsx` (persists to `localStorage` key `ormify-theme`). `layout.tsx` injects a blocking inline script in `<head>` to set the class before paint (avoids FOUC). The custom variant `@custom-variant dark (&:where(.dark, .dark *))` is defined in `globals.css`. Use `dark:` Tailwind variants here.
2. **Inline-style color-token objects** (`dashboard/page.tsx`, `session/page.tsx`). These define local `C` / `DARK` / `LIGHT` constant objects of hex colors and style everything via React `style={{...}}` props — they do **not** respond to the global theme toggle and are effectively hardcoded dark. Note `dashboard/page.tsx` defines `DARK`/`LIGHT` but references an undefined `C` — a latent bug if that path renders.

**Path alias:** `tsconfig.json` maps `@/*` to `./*` (the `frontend/` root, not `src/`). Existing code mostly uses relative imports (`../../lib/supabase`); follow the local convention.

**Supabase / auth:** `src/lib/supabase.ts` exports a single browser client built from `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (falls back to placeholders if unset, so the build never crashes on missing env). Auth uses Supabase directly in client components: `supabase.auth.signUp`/`signInWithPassword` in `login`, `supabase.auth.getUser` / `signOut` in `dashboard`. There is no route protection/middleware — pages fetch the user client-side and don't redirect unauthenticated users.

## Environment

- `frontend/.env.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon/public key, see `.env.local.example`).
- `backend/.env` — `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service-role key, server-side only; see `.env.example`).

All env files are gitignored.
