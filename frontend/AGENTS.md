<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Key frontend rules:

- Use the existing local conventions in `frontend/src/`; most code uses relative imports rather than `@/*` even though the alias exists.
- Tailwind v4 dark mode is class-based and is toggled by `ThemeProvider` in `src/lib/theme.tsx`.
- `layout.tsx` injects an inline script to set `.dark` on `<html>` before paint.
- Some pages use inline style objects for color theming instead of Tailwind utility classes.
- Supabase auth is implemented client-side only; there is no route protection or middleware currently.
- Build commands: `npm run dev`, `npm run build`, `npm run lint`.
<!-- END:nextjs-agent-rules -->
