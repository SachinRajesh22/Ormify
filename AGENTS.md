# Repository agent guidance

This is a two-part monorepo:

- `frontend/` — Next.js 16 App Router + React 19 + Tailwind v4 + TypeScript + Supabase browser auth.
- `backend/` — Python scripts that use Supabase service-role credentials. There is no package manifest and no server framework yet.

## Important guidance

- Read `CLAUDE.md` before editing. It summarizes the repo layout, env setup, and frontend styling/Next.js notes.
- Also read `frontend/AGENTS.md` for frontend-specific Next.js guidance.
- Do not assume older Next.js App Router or React conventions. This repo targets Next.js 16 and may break patterns from Next.js 13/14.
- The frontend currently uses relative import style in most components, even though `tsconfig.json` maps `@/*` to the repo root.
- Many frontend pages still use hardcoded or dummy data and are not fully wired to Supabase.
- There is no test runner configured in either part.

## Commands

- Frontend: run inside `frontend/`
  - `npm run dev`
  - `npm run build`
  - `npm run lint`
- Backend: run inside `backend/`
  - `python test.py`

## Environment

- `frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

## Useful references

- `CLAUDE.md`
- `frontend/AGENTS.md`
- `frontend/README.md`
