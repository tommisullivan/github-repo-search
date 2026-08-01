# github-repo-search

## What This Is

A web app for searching GitHub repositories by keyword and viewing a selected repository's details on its own page. Built as an engineering selection task (エンジニア選考課題) — the audience is the reviewing engineers, and the deliverable is a GitHub repository plus a README explaining the decisions behind it.

## Core Value

A reviewer can search for a repository, open its detail page, and find the code behind it clear, correct, and production-minded — including when the GitHub API fails or rate-limits.

## Requirements

### Validated

- ✓ Next.js 16.2.12 App Router scaffold, TypeScript strict, Tailwind v4 — Process 1
- ✓ Vitest + React Testing Library harness, passing — Process 1
- ✓ Node pinned to 20.20.1 via `.nvmrc` (Next 16 rejects Node 18) — Process 1
- ✓ Zero-vulnerability dependency tree via `overrides` — Process 1
- ✓ Project rules and coding standards in `AGENTS.md` — Process 2
- ✓ Bilingual per-process AI usage log — Process 2

### Active

- [ ] Keyword search against the GitHub `search/repositories` API with results list
- [ ] Repository detail as a dedicated route showing name, owner avatar, language, stars, watchers, forks, open issues
- [ ] Complete state handling: loading, empty, network error, rate limit, not found
- [ ] Typed GitHub client with server-side-only optional token
- [ ] Unit, component, and E2E tests including failure paths
- [ ] CI quality gate on every PR
- [ ] README documenting decisions, setup, and AI usage

### Out of Scope

- **User authentication / GitHub OAuth** — the brief never mentions auth, and searching public repos needs no identity. Inventing scope is a negative signal in a selection task.
- **Database (Mongo, Postgres, or otherwise)** — nothing to persist. GitHub owns the data; every view is a read-through. A DB would make local setup worse (`npm run dev` currently needs zero services) and reads as over-engineering.
- **Favourites / search history** — the only features that would justify persistence. Not in the brief.
- **DAST (OWASP ZAP)** — needs a deployed target; with no auth, no session, and no datastore, a baseline scan finds header config and nothing else. Documented in README as a "for real production" item instead.
- **Elaborate visual design** — the brief states design is not evaluated. Effort goes to usability and clarity.
- **Deployment / hosting** — not mentioned in the brief. CI is a quality signal, not a delivery pipeline.

## Context

- The brief is a Japanese engineering selection task. Reviewers are engineers reading the code, so the README and inline decisions matter as much as the features.
- The scaffold already exists and is green (`test`, `lint`, `typecheck`, `build` all pass). This is not a greenfield start.
- GitHub's search API allows roughly 10 requests/minute unauthenticated. A reviewer clicking around will hit this, so rate-limit handling is a visible correctness issue, not an edge case.
- REST `watchers_count` duplicates `stargazers_count`; the true watcher count is `subscribers_count` on the detail endpoint. The brief asks for both stars and watchers, so this must be handled deliberately and explained.
- No GitHub remote is configured yet — local-only by the user's instruction.

## Constraints

- **Tech stack**: Next.js v16+ with the App Router — mandated by the brief, non-negotiable.
- **UX**: Repository detail must be a page with its own route, never a modal — explicit brief requirement.
- **Tech stack**: Node 20.9+ required by Next 16; pinned to 20.20.1. The machine default is Node 18 and will fail.
- **Quality**: Test code ships with features, not after — explicit brief requirement.
- **Process**: Every completed process appends to both AI usage logs before commit.
- **Security**: Any GitHub token is server-side only, never `NEXT_PUBLIC_`, never committed.
- **Dependencies**: `npm audit` stays at zero vulnerabilities.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| No database | Nothing to persist; GitHub owns the data. Adding one worsens local setup and signals over-engineering. | — Pending |
| No user auth | Not in the brief; public search needs no identity. | — Pending |
| Optional server-side `GITHUB_TOKEN` | Unauthenticated search is ~10 req/min and reviewers will hit it. Works with zero config, better with a token. | — Pending |
| Server Components fetch data | Keeps the token off the client and removes a client-side API layer. | — Pending |
| URL as state (`?q=`, `?page=`) | Shareable, refreshable, back-button correct — direct usability evidence. | — Pending |
| Next fetch cache over a cache service | Solves rate-limit pressure with one line and no infrastructure. | — Pending |
| `subscribers_count` for watchers | REST `watchers_count` duplicates stars; showing identical numbers looks like a bug. | — Pending |
| Vitest over Jest | Already in place, ~0.9s suite, native ESM/TS. No migration needed. | ✓ Good |
| Full CI gate, no DAST | Lint/typecheck/unit/E2E/build/SAST/audit/secrets/a11y are proportionate; DAST has no surface to scan here. | — Pending |
| `AGENTS.md` holds project rules, `CLAUDE.md` imports it | Portable across coding agents; Claude reads it via the one-line import. | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-01 after initialization*
