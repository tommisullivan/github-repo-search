---
phase: 01-github-api-client
plan: 01
subsystem: api
tags: [typescript, github-rest-api, error-handling, structured-logging, vitest]

requires:
  - phase: 00-foundation
    provides: Vitest + RTL harness, TypeScript strict, coverage gate, CI quality job
provides:
  - Typed GitHub payload types and the camelCase domain types that cross the boundary
  - The four-code failure vocabulary, the Result<T> type, and the HTTP-status-to-failure mapping
  - GitHubRequestError as the single thrown type for transport faults and unrecognised statuses
  - logGitHubCall() and logUnauthenticatedOnce() — one JSON line per GitHub call, token-proof by construction
affects: [01-02 cache measurement, 01-03 client, 01-04 search and repo units, 01-05 docs, phase-2 search UI, phase-3 detail UI]

tech-stack:
  added: []
  patterns:
    - "Returned failures vs thrown faults: expected states are values, unexpected ones are exceptions"
    - "Closed log-entry type as a compile-time secret-redaction control"
    - "Payload types (snake_case) never leave src/lib/github; domain types (camelCase) do"

key-files:
  created:
    - src/types/github.ts
    - src/lib/github/errors.ts
    - src/lib/github/errors.test.ts
    - src/lib/github/log.ts
    - src/lib/github/log.test.ts
  modified: []

key-decisions:
  - "toFailure() returns null rather than throwing, so the decision to throw stays with the caller that owns the request"
  - "resetAt always resolves to a number (retry-after → x-ratelimit-reset → now+60s) because the UI must say when to retry"
  - "429 is treated as rate-limited unconditionally; 403 only when retry-after or an exhausted x-ratelimit-remaining says so"
  - "level is derived inside logGitHubCall, never passed in, so two call sites cannot disagree about what a 403 means"
  - "The D-15 unauthenticated notice fires on first GitHub call, not at module load, to keep it out of next build"

patterns-established:
  - "Error messages in src/lib/github are English operator text that reaches logs; user-facing Japanese is Phase 2's"
  - "Tests build inputs from the real Response/Headers constructors, never hand-rolled fakes"
  - "Fake timers only where a clock-derived value is asserted, restored in afterEach"

requirements-completed: [API-01, API-02, OBS-01, OBS-03, TEST-01]

duration: 12min
completed: 2026-08-02
---

# Phase 1 Plan 01: Contracts Summary

**The GitHub boundary's three contracts — typed payload/domain shapes, a four-code failure vocabulary with `Result<T>` and status mapping, and a closed-field JSON log line that makes writing a token a compile error.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-02T02:29Z
- **Completed:** 2026-08-02T02:41Z
- **Tasks:** 3 of 3
- **Files created:** 5

## Accomplishments

- `src/types/github.ts` names every GitHub field this app reads, so no `unknown` reaches a caller (API-01). The `watchers_count` trap is documented at the field itself, and `RepoDetail` has no `watchersCount` member — the only way to populate `watchers` is a deliberate mapping from `subscribers_count`.
- `src/lib/github/errors.ts` implements the D-05a reconciliation in code: `RATE_LIMIT` / `NOT_FOUND` / `INVALID_QUERY` are returned in a `Result`, `NETWORK` is thrown on a `GitHubRequestError`. Every mapping branch has a named test (TEST-01, first instalment).
- `src/lib/github/log.ts` emits one JSON line per call with the OBS-01 field set and a derived `level`. The entry type is closed, so there is no field a header bag, body, or token could be written into (OBS-03, T-01-01).
- 21 tests pass, 100% coverage of the new modules, zero new dependencies.

## Task Commits

1. **Task 1: GitHub response and domain types** — `e82fea1` (feat)
2. **Task 2: Failure vocabulary, Result type, status mapping** — `b31eb0c` (feat)
3. **Task 3: Structured logging with redaction by construction** — `07290e5` (feat), with a follow-up comment edit that landed in `c7b8c6e` (see Issues Encountered)

## Exported signatures — plans 01-02..01-05 compile against these

`src/types/github.ts`:

```ts
export type GitHubOwnerPayload = { login: string; avatar_url: string };

export type GitHubRepoSummaryPayload = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  owner: GitHubOwnerPayload;
};

export type GitHubSearchPayload = {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepoSummaryPayload[];
};

export interface GitHubRepoDetailPayload extends GitHubRepoSummaryPayload {
  subscribers_count: number;
  watchers_count: number; // TRAP — duplicate of stargazers_count, never render
}

export type RepoSummary = {
  id: number;
  name: string;
  fullName: string;
  owner: { login: string; avatarUrl: string };
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  htmlUrl: string;
};

export interface RepoDetail extends RepoSummary {
  watchers: number; // from subscribers_count
}

export type SearchResult = {
  items: RepoSummary[];
  totalCount: number;
  page: number;
  perPage: number;
  hasNextPage: boolean;
};
```

`src/lib/github/errors.ts`:

```ts
export type GitHubErrorCode = "RATE_LIMIT" | "NOT_FOUND" | "INVALID_QUERY" | "NETWORK";

export type GitHubFailure =
  | { code: "RATE_LIMIT"; resetAt: number }
  | { code: "NOT_FOUND" }
  | { code: "INVALID_QUERY" };

export type Result<T> = { ok: true; data: T } | { ok: false; error: GitHubFailure };

export class GitHubRequestError extends Error {
  readonly code = "NETWORK" as const;
  readonly status?: number;
  constructor(message: string, options?: { status?: number; cause?: unknown });
}

export function toFailure(response: Response): GitHubFailure | null;
export function toRequestError(cause: unknown, status?: number): GitHubRequestError;
```

`src/lib/github/log.ts`:

```ts
export type GitHubEndpointLabel = "search/repositories" | "repos/{owner}/{repo}";

export type GitHubCallLog = {
  event: "github_request";
  requestId: string;
  endpoint: GitHubEndpointLabel;
  status: number | null;
  durationMs: number;
  rateLimitRemaining: number | null;
  rateLimitReset: number | null;
  cacheHit: boolean | null;
  errorType: string | null;
};

export function logGitHubCall(entry: GitHubCallLog): void;
export function logUnauthenticatedOnce(): void;
```

Notes for callers:

- `toFailure` returning `null` means "not an expected failure" — the caller must throw `toRequestError(cause, response.status)`.
- `resetAt` is Unix **seconds**, not milliseconds.
- `GitHubCallLog` has no `level` field: `logGitHubCall` derives it. Do not add one.
- `requestId` is generated by the caller, per GitHub call. Nothing generates it inside `log.ts`.

## Behaviour verified by test

`errors.test.ts` (12 tests): 403 with exhausted quota → `RATE_LIMIT` with reset; 429 → `RATE_LIMIT`; `retry-after` beats `x-ratelimit-reset`; unparseable headers fall back to now+60s; 403 without exhaustion → `null`; 403 with `x-ratelimit-remaining: 5` → `null`; 404 → `NOT_FOUND`; 422 → `INVALID_QUERY`; 500/502/418 → `null`; `TypeError` → `NETWORK` with `status: undefined` and the cause preserved; `DOMException` named `TimeoutError` → message naming the timeout; `toRequestError(cause, 500)` → `status: 500`; no token or `authorization` string in any produced error.

`log.test.ts` (8 tests): one `console.log` whose argument parses as JSON; the full OBS-01 field set including derived `level`; `info` below 400; `warn` for 403/429/404; `error` for a set `errorType`, a `null` status, and 5xx; a stubbed `GITHUB_TOKEN` value appears in nothing written to stdout; three calls to `logUnauthenticatedOnce` produce one line; a module reset produces a line again.

## Decisions Made

- **`toFailure` returns `null` instead of throwing on an unrecognised status.** The module that owns the request has the status and the cause; making it throw keeps `errors.ts` free of any knowledge of how the request was made.
- **429 is unconditionally rate-limited, 403 is conditional.** A 403 means "forbidden" in general; telling a user to wait for a quota window that is not the problem is worse than a generic error.
- **`resetAt` never absent.** D-08 exists so the UI can say *when* to retry; "unknown" is not something a user can act on, hence the now+60s floor.
- **No RED-only commit despite `tdd="true"`.** Each task's test was written first and run to observe it fail (recorded below), but AGENTS.md requires a green tree at every commit, so RED and GREEN landed in one commit per task. The failing run is evidence, the commit is not.

## Deviations from Plan

### 1. `errors.ts` does not import from `@/types/github`

- **Found during:** Task 2
- **Plan text:** the frontmatter `key_links` block asserts `src/lib/github/errors.ts` → `src/types/github.ts` "via type import of the raw payload shapes".
- **Reality:** nothing in the `<interfaces>` block for `errors.ts` references a GitHub payload type, and nothing in the implemented behaviour needs one — the module maps statuses and headers, never a body. The ARCHITECTURE.md boundary table says the shared core *may* depend on `types/github.ts`; that is a permission, not an obligation.
- **Decision:** no import was added. An unused import would fail lint, and inventing exports (`type SearchOutcome = Result<SearchResult>`) purely to justify the link would contradict the plan's own success criterion that `errors.ts` export *exactly* the six names in the interface block.
- **Impact:** none on any consumer. Callers import `Result<T>` from `errors.ts` and the domain types from `@/types/github` directly.

### 2. Two comment rewordings forced by the plan's own grep gates

- **Found during:** Task 3
- **Issue:** the plan's `<verification>` requires `grep -rn "console.error\|pino" src/lib/github/` to return no matches. The natural comments explaining *why* the module avoids both (`never console.error`, `do not add pino`) matched that grep.
- **Fix:** reworded to "never the error stream" and "D-18 records the logging library that was considered and rejected". The guidance survives; the literal tokens do not.
- **Note for future phases:** a grep that cannot distinguish a use from a warning against that use will keep pushing explanatory comments into vaguer language. If this check is kept, scope it to non-comment lines.

### 3. D-15 timing — the unauthenticated notice is not logged "at startup"

Stated explicitly because the substance is met but the timing is observably different:

- The notice is written on the **first GitHub call**, not at module load. A server that never makes a GitHub call therefore logs **no line at all**.
- "Exactly once" is scoped to a **module instance**. A restarted process, or a multi-instance deployment, emits one line per instance — not one per deployment.
- Logging at module load was the alternative and is worse: it would fire during `next build` and in every worker regardless of whether the app is ever used.

### 4. `route` is absent from the log line, and `requestId` is per GitHub call

`docs/OPERATIONS.md` lists `requestId` as generated per **inbound** request and includes a `route` field. Phase 1 has no routes, so `requestId` is generated per GitHub call by the caller and `route` is deliberately omitted rather than filled with an invented value. Plan 01-05 marks both as deferred in `docs/OPERATIONS.md`; Phase 2 is inheriting a named gap, not an oversight.

---

**Total deviations:** 4 — 1 plan-metadata inaccuracy (not actioned, documented), 1 comment rewording, 2 pre-agreed documentation deviations. No scope creep, no new dependencies, no architectural change.

## Issues Encountered

**A concurrent process committed to this branch mid-run.** While Task 3 was being committed, another agent committed `1ec92f5` ("fix(phase-1): close revision blockers B-1..B-3 and warnings W-1..W-13", touching `01-02-PLAN.md` and `01-05-PLAN.md`). A `git commit --amend` intended for the Task 3 commit therefore folded a one-line comment change into *that* commit instead, producing `c7b8c6e`.

Verified with `git diff 1ec92f5 c7b8c6e`: the only difference is the one-line comment in `src/lib/github/log.ts`. **No work was lost** — both plan revisions are intact. History was deliberately **not** rewritten to correct the attribution, because another process is actively committing to this branch and rewriting a shared ref while that is true risks destroying its work. If `1ec92f5` was recorded as a hash anywhere, the current equivalent is `c7b8c6e`.

## Threat Flags

None. The plan's threat register was implemented as written: T-01-01 (closed log type + token-absence test), T-01-02 (no body or header interpolated into an error message), T-01-04 (`requestId` + derived `level` on every call). T-01-03 (no runtime schema validation) remains accepted. T-01-SC holds — `git diff --stat` on `package.json` and `package-lock.json` across all three task commits is empty.

## Known Stubs

None. Every export is implemented and tested; nothing returns a placeholder value.

## Verification

Run with Node 24.18.1 after `nvm use`, at the tip of this plan's work:

| Command | Result |
|---|---|
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm run test:coverage` | 3 files, **21 tests passed**; statements 46/46, branches 36/36, functions 11/11, lines 46/46 — all 100%, thresholds (70%) met |
| `npm run build` | compiled in 1821ms, TypeScript finished, 4 static pages generated |
| `git diff --stat package.json package-lock.json` | empty |
| `grep -rnE "@ts-ignore\|@ts-expect-error" src/types/github.ts src/lib/github/` | no matches |
| `grep -rn "console.error\|pino" src/lib/github/` | no matches |

`npm run test:e2e` and `npm run test:a11y` were not run: this plan adds no route, component, or markup, and the existing specs cover the scaffold page unchanged. They belong at the phase gate, per AGENTS.md.

## Self-Check: PASSED

- `src/types/github.ts` — FOUND
- `src/lib/github/errors.ts` — FOUND
- `src/lib/github/errors.test.ts` — FOUND
- `src/lib/github/log.ts` — FOUND
- `src/lib/github/log.test.ts` — FOUND
- Commits `e82fea1`, `b31eb0c`, `07290e5` — all present in `git log`

## User Setup Required

None. No external service configuration, no environment variable is required by this plan (`GITHUB_TOKEN` stays optional and is not read by any module here).

## Next Phase Readiness

Plans 01-02 (cache measurement), 01-03 (`client.ts`) and 01-04 (`search.ts` / `repo.ts`) can be written directly against the signatures above with no exploration.

Carried forward:

- **D-11b is still unmeasured.** Whether passing an `AbortSignal` opts a request out of Next's persistent data cache as well as memoization is unconfirmed. `cacheHit: boolean | null` in `GitHubCallLog` is nullable precisely so plan 01-02 can report honestly instead of guessing.
- **Rate-limit headers on a cached response are historical, not live headroom.** Nothing in this plan can resolve that; plan 01-02 measures it.
- **`errors.ts` currently has no import of `@/types/github`** — see Deviation 1, in case a later plan expects that link to exist.

---
*Phase: 01-github-api-client*
*Completed: 2026-08-02*
