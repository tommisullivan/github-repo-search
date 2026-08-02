---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: milestone complete — awaiting human review and merge of the Phase 4 PR
stopped_at: Phase 4 complete (all 5 plans); seven-command gate green in-session; PR from feature/phase-4-quality-gate into develop opened for human merge
last_updated: "2026-08-02T06:50:00.000Z"
last_activity: 2026-08-02
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 13
  completed_plans: 13
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-01)

**Core value:** A reviewer can search for a repository, open its detail page, and find the code behind it clear, correct, and production-minded — including when the GitHub API fails or rate-limits.
**Current focus:** Milestone v1.0 complete — Phase 4 PR open, awaiting human review and merge. LICENSE decision flagged to the human.

## Current Position

Phase: 4 of 4 (Quality Gate & Submission Readiness) — **complete**; all 46 v1 requirements Complete
Plan: 5 of 5 in current phase — all plans complete
Status: Phase 4 complete on `feature/phase-4-quality-gate`, executed as four waves in the main session (04-01 → {04-02, 04-03, 04-04} → 04-05). PR into `develop` opened for human merge — an agent never merges (D4-20).
Last activity: 2026-08-02 — Phase 4 plans 04-01..04-05 complete: server-side GitHub API mock + TEST-03 journey; per-state axe (7 states, zero violations), keyboard-only journey, responsive assertions with one measured overflow fixed; nonce-based CSP at style-src ladder rung 2 with the four static security headers; coverage floor raised 70 → 92/90/85/92 with a red-run proof; bilingual Japanese-first README with the self-contained AI usage summary; OPERATIONS.md route/requestId reconciled; Process 9 in both AI usage logs (parity 9 = 9). All seven gate commands run and read in-session.

Progress: [██████████] 100% (all phases, all plans)

## Performance Metrics

**Velocity:**

- Total plans completed: 13
- Average duration: ~15 min (where tracked)
- Total execution time: 124 min tracked through Phase 3; Phase 4 per-plan durations were not individually recorded (waves in the main session)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 0. Foundation & CI | — | — | — |
| 1. GitHub API Client | 5 | 94 min | ~19 min |
| 2. Search Experience | 3 | 30 min | ~10 min |
| 3. Repository Detail Page | 3 | 30 min | ~10 min |
| 4. Quality Gate & Submission Readiness | 5 | not tracked per-plan | — |

**Per plan:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 1 P01 | 12 min | 3 tasks | 5 files |
| Phase 1 P02 | 18 min | 2 tasks | 1 file |
| Phase 1 P03 | 25 min | 2 tasks | 3 files |
| Phase 1 P04 | 20 min | 2 tasks | 4 files |
| Phase 1 P05 | 19 min | 3 tasks | 9 files |
| Phase 3 P01 | ~7 min | 2 tasks | 3 files |
| Phase 3 P02 | ~10 min | 2 tasks | 4 files |
| Phase 3 P03 | ~13 min | 2 tasks | 5 files + 2 logs |

**Recent Trend:**

- Last 5 plans: 01-01 (12 min), 01-02 (18 min), 01-03 (25 min), 01-04 (20 min), 01-05 (19 min)
- Trend: steady — Phase 1 delivered in 94 minutes across 5 plans. 01-05 was documentation, lint enforcement and the phase gate, so most of its time went to running and reading the seven gate commands rather than to writing code

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
- [Phase 1]: 01-04: searchRepositories and getRepository each return a Result AND may throw GitHubRequestError — The units deliberately do not catch githubFetch. A transport fault, timeout or 5xx must reach error.tsx (D-03); catching it would convert an unexpected fault into a state the UI has no branch for. A Phase 2/3 caller handling only ok:false is incomplete.
- [Phase 1]: 01-04: a page past the 1000-result ceiling returns INVALID_QUERY without a request — Page 51 begins at result 1001, so the request could only ever 422 (T-01-14). The bound is derived from SEARCH_MAX_RESULTS / SEARCH_PER_PAGE, never written as 50. It shares a code with the blank keyword, so Phase 2 must decide deliberately whether to distinguish 'refine your keyword' from 'that page does not exist' — only reachable by hand-editing the URL, since hasNextPage is clamped.
- [Phase 1]: 01-04: repo.ts writes its own summary mapping rather than sharing search.ts's toRepoSummary — Importing across the two units is the boundary violation the ARCHITECTURE.md table forbids (T-01-17), and moving the helper into the types-only module to save ten assignments trades a clean boundary for a small one. RepoDetail extends RepoSummary, so a new field fails to compile in both units at once — drift is a build error, not a review catch.
- [Phase 2]: The two `INVALID_QUERY` causes are distinguished at the page layer, not in the client — Phase 1's `Result` shape returns the same code for a blank keyword and a page > 50. The page runs both guards *before* calling the client and picks distinct Japanese copy. This closes the STATE.md pending item from Phase 1's plan 01-04 without pushing page-shape knowledge back into the client.
- [Phase 2]: Debounce is a local `useDebounce(value, delay)` hook using `setTimeout`/`clearTimeout` — no library (D-15/D-16). Chosen over `useDeferredValue` because the test needs a controllable delay to assert "exactly one URL change per debounce window" (SRCH-05).
- [Phase 2]: `router.replace`, never `router.push`, on a keystroke or a page change (D-03) — otherwise the browser history fills with a URL per keystroke and the back button becomes unusable.
- [Phase 2]: The search page never `try`/`catch`s the client call — a thrown `GitHubRequestError` must reach `app/error.tsx` unchanged (D-07 / Phase 1 D-03). Asserted by a test that mocks the client to throw and confirms the render itself rejects.
- [Phase 2]: `RateLimitPanel`'s `now` is a required prop, not an internal `Date.now()` — React 19's `react-hooks/purity` rule rejects `Date.now()` inside a component render. The page samples the clock at the boundary, the panel stays pure. This is a smaller test seam than mocking `Date.now()` globally and it states the design intent.
- [Phase 2]: Every non-interactive Phase 2 component (`ResultList`, `EmptyState`, `RateLimitPanel`, `InvalidQueryNotice`, `Pagination`) is a Server Component — `"use client"` is only on `SearchInput.tsx`, the one file that needs interactivity.
- [Phase 2]: A test that combines `userEvent.type` with `vi.useFakeTimers()` deadlocks under RTL v16 — the SearchInput tests use `fireEvent.change` wrapped in `act()` and drive the same effect chain synchronously. Recorded at the top of `SearchInput.test.tsx`.
- [Phase 2]: The `SearchInput` test mocks `useRouter` as a stable singleton — a fresh object per call would defeat the exhaustive-deps-driven effect and produce a false failure. Documented in the test file. **Rejected: an inline `eslint-disable` on the hook** — AGENTS.md forbids weakening lint rules, and the rule was catching a real signal; the fix belonged in the test seam.
- [Phase 3]: The detail route's inbound `?from=` back-target guard is a strict character-for-character mirror of Phase 1's outbound `SITE_RELATIVE_PATH` — same regex shape, both `/` and `\` rejected at the second position. The WHATWG URL parser trap Phase 1 measured applies to inbound query params identically to outbound paths; a helper with weaker semantics would be an origin-hijack waiting to be found.
- [Phase 3]: The rate-limit state is a component the page renders (`<RepoRateLimitPanel>` — renamed from `<RateLimitPanel>` at Phase 2 rebase because Phase 2 had already shipped a search-page `<RateLimitPanel>` with a different API and copy), not an `error.tsx` branch. Production Next sanitises server errors before the client boundary receives them, so per-state UI inside `error.tsx` would silently degrade to a generic message once deployed — the same reasoning that produced Phase 1 D-01 applies to this component's very existence. Two components per state (one per route) preserved because copy is route-specific: the search page tells the user how many minutes to wait, the detail page names the exact reset time in Tokyo and links back to search.
- [Phase 3]: `notFound()` is called inside `page.tsx` for `NOT_FOUND` and `INVALID_QUERY` (defence in depth on the latter), so `not-found.tsx` gets a real 404 status. The switch's `default` uses `assertNever` — a fifth `GitHubFailure` variant becomes a compile error at this file.
- [Phase 3]: `images.remotePatterns` is a single entry, https + `avatars.githubusercontent.com`, no `pathname`. Wildcards, subdomain globs, and secondary "safe" hosts were each rejected with a reason recorded in-file; adding any of them would turn the Next image optimiser into a broader image proxy than SEC-02 permits.
- [Phase 3]: The metrics section on `<RepoDetail>` uses `role="region"` with an `sr-only` heading rather than `<dl>` because `<dl>` has no default `list` role in ARIA and jsdom queries would have failed against it. The accessibility structure was corrected to match the query; neither the test nor the role was faked.

### Pending Todos

- ~~**For 01-05:** `docs/ARCHITECTURE.md` labels the client `githubFetch(path, init)` in two diagrams.~~ **Done in `bbfa68c`** — both diagrams now show `githubFetch({ path, endpoint, revalidate })`, with the reason stated: an `init` parameter would let a caller pass its own `cache` and silently undo API-05.
- ~~**For 01-05:** verification greps that also match test files.~~ **Done** — all Phase 1 sweeps were scoped to non-test, non-comment lines and reported as such. Three checks could not be expressed as literally written; see 01-05-SUMMARY.md.
- **Convention, now four plans running:** a boundary grep is written against **non-test, non-comment lines**, or it is written as a test. 01-05's own automated chain forbade a string that its own required deliverable had to contain (`dangerouslySetInnerHTML` in `src/eslint-rules.test.ts`). Where a check cannot express the real property, report it — do not weaken code to satisfy it.
- ~~**For Phase 4 (DOC-01):** the README still needs the `subscribers_count` note the brief asks for (AGENTS.md § GitHub API rules).~~ **Done in Phase 4 (04-05)** — the bilingual README explains the `watchers_count`-duplicates-stars trap in full, in both language halves, consistent with the code-level comments at `src/lib/github/repo.ts` and `RepoDetail.tsx`.
- ~~**For Phase 4 UX pass:** `RepoDetail.tsx`'s branch coverage is 100% for `language: null` but only 75% overall because `description: null` has no dedicated test.~~ **Done in Phase 4 (04-02)** — fixture with `description: null` added; asserts no empty `<p>` renders. `RepoDetail.tsx` at 100% branches in the final coverage run.
- ~~**For Phase 4 (TEST-04):** the `text` coverage reporter prints an **empty per-file table** while the summary and threshold gate are correct (`skipFull` ruled out).~~ **Done in plan 04-04** — root cause: Vitest 4 injects `skipFull: true` into the text reporter's *per-reporter* options when it detects an AI-agent session (`std-env` `isAgent` via `CLAUDECODE`), and per-reporter options beat the top-level `--coverage.skipFull=false` flag, which is why the Phase 1 rule-out was wrong. Fixed with an explicit `["text", { skipFull: false }]`; thresholds then raised 70 → 92 stmts / 90 branches / 85 funcs / 92 lines from the measured run, with a red-run proof (lines=97 failed, exit 1). See `04-04-SUMMARY.md` and `docs/TESTING.md` § Coverage.
- ~~**For Phase 4:** `docs/OPERATIONS.md` marks `route` as deferred and `requestId` as per-GitHub-call.~~ **Done in Phase 4 (04-05)** — both rows now record the shipped v1 behaviour as decisions with reasons (per-call correlation is the only correlation the app has needed; `route` would duplicate the `endpoint` literal union). Doc-only per D4-18 — the sealed `src/lib/github/` boundary stays sealed; per-inbound-request threading is v2, if ever.
- ~~**For Phase 2:** `searchRepositories` returns `INVALID_QUERY` for **both** a blank keyword and a page past the 1000-result ceiling.~~ **Done in Phase 2** — the page runs both guards *before* calling the client and picks distinct Japanese copy: "キーワードを入力してください" for blank, "検索できるページを超えています" for out-of-range. Asserted by `src/app/page.test.tsx` tests 5 and 6.
- ~~**For Phases 2 and 3:** both units return a `Result` **and may throw** `GitHubRequestError`.~~ **Done for both** — Phase 2's search page and Phase 3's detail page both let `githubFetch` throws reach `error.tsx` unchanged. Asserted by tests in each phase's page test.
- ~~**For Phase 3:** the detail page will need to parse `?from=<encoded url>` to render a "戻る" link back to the search view.~~ **Done in Phase 3** — `resolveBackTarget` decodes and validates the `from` param and the `<BackLink>` on `RepoDetail` renders it; 15 guard tests + open-redirect defence for `/\` and `//`.
- ~~**For Phase 3:** the search page passes `<Link href={/repos/${owner}/${name}?from=...}>` from `ResultList`.~~ **Route exists.** Phase 3 shipped `/repos/[owner]/[repo]`, so the search links resolve.
- ~~**For Phase 4 (log numbering):** Process 7 = Phase 2, Process 8 = Phase 3.~~ **Resolved** — both entries stand in order 7 → 8, Process 9 (Phase 4) appended after; entry-count parity 9 = 9 across the two log files.
- ~~**For Phase 4 (E2E):** the E2E and a11y specs still exercise only the scaffold home page.~~ **Done in Phase 4 (04-01/04-02)** — 17 E2E tests including the search→detail journey against the server-side mock, and 7 per-state axe checks.

### Blockers/Concerns

- Node 24.18.1 is required (`nvm use`). The machine default is Node 18, which is end-of-life and cannot run Next 16.
- GitHub unauthenticated search is ~10 req/min. Manual verification will hit the limit; use a server-side token locally or mock.
- ~~No GitHub remote is configured — local-only by user instruction. CI requirements (Phase 0) are defined in-repo but cannot run until a remote exists.~~ **Stale — struck 2026-08-02.** The `origin` remote exists (`github.com/tommisullivan/github-repo-search`) and PRs #10, #13, #14 were merged through it with the CI workflow observed green on `develop` for each. The Phase 0–3 "defined and locally verified, not observed green in CI" caveat is thereby resolved by observed CI history.
- ~~Next's fetch cache means a cache hit performs no network call, so rate-limit headers read from a cached response are likely stale rather than current.~~ **Resolved 2026-08-02 by plan 01-02's measurement: confirmed stale.** Every cached cell replayed `x-ratelimit-remaining=59` from its first call while the upstream counter never advanced. A logged headroom figure is historical, not live — log it, do not alert on it. See `docs/OPERATIONS.md`.
- **FLAGGED HUMAN DECISION (D4-21): No LICENSE file.** Considered and deliberately not selected by an agent — choosing a licence for a selection-task submission is the owner's call. Raised at Phase 4 close in the 04-05 summary and the PR description. Decide before submission.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Persistence | FAV-01, FAV-02 (favourites, search history) | v2 | Initialization |
| Operations | OPS-01, OPS-02, OPS-03 (Sentry, DAST, SBOM) | v2 | Initialization |

## Session Continuity

Last session: 2026-08-02T06:50:00.000Z
Stopped at: Phase 4 complete — all five plans executed, seven-command gate green in-session, Process 9 in both logs, PR from `feature/phase-4-quality-gate` into `develop` opened. Agent stopped at the PR boundary per D4-20.
Resume file: None

Next: human reviews and merges the Phase 4 PR, and decides the LICENSE question (flagged, D4-21). That closes milestone v1.0 — all 46 v1 requirements Complete.
