<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# github-repo-search

Rules for any agent or developer working in this repo. Read this before writing code. These rules are in English for the agent's benefit; submission-facing docs (`README.md`, `docs/AI-USAGE.ja.md`) stay in their intended language.

## What this project is

A GitHub repository search app, built as an engineering selection task (課題). A user types a keyword, the app searches the GitHub API, lists matching repositories, and shows a selected repository's details on its own route.

**Reviewers judge this as production code.** Design is explicitly *not* graded — usability, clarity, correctness, and test coverage are.

## Assignment constraints (non-negotiable)

| Constraint | Detail |
| --- | --- |
| Framework | Next.js **v16+**. Do not downgrade. |
| Router | **App Router** only. Never add `pages/`. |
| Detail view | Must be a **page with its own route**. A modal is an explicit fail. |
| Required fields | name, owner avatar, language, stars, watchers, forks, open issues |
| Tests | Test code ships alongside features, not after. |
| Quality | Written as if going to production. |
| AI disclosure | Every process logged — see [AI usage log](#ai-usage-log-required). |

If a change would break any row above, stop and raise it rather than working around it.

## Build & test

```bash
nvm use            # Node 20.20.1 — the default Node 18 cannot run Next.js 16
npm run dev        # dev server
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest, single run
npm run test:watch # Vitest, watch mode
npm run test:coverage # Vitest with coverage — this is what CI gates on
npm run test:e2e   # Playwright end-to-end
npm run test:a11y  # axe accessibility checks
```

**Run `npm test`, `npm run lint`, and `npm run typecheck` after every significant change.** Never claim work is done without running them.

**Before finishing a phase, also run `npm run test:coverage`, `npm run test:e2e`, and `npm run test:a11y`** — `npm test` alone does not exercise the coverage threshold that fails CI's `quality` job.

## Tech stack

- Next.js 16.2.12 (App Router), React 19, TypeScript strict
- Tailwind CSS v4
- Vitest 4 + React Testing Library (jsdom)
- Node 20.20.1 (`.nvmrc`)

### Dependency notes worth remembering

- `next@16.2.12` pins `postcss@8.4.31` and `sharp@0.34.5`, both of which carry advisories. `package.json` `overrides` raise them to patched versions, matching what upstream does in the unreleased 16.3 previews. **Keep `npm audit` at 0 vulnerabilities.**
- npm `overrides` do **not** apply to an already-installed tree. If `npm ls` shows `invalid: ... overridden`, delete `node_modules` and `package-lock.json` and reinstall.
- Adding dependencies is a decision, not a detail. Prefer the platform (`fetch`, Server Components, `URLSearchParams`) over a library. shadcn/ui is permitted by the brief but optional.

## Coding standards

### TypeScript
- `strict` is on and stays on. No `any`, no `@ts-ignore`, no non-null `!` to silence the compiler — model the type properly.
- Type API responses explicitly in `src/types/`. Do not let `unknown` GitHub JSON leak into components.
- Prefer `type` aliases for props and API shapes; reserve `interface` for extension.

### React / Next.js
- **Server Components by default.** Add `"use client"` only where interactivity genuinely requires it, and push it as far down the tree as possible.
- Fetch data on the server. The client should not talk to the GitHub API directly if a server route can do it.
- Use `next/image` for avatars (remote hosts must be allowlisted in `next.config.ts`).
- Use `next/link` for navigation — never `window.location`.
- URL is state: the search keyword and page belong in the query string, so results are shareable, refreshable, and backable.

### Naming & layout
```
src/app/            routes, layouts, loading/error boundaries
src/components/     reusable UI
src/lib/            data fetching, GitHub client, pure helpers
src/types/          shared type definitions
src/**/*.test.tsx   unit and component tests, colocated next to what they test
e2e/                Playwright specs — *.spec.ts for E2E, *.a11y.spec.ts for axe
```
- Components: `PascalCase.tsx`. Helpers and hooks: `camelCase.ts`. Route folders: lowercase.
- One exported component per file. Co-locate a component's test beside it.

### Error and edge handling (this is what "production" means here)
Every data-driven view handles all of: **loading**, **empty results**, **network failure**, **GitHub rate limit (403/429)**, and **not found (404)**. Use App Router `loading.tsx` and `error.tsx` rather than hand-rolled flags where it fits.

Never render a raw error object or stack trace to the user.

## GitHub API rules

- Search endpoint: `GET /search/repositories?q=…`. Detail: `GET /repos/{owner}/{repo}`.
- **Rate limits are low and will be hit during review.** Unauthenticated search is ~10 requests/minute; core REST is 60/hour. Debounce input, avoid firing a request per keystroke, and surface a clear message when limited rather than an empty list.
- An optional `GITHUB_TOKEN` raises the limits. If used, it is **server-side only** — never `NEXT_PUBLIC_`, never in a client component, never committed. Document it in `README.md` and `.env.example`.
- Send `Accept: application/vnd.github+json`.
- An empty or malformed `q` returns **422**, not an empty result set. Guard before calling.
- Search caps out at 1000 results; `per_page` max is 100. Paginate deliberately.
- **Known API quirk:** in the REST API, `watchers_count` is a duplicate of `stargazers_count`. The real watcher count is `subscribers_count`, which is only present on the detail endpoint. The brief asks for both stars *and* watchers — use `subscribers_count` for watchers and note the decision in the README.

## Testing standards

- Test behaviour a user can observe, not implementation details. Query by role and accessible name; avoid snapshot-only tests.
- Mock the network at the boundary — never let tests hit the real GitHub API.
- Every feature ships with tests for the happy path **and** its failure paths. The five modes that must be covered across the app: rate limit (403/429), not found (404), validation (422), network error, and empty results. One failure path per feature is the floor, not the target — see [`docs/TESTING.md`](docs/TESTING.md).
- Tests live beside their subject as `*.test.ts(x)` under `src/`.

## Git & commits

- Small, atomic commits with an imperative subject describing the change.
- Never commit secrets, `.env*` files, or `node_modules`.
- The working tree must be green (`test`, `lint`, `typecheck`) before committing.
- No GitHub remote is configured yet — this is intentional, local-only for now.

## AI usage log (required)

**Every time a process completes, append a record of how AI was used — before committing that process.**

**Who this is for:** an interviewing engineer reviewing this submission. They are assessing judgement, not typing speed. A log that only says *what happened* proves nothing; a log that says *why* is the actual evidence. Write for someone who will ask "why did you do it that way?" and never gets to hear a verbal answer.

Two files, **always updated together**:
- `docs/AI-USAGE.ja.md` — Japanese, submission-facing
- `docs/AI-USAGE.en.md` — English, identical content

### Required fields

| Field | What it must contain |
| --- | --- |
| Process number & date | Sequential; the date the work happened |
| AI tool | Model/tool used, including any sub-agents |
| **What** AI did | Concrete actions — files written, commands run, decisions drafted |
| **Why** | The reasoning behind the approach. What alternatives were considered and **rejected, with the reason**. This field is not optional. |
| What the human decided | Which calls were the human's, not the AI's — especially where the human overrode the AI |
| How it was reviewed | The specific commands run and their result. Not "checked it" |
| Taken as-is or modified | Honestly. If AI output was corrected, say what was wrong |

### Entry template

```markdown
## Process N: [Title]

- **Date:** YYYY-MM-DD
- **Tool:** [model / sub-agents]
- **Delegated to AI:** [concrete actions]
- **Why this approach:** [reasoning; alternatives considered and why they were rejected]
- **Human decisions:** [what the human chose, and where they overrode the AI]
- **Review:** [commands run + results]
- **Taken as-is vs modified:** [honest account]
```

### When the "why" is uncertain, ask

**Never invent a rationale.** If you do not actually know why a choice was made — a tool, a library, a process, an architectural call — stop and ask the user before writing the entry.

A fabricated-but-plausible reason is worse than no entry: it reads convincingly, it is unfalsifiable by the reviewer, and it will not match what the human says if they are asked about it in an interview. The log's value is that it is true.

Ask when:
- A decision predates you or was made in another session
- The user chose a tool or approach without stating why
- You can imagine two or more reasons and cannot tell which is real
- You are about to write "presumably", "likely because", or "in order to" about someone else's decision

Ask plainly — "why did you pick X over Y?" — and record the answer in the user's own terms.

### Before committing a process, check

1. Is every stated reason one the user actually gave, rather than one you inferred? If unsure — ask, don't guess.
2. Could a reviewer answer "why did they build it this way?" from this entry alone?
3. Is every rejected alternative recorded **with its reason**, not just the chosen path?
4. Are the human's decisions distinguishable from the AI's?
5. Does the review line name actual commands and outcomes?
6. Do both language files say the same thing?

If any answer is no, the entry is not finished.

> The assignment requires AI usage to be summarised in the README. `README.md` satisfies this by linking to the two files above.

## Agents used on this project

This repo does **not** use the broader GSD / marketing / mobile agent suites available in the global config. Those are for other projects and add noise here. For this repo, the useful set is narrow:

| Agent / skill | Use it for |
| --- | --- |
| `Explore` | Locating code across the repo before editing. Read-only. |
| `Plan` | Designing an approach for a multi-file feature before writing it. |
| `general-purpose` | Open-ended search or multi-step work that doesn't fit the two above. |
| `test-driven-development` skill | Writing a feature — tests first. |
| `systematic-debugging` skill | Any bug or unexpected test failure, before proposing a fix. |
| `verification-before-completion` skill | Before claiming anything is done, fixed, or passing. |
| `webapp-testing` skill | Driving the running app in a browser to verify real behaviour. |

Rules for agent use here:
- **Do not spawn agents for small, single-file edits.** The overhead exceeds the benefit.
- Any agent that writes code inherits every rule in this file. Pass it this file's constraints explicitly.
- A subagent's report is a claim, not a verified result. Re-run `npm test` / `npm run lint` / `npm run typecheck` yourself before trusting "done".
- If an agent's output would violate an assignment constraint, discard it — the constraint wins.

## Do not

- Add the Pages Router, or downgrade Next.js below 16.
- Implement the repository detail view as a modal.
- Expose a GitHub token to the client, or commit one.
- Weaken TypeScript strictness or disable lint rules to make an error go away.
- Mark work complete without running the verification commands.
- Skip the AI usage log for a process, or write one that records *what* happened without *why*.
