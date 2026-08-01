# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev     # dev server on http://localhost:3000
npm run build   # production build
npm start       # serve the production build
npm run lint    # eslint (flat config, eslint-config-next core-web-vitals + typescript)
```

No test runner is configured.

## Architecture

Unmodified `create-next-app` scaffold (Next.js 16.2.12, React 19.2.4, TypeScript strict, Tailwind CSS v4). Everything lives in `app/` — App Router, with `layout.tsx` loading Geist/Geist Mono via `next/font/google` and exposing them as the `--font-geist-sans` / `--font-geist-mono` CSS variables used by `globals.css`.

Tailwind v4 is wired through PostCSS only (`@tailwindcss/postcss`); there is no `tailwind.config` — theme tokens are declared inline in `app/globals.css` via `@theme`.

Imports use the `@/*` alias mapped to the repo root.

## Next.js version

Per `AGENTS.md`: this Next.js version has breaking changes relative to model training data. Consult `node_modules/next/dist/docs/` (notably `01-app/`) before writing routing, caching, or data-fetching code rather than relying on remembered APIs.
