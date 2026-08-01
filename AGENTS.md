<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# github-repo-search

## Build & Test
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Test: `npm test` (watch: `npm run test:watch`)

## Tech Stack
- Next.js 16 (App Router), React 19, TypeScript strict
- Tailwind CSS v4
- Vitest + React Testing Library (jsdom)
- Node 20.20.1 (see `.nvmrc`)

## Assignment Constraints (non-negotiable)
- Next.js v16+ and the App Router. Do not add the Pages Router.
- Repository detail must be a **page** (its own route), never a modal.
- Ship test code alongside features.
- Production-minded: handle loading, empty, error, and rate-limit states.
- Any AI usage must be documented in `README.md`.

## Agent Directives
- Run `npm test`, `npm run lint`, and `npm run typecheck` after every significant change.
- Design is not graded; prioritise usability and clarity over visual polish.
