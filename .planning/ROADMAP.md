# Roadmap: github-repo-search

## Overview

The scaffold is already green and the quality gate is already wired, so this roadmap starts from working infrastructure rather than an empty directory. The journey runs inward-out: first a single typed GitHub client that every read flows through and that fails in predictable, named ways (Phase 1); then the search experience built on top of it, with the keyword in the URL and every state — loading, empty, network failure, rate limit — visibly handled (Phase 2); then the repository detail page on its own route, showing all seven fields the brief demands and correcting the `watchers_count` quirk (Phase 3); finally the pass that makes the repository reviewable as production work — accessibility, responsive layout, E2E coverage, and the README and AI usage logs that explain the decisions (Phase 4).

The ordering is deliberate: error handling is the hardest requirement in this brief and the most visible to a reviewer, so it lives in the client at Phase 1 and every later phase renders it rather than reinventing it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 0: Foundation & CI** - Architecture, operations, security and testing documentation, plus the full CI quality gate (delivered during initialization)
- [ ] **Phase 1: GitHub API Client** - One typed, server-side client with named errors, structured logging, and a timeout/retry policy
- [ ] **Phase 2: Search Experience** - Japanese-language keyword search with URL-as-state and every result state handled
- [ ] **Phase 3: Repository Detail Page** - A dedicated route showing all required repository fields, with an allowlisted avatar host
- [ ] **Phase 4: Quality Gate & Submission Readiness** - Accessibility, responsiveness, E2E coverage, and the reviewer-facing docs

## Phase Details

### Phase 0: Foundation & CI
**Goal**: The repository documents its own architecture and every change is gated by an automated quality pipeline
**Depends on**: Nothing (delivered during initialization)
**Requirements**: DOC-03, DOC-04, DOC-05, DOC-06, CI-01, CI-02, CI-03, CI-04, CI-05
**Success Criteria** (what must be TRUE):
  1. `docs/ARCHITECTURE.md` explains the project structure, the data flow from request to render, and the alternatives that were rejected and why
  2. `docs/OPERATIONS.md` fixes the observability and resilience policy before the code exists — what is logged, rate-limit headroom as the key signal, timeout and retry rules, and free/self-hostable tooling only
  3. `docs/SECURITY.md` records the threat model, token handling, response-header plan, and privacy position
  4. `docs/TESTING.md` records the test layers, mocking boundary, and the failure modes every feature must cover
  5. Every PR runs lint, typecheck, unit tests, and build, and a failure blocks the PR
  6. E2E runs in CI against a mocked GitHub API, so runner rate limits cannot cause flakes
  7. Security scanning is active — CodeQL SAST, `npm audit` at zero vulnerabilities, and secret scanning — with Dependabot keeping dependencies current
  8. An automated accessibility check (axe) runs in CI
**Plans**: Complete (delivered during initialization)
**Status**: Complete — with one caveat recorded honestly: every script the workflow invokes (`lint`, `typecheck`, `test:coverage`, `test:e2e`, `test:a11y`, `audit`, `build`) has been run locally and passes, but the workflow YAML itself has never executed because no GitHub remote is configured. Criteria 5-8 are "defined and locally verified", not "observed green in CI". First push will confirm.

### Phase 1: GitHub API Client
**Goal**: Every GitHub read flows through one typed, server-side client that fails in predictable, named ways
**Depends on**: Phase 0
**Requirements**: API-01, API-02, API-03, API-04, API-05, TEST-01, OBS-01, OBS-02, OBS-03, SEC-03
**Success Criteria** (what must be TRUE):
  1. Search (`search/repositories`) and detail (`repos/{owner}/{repo}`) data are fetched through a single typed client with explicit response types — no `unknown` GitHub JSON reaches a caller
  2. Rate limit, not found, validation, and network failures each surface as a distinct typed error a caller can branch on, never a raw throw
  3. An empty or whitespace-only query is rejected before any request is made, so GitHub's 422 never occurs
  4. A `GITHUB_TOKEN` present in the server environment raises the rate limit, nothing about it reaches the client bundle, and `.env.example` documents it
  5. Repeated identical reads are served from Next's fetch cache, reducing rate-limit pressure
  6. `npm test` exercises every error-mapping branch of the client with the network mocked at the boundary
  7. Every GitHub call emits one structured JSON log line carrying status, duration, and the `x-ratelimit-remaining` / `x-ratelimit-reset` headers, so quota headroom is visible before it runs out — and the token, the `Authorization` header, and response bodies never appear in it
  8. Every GitHub request carries a timeout so a stalled upstream cannot hang a render indefinitely; a rate-limited or 4xx response is never retried, and only a transient network fault retries, at most once
  9. URLs are built with `URLSearchParams` and `encodeURIComponent`, so no user-supplied value can alter which endpoint is addressed
**Plans**: TBD

### Phase 2: Search Experience
**Goal**: A user can search GitHub by keyword and get a trustworthy result list in every state, including failure
**Depends on**: Phase 1
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, UX-01, UX-02, UX-03, UX-04, I18N-01
**Success Criteria** (what must be TRUE):
  1. User enters a keyword and sees matching repositories, each showing name, owner, primary language, and star count
  2. The keyword and page live in the URL query string, so a result page can be shared, refreshed, and reached with the browser back button
  3. User can page through results up to GitHub's 1000-result cap
  4. Typing in the search input does not fire one request per keystroke
  5. Loading, empty results, network failure, and rate limiting each render a distinct, human-readable state — a rate limit is never shown as "no results", and no raw error or stack trace ever reaches the user
  6. Every user-facing string is Japanese — labels, placeholders, buttons, empty and error states, page titles, and `aria-label` values — while all code, comments, and commits remain English
  7. Component tests cover the search form and result list on the happy path, and on the empty-result and rate-limited states — the two a user is most likely to hit
**Plans**: TBD
**UI hint**: yes

### Phase 3: Repository Detail Page
**Goal**: Selecting a repository opens its own route showing every field the brief requires, correctly
**Depends on**: Phase 2
**Requirements**: DTL-01, DTL-02, DTL-03, DTL-04, DTL-05, UX-05, TEST-02, SEC-02
**Success Criteria** (what must be TRUE):
  1. Selecting a result navigates to a dedicated repository route — a page with its own URL, never a modal
  2. The detail page shows name, owner avatar, language, stars, watchers, forks, and open issues
  3. The watcher count comes from `subscribers_count`, and the REST `watchers_count` duplication of stars is documented where a reviewer will read it
  4. A detail URL opened directly or refreshed renders correctly, and an unknown owner/repo renders a not-found page rather than an error
  5. User can return to the results list with their keyword and page intact
  6. Component tests cover search and detail on the happy path and on at least one failure path each
  7. Owner avatars load through an `images.remotePatterns` allowlist scoped to GitHub's avatar host specifically — never a wildcard, so the app cannot be made to proxy arbitrary remote images
**Plans**: TBD
**UI hint**: yes

### Phase 4: Quality Gate & Submission Readiness
**Goal**: The repository reads as production work to a reviewing engineer — accessible, responsive, covered, and explained
**Depends on**: Phase 3
**Requirements**: UX-06, UX-07, TEST-03, TEST-04, DOC-01, DOC-02, SEC-01
**Success Criteria** (what must be TRUE):
  1. Search and detail are fully keyboard operable, every control has a labelled accessible name, heading structure is correct, and the axe check passes
  2. Both views are usable at mobile and desktop widths without horizontal scrolling or clipped content
  3. An E2E test drives search → detail navigation against a mocked GitHub API and passes in CI
  4. CI enforces a coverage threshold and fails the build below it
  5. `README.md` explains setup, the optional server-side token, and the reasoning behind the key decisions (no database, no auth, `subscribers_count`, no DAST)
  6. `docs/AI-USAGE.ja.md` and `docs/AI-USAGE.en.md` carry identical per-process entries, and the README links to them
  7. Security response headers are configured — including a Content-Security-Policy that does not fall back to `unsafe-inline` — so the deployed app is not relying on framework defaults alone
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Foundation & CI | - | Complete | 2026-08-01 |
| 1. GitHub API Client | 0/TBD | Not started | - |
| 2. Search Experience | 0/TBD | Not started | - |
| 3. Repository Detail Page | 0/TBD | Not started | - |
| 4. Quality Gate & Submission Readiness | 0/TBD | Not started | - |

## Coverage

| Phase | Requirements | Count |
|-------|--------------|-------|
| 0 | DOC-03, DOC-04, DOC-05, DOC-06, CI-01, CI-02, CI-03, CI-04, CI-05 | 9 |
| 1 | API-01, API-02, API-03, API-04, API-05, TEST-01, OBS-01, OBS-02, OBS-03, SEC-03 | 10 |
| 2 | SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, UX-01, UX-02, UX-03, UX-04, I18N-01 | 10 |
| 3 | DTL-01, DTL-02, DTL-03, DTL-04, DTL-05, UX-05, TEST-02, SEC-02 | 8 |
| 4 | UX-06, UX-07, TEST-03, TEST-04, DOC-01, DOC-02, SEC-01 | 7 |

**Total:** 44 of 44 v1 requirements mapped. No orphans, no duplicates.

## Definition of Done — every phase, without exception

A phase is not complete until **all** of these hold. This is the testing gate: it applies uniformly, so no phase can quietly ship without tests because its own success criteria happened not to mention them.

1. **Every requirement mapped to the phase is implemented**, and each one is demonstrable — not "the code is there", but observable behaviour.
2. **Tests ship with the code**, in the same PR. Never a follow-up.
   - New logic has unit tests, including each error branch.
   - New UI has component tests for the happy path **and** for the failure states a user can actually reach.
   - No test touches the live GitHub API.
3. **The full local gate passes and the output was read**:
   ```bash
   npm run lint && npm run typecheck && npm run test:coverage && npm run build
   npm run test:e2e && npm run test:a11y && npm audit --audit-level=high
   ```
4. **Coverage does not regress.** If the threshold is raised, it is raised deliberately, not tripped over.
5. **`CI Gate` is green on the PR.**
6. **Both AI usage logs are updated**, including the *why*.
7. **A human has reviewed and merged.** An agent never merges its own work — see `AGENTS.md`.

Phase-specific success criteria are *in addition to* this list, never instead of it.

## Constraints Carried Through Every Phase

These come from `AGENTS.md` and the assignment brief. They are not phase work — they are conditions on all phase work.

- Next.js v16+, App Router only. Never add `pages/`. Never downgrade.
- Repository detail is a page with its own route. A modal is an explicit fail.
- Test code ships alongside the feature, not after.
- TypeScript `strict` stays on. No `any`, no `@ts-ignore`, no non-null `!` to silence the compiler.
- Server Components by default; `"use client"` only where interactivity requires it, pushed as far down the tree as possible.
- Any GitHub token is server-side only — never `NEXT_PUBLIC_`, never committed.
- `npm audit` stays at zero vulnerabilities.
- Every completed process appends to both AI usage logs before commit.
- `npm test`, `npm run lint`, and `npm run typecheck` pass before any work is called done.
- User-facing strings are Japanese; code, comments, and commits are English.
- Never retry a rate-limited GitHub request — it spends the quota that is already exhausted.
- Observability tooling stays free and self-hostable, and the app keeps running with zero services.

---
*Roadmap created: 2026-08-01*
