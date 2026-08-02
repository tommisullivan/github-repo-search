---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed .planning/phases/01-github-api-client/01-03-PLAN.md
last_updated: "2026-08-02T03:01:07.210Z"
last_activity: 2026-08-02
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 5
  completed_plans: 3
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-01)

**Core value:** A reviewer can search for a repository, open its detail page, and find the code behind it clear, correct, and production-minded — including when the GitHub API fails or rate-limits.
**Current focus:** Phase 1 — GitHub API Client

## Current Position

Phase: 1 of 4 (GitHub API Client) — Phase 0 complete
Plan: 3 of 5 in current phase
Status: Ready to execute 01-04 (search and repo units)
Last activity: 2026-08-02 — Plan 01-03 complete: `githubFetch()` shipped with the measured cache opt-in, a 5s deadline, no retry on any response, one structured log line per attempt, and the origin guard. Confirmed end to end against a local counting server — 6 renders of a dynamic route, **1** upstream request

Progress: [██████░░░░] 60% (3 of 5 plans in Phase 1 complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: ~18 min
- Total execution time: 55 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 0. Foundation & CI | — | — | — |
| 1. GitHub API Client | 3 | 55 min | ~18 min |

**Per plan:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 1 P01 | 12 min | 3 tasks | 5 files |
| Phase 1 P02 | 18 min | 2 tasks | 1 file |
| Phase 1 P03 | 25 min | 2 tasks | 3 files |

**Recent Trend:**

- Last 5 plans: 01-01 (12 min), 01-02 (18 min), 01-03 (25 min)
- Trend: rising — 01-03 carried a live end-to-end confirmation (build, server, six driven requests, restore) on top of the code

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 0]: `AGENTS.md` holds project rules, `CLAUDE.md` imports it — portable across coding agents
- [Phase 0]: Vitest over Jest — already in place, ~0.9s suite, native ESM/TS, no migration
- [Phase 0]: Full CI gate, no DAST — nothing deployed and no auth/session/datastore to scan
- [Phase 0]: Observability is free and self-hostable only — structured stdout logging by default so the app still runs with zero services
- [Phase 1 upcoming]: Optional server-side `GITHUB_TOKEN` — works with zero config, better with a token
- [Phase 1 upcoming]: Never retry a rate-limited request — retrying spends the exhausted quota and slows recovery
- [Phase 1 upcoming]: Every GitHub request carries a timeout — a bare `fetch()` has none and would hang a render
- [Phase 1]: Expected failures are returned as `Result` values, unexpected faults are thrown as `GitHubRequestError` — `error.tsx` cannot branch reliably in production
- [Phase 1]: `GitHubCallLog` is a closed type, so writing a token or a header bag to the log is a compile error rather than a review catch
- [Phase 1]: `githubFetch` ships `cache: "force-cache"` + `next.revalidate` + `AbortSignal.timeout()` together — measured caching in Next 16.2.12, so API-05 and OBS-02 cost each other nothing
- [Phase 1]: `force-cache` kept although measurement proved `revalidate` alone also caches — it is the documented opt-in and states intent at the call site
- [Phase 1]: D-11a's premise measured false (`revalidate` alone does cache) while its conclusion stands — recorded in `docs/OPERATIONS.md`, not smoothed over
- [Phase 1]: `cacheHit` stays `null` — a cache hit is indistinguishable from a miss to app code, and inferring it from `durationMs` is rejected as confidently wrong
- [Phase 2 upcoming]: Japanese UI strings, English code — reviewers are Japanese engineers; code stays readable to any engineer
- [Phase 3 upcoming]: `subscribers_count` for watchers — REST `watchers_count` duplicates stars
- [Phase 1]: The shipped `githubFetch` caches — counted, not inferred: 6 renders of a dynamic route produced 1 upstream request against a local counting server
- [Phase 1]: The origin guard rejects a leading backslash as well as a slash — `new URL("/\\host/x", base)` resolves to `https://host/x`, the same hijack one character away from the specified regex
- [Phase 1]: `GITHUB_API_BASE_URL` stays a hard-coded constant (T-01-26) — an env-settable base URL redirects the `Authorization` header, so the cache confirmation used a reverted source edit verified by `diff`
- [Phase 1]: `durationMs` is reported as measured, never floored positive — a cache hit legitimately takes 0ms, which is also why `cacheHit` is not inferred from it
- [Phase 1]: A requirement is marked Complete only when no remaining plan in the phase still claims it — API-03, OBS-02, OBS-03 close in 01-03; API-02, API-05, OBS-01, TEST-01 stay open for 01-04/01-05

### Pending Todos

- **For 01-05:** `docs/ARCHITECTURE.md` still labels the client `githubFetch(path, init)` in two diagrams. The shipped signature is `githubFetch<T>({ path, endpoint, revalidate })`.
- **For 01-05:** two `<verification>` greps inherited from 01-03 (`api.github.com` and `GITHUB_TOKEN` "in `client.ts` only") also match test files that assert the very thing being checked. Scope them to non-test files, or use `grep -rn "process.env" src/`, which matches `client.ts` alone.

### Blockers/Concerns

- Node 24.18.1 is required (`nvm use`). The machine default is Node 18, which is end-of-life and cannot run Next 16.
- GitHub unauthenticated search is ~10 req/min. Manual verification will hit the limit; use a server-side token locally or mock.
- No GitHub remote is configured — local-only by user instruction. CI requirements (Phase 0) are defined in-repo but cannot run until a remote exists.
- ~~Next's fetch cache means a cache hit performs no network call, so rate-limit headers read from a cached response are likely stale rather than current.~~ **Resolved 2026-08-02 by plan 01-02's measurement: confirmed stale.** Every cached cell replayed `x-ratelimit-remaining=59` from its first call while the upstream counter never advanced. A logged headroom figure is historical, not live — log it, do not alert on it. See `docs/OPERATIONS.md`.
- No LICENSE file. Considered and not selected; revisit before submission.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Persistence | FAV-01, FAV-02 (favourites, search history) | v2 | Initialization |
| Operations | OPS-01, OPS-02, OPS-03 (Sentry, DAST, SBOM) | v2 | Initialization |

## Session Continuity

Last session: 2026-08-02T03:00:51.192Z
Stopped at: Completed .planning/phases/01-github-api-client/01-02-PLAN.md — Task 3 is a blocking human checkpoint
Resume file: None

Next: human sign-off on the measured fetch configuration in `docs/OPERATIONS.md`, then execute 01-03-PLAN.md (githubFetch). Plan 01-03 must not start until the checkpoint is resolved.
