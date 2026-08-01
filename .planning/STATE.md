# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-01)

**Core value:** A reviewer can search for a repository, open its detail page, and find the code behind it clear, correct, and production-minded — including when the GitHub API fails or rate-limits.
**Current focus:** Phase 1 — GitHub API Client

## Current Position

Phase: 1 of 4 (GitHub API Client) — Phase 0 complete
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-08-01 — Operations and security documented; 10 requirements added (OBS, SEC, I18N, DOC). 44/44 v1 requirements mapped across Phases 0-4, verified consistent across REQUIREMENTS.md and both ROADMAP.md views

Progress: [██░░░░░░░░] 20% (1 of 5 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 0. Foundation & CI | — | — | — |

**Recent Trend:**
- Last 5 plans: —
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
- [Phase 2 upcoming]: Japanese UI strings, English code — reviewers are Japanese engineers; code stays readable to any engineer
- [Phase 3 upcoming]: `subscribers_count` for watchers — REST `watchers_count` duplicates stars

### Pending Todos

None yet.

### Blockers/Concerns

- Node 20.20.1 is required (`nvm use`). The machine default is Node 18 and Next 16 will refuse to run.
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

Last session: 2026-08-01
Stopped at: ROADMAP.md and STATE.md written; REQUIREMENTS.md traceability confirmed at 34/34
Resume file: None

Next: `/gsd:plan-phase 1`
