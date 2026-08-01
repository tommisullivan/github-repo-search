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

## Project Structure

```
src/app/            App Router routes and layouts
src/app/page.tsx    Home page (placeholder)
src/app/*.test.tsx  Colocated component tests
vitest.config.mts   Test runner config
vitest.setup.ts     jest-dom matchers + auto cleanup
```

## AI Usage

This scaffold was generated with Claude Code (Claude Opus): it read the assignment brief, ran `create-next-app`, and wired up the Vitest + React Testing Library harness. Keep this section current as the app is built out — record which parts were AI-assisted and how the output was reviewed.

## Notes

- `npm audit` reports 3 high-severity advisories in `postcss` and `sharp`, both transitive dependencies of `next@16.2.12`. There is no non-breaking fix; `npm audit fix --force` would downgrade Next.js to v9, which violates the assignment. Left as-is intentionally.
