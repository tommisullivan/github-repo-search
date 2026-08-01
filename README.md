# github-repo-search

A GitHub repository search app built for an engineering selection task. Users enter a keyword, search the GitHub API, and open a selected repository's details on its own page.

> **Status:** scaffold only. The search and detail features are not implemented yet.

## Requirements (from the assignment)

**Technical**
- Next.js v16 or later
- App Router
- Component libraries (shadcn/ui etc.) are optional

**Functional**
1. Accept a keyword input from the user
2. Query the GitHub `search/repositories` API and list the results
3. On selecting a repository, show its details: name, owner avatar, language, stars, watchers, forks, open issues
4. The detail view must be a **page (its own route), not a modal**
5. Include test code

**Quality**
- Write it as if it were going to production
- Design is not evaluated — usability and clarity are what matter
- If AI tools are used, document how in this README

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.2.12 (App Router) |
| UI | React 19, Tailwind CSS v4 |
| Language | TypeScript (strict) |
| Tests | Vitest + React Testing Library (jsdom) |
| Runtime | Node 20.20.1 (`.nvmrc`) |

## Getting Started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Tests with a coverage report |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test:a11y` | Accessibility checks (axe) |

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System shape, directory layout, key decisions, rejected alternatives |
| [`AGENTS.md`](./AGENTS.md) | Coding standards and project rules |
| [`.planning/`](./.planning/) | Requirements, roadmap, and project state |

## Project Structure

```
src/app/              App Router routes and layouts
src/app/page.tsx      Home page (placeholder)
src/app/*.test.tsx    Colocated unit and component tests
e2e/                  Playwright specs — E2E and axe accessibility
vitest.config.mts     Unit/component test config
vitest.setup.ts       jest-dom matchers + auto cleanup
playwright.config.ts  E2E and a11y run config
.github/workflows/    CI quality gate
```

## AI Usage / AI 利用について

AI usage is logged per process, in both languages:

- [`docs/AI-USAGE.ja.md`](./docs/AI-USAGE.ja.md) — 日本語
- [`docs/AI-USAGE.en.md`](./docs/AI-USAGE.en.md) — English

**Rule:** every completed process appends an entry to *both* files before it is committed — process number, date, tool, what AI did, what the human decided, and how it was reviewed.

So far: Process 1 (spec comprehension + base scaffold) and Process 2 (project rules + AI documentation workflow) are done. Architecture has deliberately not been designed yet.

Project conventions and constraints live in [`AGENTS.md`](./AGENTS.md), which AI coding tools load automatically at the start of every session.

## Notes

- `next@16.2.12` is the latest stable release. Its pinned `postcss@8.4.31` and `sharp@0.34.5` carry known advisories, which upstream fixes in unreleased 16.3 previews by bumping those pins. The same bump is applied here via `overrides` in `package.json` — `npm audit` reports 0 vulnerabilities, and typecheck, lint, tests, and build all pass.
