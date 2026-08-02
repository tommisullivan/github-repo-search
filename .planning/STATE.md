# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-01)

**Core value:** A reviewer can search for a repository, open its detail page, and find the code behind it clear, correct, and production-minded — including when the GitHub API fails or rate-limits.
**Current focus:** Phase 1 — GitHub API Client

## Current Position

Phase: 1 of 4 (GitHub API Client) — Phase 0 complete
Plan: 1 of 5 in current phase
Status: Executing
Last activity: 2026-08-02 — Plan 01-01 complete: GitHub payload/domain types, the failure vocabulary with Result<T> and status mapping, and the structured call log. 21 tests, 100% coverage of the new modules, zero new dependencies

Progress: [██░░░░░░░░] 20% (1 of 5 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 12 min
- Total execution time: 12 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 0. Foundation & CI | — | — | — |
| 1. GitHub API Client | 1 | 12 min | 12 min |

**Recent Trend:**
- Last 5 plans: 01-01 (12 min)
- Trend: —

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
- [Phase 2 upcoming]: Japanese UI strings, English code — reviewers are Japanese engineers; code stays readable to any engineer
- [Phase 3 upcoming]: `subscribers_count` for watchers — REST `watchers_count` duplicates stars

### Pending Todos

None yet.

### Blockers/Concerns

- Node 24.18.1 is required (`nvm use`). The machine default is Node 18, which is end-of-life and cannot run Next 16.
- GitHub unauthenticated search is ~10 req/min. Manual verification will hit the limit; use a server-side token locally or mock.
- No GitHub remote is configured — local-only by user instruction. CI requirements (Phase 0) are defined in-repo but cannot run until a remote exists.
- Next's fetch cache means a cache hit performs no network call, so rate-limit headers read from a cached response are likely stale rather than current. Confirm the actual behaviour during Phase 1 before treating any logged value as live headroom.
- No LICENSE file. Considered and not selected; revisit before submission.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Persistence | FAV-01, FAV-02 (favourites, search history) | v2 | Initialization |
| Operations | OPS-01, OPS-02, OPS-03 (Sentry, DAST, SBOM) | v2 | Initialization |

## Session Continuity

Last session: 2026-08-02
Stopped at: Completed .planning/phases/01-github-api-client/01-01-PLAN.md
Resume file: None

Next: execute 01-02-PLAN.md (Next fetch cache measurement)
