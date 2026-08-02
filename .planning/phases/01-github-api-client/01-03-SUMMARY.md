---
phase: 01-github-api-client
plan: 03
subsystem: api
tags: [nextjs-16, fetch-cache, timeout, retry-policy, rate-limiting, structured-logging, ssrf-guard, vitest]

requires:
  - phase: 01-github-api-client
    provides: "01-01 — Result<T>, GitHubFailure, GitHubRequestError, toFailure, toRequestError, logGitHubCall, logUnauthenticatedOnce"
  - phase: 01-github-api-client
    provides: "01-02 — the measured decision line naming the exact fetch options, and the probe harness recorded verbatim"
provides:
  - githubFetch() — the single outbound path to api.github.com, with the cache opt-in, the 5s deadline, the retry policy, the token, and the log line
  - GitHubFetchOptions — the { path, endpoint, revalidate } shape plan 01-04's units call with
  - A counted end-to-end confirmation that the shipped client caches (6 renders, 1 upstream request)
  - The origin guard that keeps a caller-supplied path from redirecting the Authorization header
affects: [01-04 search and repo units, 01-05 docs and phase gate, phase-2 search UI, phase-3 detail UI]

tech-stack:
  added: []
  patterns:
    - "The cache opt-in is asserted in the outgoing fetch init by a named unit test, so dropping it fails a test rather than costing quota"
    - "A behaviour the app depends on is confirmed against the shipped function, not inferred from the options it passes"
    - "A test-only base URL is a reverted source edit verified by diff, never a configuration knob"

key-files:
  created:
    - src/lib/github/client.ts
    - src/lib/github/client.test.ts
  modified:
    - docs/OPERATIONS.md

key-decisions:
  - "Ships plan 01-02's decision line verbatim: cache 'force-cache' + next.revalidate + AbortSignal.timeout(5000) — outcome 1 of three, no Promise.race fallback needed"
  - "The origin guard rejects a leading backslash as well as a leading slash — measured: new URL('/\\\\host/x', base) resolves to https://host/x, the same hijack the protocol-relative form gives"
  - "The base URL stays a hard-coded constant; Task 2 pointed it at the probe with a reverted source edit (T-01-26)"
  - "requestId is one per logical call, shared across a retry, so both attempts correlate in stdout"
  - "cacheHit stays null and durationMs is never fudged positive — the live run showed a cache hit at durationMs 0"
  - "Requirements are marked Complete only when no remaining plan in the phase still claims them"

patterns-established:
  - "Dynamic import after vi.resetModules() loads client and errors from one fresh graph, so once-per-module log state is per-test and instanceof still matches"
  - "Retry policy is proven by asserting fetch call counts, never by reading the code"

requirements-completed: [API-03, OBS-02, OBS-03]

duration: 25min
completed: 2026-08-02
---

# Phase 1 Plan 03: The GitHub Client Summary

**`githubFetch()` is the one function that talks to GitHub, and the app's cache is now a counted fact rather than a plausible set of options: six renders of a dynamic route driving the real client produced one upstream request.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-02T02:47Z
- **Completed:** 2026-08-02T03:12Z
- **Tasks:** 2 of 2
- **Files created:** 2

## Task Commits

1. **Task 1: githubFetch with the cache opt-in, timeout, retry, token, and logging policy** — `b9db5fc` (feat)
2. **Task 2: Counted end-to-end confirmation that the shipped client caches** — `cdaa34f` (docs)

## The signature plan 01-04 compiles against

```ts
// src/lib/github/client.ts

export type GitHubFetchOptions = {
  /** A fully built, already-encoded absolute path with its query string. */
  path: string;
  /** Which endpoint this is, for the log line. */
  endpoint: GitHubEndpointLabel;
  /** How stale the caller tolerates: 60s for search, 300s for detail (D-09). */
  revalidate: number;
};

export async function githubFetch<T>(
  options: GitHubFetchOptions
): Promise<Result<T>>;
```

Notes for callers:

- `path` must begin with a single `/` followed by a character that is neither `/` nor `\`. Anything else throws `GitHubRequestError` **before** any network activity. `/search/repositories?q=…` and `/repos/owner/repo` are the two shapes the units build.
- `revalidate` is the caller's; the **cache opt-in is the client's**. A unit passing a different window cannot accidentally drop the caching.
- `endpoint` is the `GitHubEndpointLabel` literal union from `log.ts` — a typo fails the build.
- Returns `{ ok: false, error }` for `RATE_LIMIT` / `NOT_FOUND` / `INVALID_QUERY`. **Throws** `GitHubRequestError` for transport faults, timeouts, unrecognised statuses (including every 5xx), and malformed JSON. Units must not re-map either.
- `T` is asserted, not validated (T-01-11). The cast lives on one line inside `client.ts`; nothing downstream should cast again.
- No `requestId` argument: the client generates one per call with `crypto.randomUUID()`.

## The fetch options as shipped, verbatim

```ts
await fetch(url, {
  headers,
  cache: "force-cache",
  next: { revalidate },
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), // 5000
});
```

**Plan 01-02's outcome 1 applied** — "cell d cached", so all three options ship together. The `Promise.race` fallback the plan held in reserve was not needed, and no amendment to the resilience table in `docs/OPERATIONS.md` was required.

Module constants: `GITHUB_API_BASE_URL = "https://api.github.com"`, `REQUEST_TIMEOUT_MS = 5000`, `TRANSPORT_RETRY_DELAY_MS = 250`, `GITHUB_API_VERSION = "2022-11-28"`.

## Task 2 — the counted result (this is the phase's evidence for API-05)

| | Count |
|---|---|
| Requests sent to `/cache-confirm?x=1` | **6** (3, then 3 more) |
| Requests received by the upstream counter | **1** |
| `serverCount` rendered | `1` on all six |

The build's route table showed `ƒ /cache-confirm` before anything was driven, so this is the persistent data cache and not prerendering. The probe server was restarted after the build so the counter started at zero (it read 0 anyway — the restart removed the possibility rather than assuming it).

**1, not 3. The shipped client caches.**

The three structured lines the running app wrote during the first burst are the direct evidence, and they also turn plan 01-02's Q4 finding into an observed operational fact:

```json
{"event":"github_request","requestId":"56476d64-…","endpoint":"search/repositories","status":200,"durationMs":26,"rateLimitRemaining":59,"rateLimitReset":2000000000,"cacheHit":null,"errorType":null,"level":"info"}
{"event":"github_request","requestId":"1f8d4aec-…","endpoint":"search/repositories","status":200,"durationMs":1,"rateLimitRemaining":59,"rateLimitReset":2000000000,"cacheHit":null,"errorType":null,"level":"info"}
{"event":"github_request","requestId":"d21cb426-…","endpoint":"search/repositories","status":200,"durationMs":0,"rateLimitRemaining":59,"rateLimitReset":2000000000,"cacheHit":null,"errorType":null,"level":"info"}
```

`rateLimitRemaining` held at 59 across all three while the upstream counter never moved — historical headroom, exactly as measured. `durationMs` fell 26 → 1 → 0, which is precisely the signal that must **not** be turned into a `cacheHit` guess, and it is also why `durationMs` is reported as measured rather than floored to a positive number: a cache hit legitimately takes 0ms.

One `github_unauthenticated` line was written first — no `GITHUB_TOKEN` was set for the run — and never repeated.

### Why the base URL was not made configurable

Recorded here and in `docs/OPERATIONS.md` because the next person will propose it.

An environment-settable `GITHUB_API_BASE_URL` is a **one-variable token-exfiltration path**: anyone who can set an environment variable redirects the `Authorization` header — the app's only secret — to a host they control. The same is true of a "test-only" export or a constructor argument; the attack does not care that the knob was added for tests.

The alternative costs nothing. A temporary one-line edit to the constant, made in the working tree and restored from a scratch backup in the same task, buys identical coverage and adds zero attack surface. Restoration was verified by `diff` against the backup (identical), by `git status` (clean), and by an automated `! grep -q "127.0.0.1" src/`. That is T-01-26, and it is a design rejection, not a deferral.

## Behaviour verified by test

`client.test.ts` — 33 tests, every bullet in the plan's `<behavior>` block plus two additions:

**The outgoing request:** `cache: "force-cache"` with the caller's `revalidate` (the named test this plan exists for); `revalidate: 300` passed through unchanged for the detail window; `cache` is never `"no-store"`; the URL is exactly `https://api.github.com{path}`; `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28` on every call; an `AbortSignal` is attached.

**The token:** `Bearer <token>` when set and no unauthenticated notice; no `Authorization` header and one notice when unset; the same when the value is whitespace-only; and nothing written to stdout across a success, a 500, and a failed retry contains the token or the string `authorization`.

**The path guard:** protocol-relative (`//evil.example.com/x`), absolute (`https://evil.example.com/x`), **backslash protocol-relative** (`/\evil.example.com/x`), relative, empty, and bare `/` all throw with `fetch` never called; the rejected path is not echoed into the error message.

**Response mapping:** 200 → parsed body, one call; 403 with `x-ratelimit-remaining: 0` → `RATE_LIMIT` with `resetAt`, one call; 429 → `RATE_LIMIT`, one call; 404 → `NOT_FOUND`, one call; 422 → `INVALID_QUERY`, one call; 500 → throws with `status: 500`, **one call**; non-JSON 200 body → throws.

**Retry policy:** a `TypeError` retries once and the retry's result is returned (2 calls); two `TypeError`s throw `NETWORK` (2 calls); a `TimeoutError` throws and is **not** retried (1 call).

**The log line:** exactly one per completed call with status, both rate-limit values and a `requestId`; a duration measured across a genuinely delayed call; a null-status line with `errorType: "GitHubRequestError"` when the request never completes; two lines sharing one `requestId` when a retry happens; `rateLimitRemaining`/`rateLimitReset` null when the headers are absent or unparseable; `cacheHit` always null.

## Deviations from Plan

### 1. [Rule 2 — missing critical security functionality] The origin guard also rejects a leading backslash

- **Found during:** Task 1, while writing the guard.
- **Issue:** The plan specifies "a leading single `/` followed by a non-`/` character". Measured in Node 24.18.1:

  ```
  new URL("/\\evil.example.com/x", "https://api.github.com") → https://evil.example.com/x
  ```

  The WHATWG URL parser treats `\` as `/` in a special scheme, so `/\host/x` is the protocol-relative hijack in a form the specified regex **permits**. A guard that blocks `//` but not `/\` reads as protection while leaving the exact attack it was written for one character away — and T-01-05 exists precisely so a future edit that concatenates a user value into `path` cannot redirect the `Authorization` header.
- **Fix:** `/^\/[^/\\]/`, with the measured `new URL` result recorded in a comment beside it, plus a named test case.
- **Files modified:** `src/lib/github/client.ts`, `src/lib/github/client.test.ts`
- **Commit:** `b9db5fc`

### 2. [Rule 2 — missing coverage] Added a test for absent or unparseable rate-limit headers

- **Found during:** Task 1 verification — coverage showed one uncovered line in `headerInt`.
- **Issue:** Not in the plan's `<behavior>` list, but a proxy or a replayed cached response can omit `x-ratelimit-reset` or send a non-numeric value, and OBS-01 depends on that field being honest. The untested branch was the one that decides between `null` and a garbage number.
- **Fix:** One test with `x-ratelimit-remaining: "unknown"` and no `x-ratelimit-reset`, asserting both log as `null`. Coverage of `client.ts` went to 100%.
- **Commit:** `b9db5fc`

### 3. [Judgement] Two lines of the plan's `<verification>` block cannot be satisfied as literally written

Reported rather than worked around, because the next plan inherits the same checks.

- **`grep -rn "api.github.com" src/` — "matches `src/lib/github/client.ts` only."** It also matches `client.test.ts`, which asserts `expect(urlOf(fetchMock)).toBe("https://api.github.com…")` — the very test that proves the claim the grep is checking. The substantive check holds: **exactly one non-test module** contains the base URL.
- **`grep -rn "GITHUB_TOKEN" src/` — "matches `client.ts` only."** It also matches two test files, a comment in `src/types/github.ts`, and the notice text in `log.ts`. The check that actually matters is `grep -rn "process.env" src/`, which matches **`client.ts:92` and nothing else** — one module reads the environment.

This is the same class of problem 01-01 hit with `grep -rn "console.error\|pino"`: a grep that cannot distinguish a use from an assertion about that use. Scoping these to non-test files would fix both.

### 4. [Judgement] `docs/ARCHITECTURE.md` describes the signature as `githubFetch(path, init)`

Not actioned. `ARCHITECTURE.md` was written before Phase 1 was planned and sketches `githubFetch(path, init)` in two diagrams; the plan's `<interfaces>` block specifies the single-options-object form, and 01-04 is written against that. The options object is also the better shape here — `endpoint` and `revalidate` are not `RequestInit` members, and an `init` parameter would invite callers to pass their own `cache`, which is exactly the ownership split D-11a argues against. Flagging it so plan 01-05 can correct the two diagram labels while it is in the docs.

### 5. [Judgement] No RED-only commit despite `tdd="true"`

Same reasoning as 01-01. `client.test.ts` was written first and run to observe it fail — `Failed to resolve import "./client"`, 1 file failed, no tests — but AGENTS.md requires a green tree at every commit, so RED and GREEN landed in one commit. The failing run is the evidence; the commit is not.

---

**Total deviations:** 5 — 2 auto-fixes under Rule 2, 3 documented judgements. No scope creep, no new dependencies, no architectural change.

## Requirements

`API-03`, `OBS-02` and `OBS-03` are marked Complete. The rule applied: **a requirement is marked Complete only when no remaining plan in the phase still claims it.** By that rule the four this plan touches but does not close are:

| Requirement | Still claimed by | Why it is not closed here |
|---|---|---|
| API-02 | 01-04, 01-05 | The mapping is wired and tested, but the units still have to return it unmodified |
| API-05 | 01-04 | The cache is proven end to end, but no *app* response is cached until `search.ts` and `repo.ts` route through it |
| OBS-01 | 01-05 | Code complete and observed in the live run; 01-05 owns the documentation sweep |
| TEST-01 | 01-04, 01-05 | Second instalment of three |

This follows 01-02's precedent, which left API-05 and OBS-02 Pending rather than claiming a requirement its code did not yet deliver.

## Threat Mitigations Applied

- **T-01-05** (path tampering) — `/^\/[^/\\]/` before any network activity, with protocol-relative, absolute **and backslash** forms tested, and the rejected path kept out of the error message.
- **T-01-06** (token in headers) — read at call time in a server-only module, written to one `Authorization` header, never returned, never in an error message, never passed to `logGitHubCall`. Asserted by scanning every captured `console.log` argument across a success and two failure paths.
- **T-01-07** (token in the client bundle) — `process.env.GITHUB_TOKEN` appears in exactly one module, which no Client Component imports. Never `NEXT_PUBLIC_`. 01-05's sweep re-checks.
- **T-01-08** (stalled upstream) — 5s deadline on every request; a timeout is never retried, so the worst case is one deadline, proven by a call count of 1.
- **T-01-09** (retry amplification) — no HTTP response is ever retried; only a `TypeError`, once, after 250ms. Proven by `fetch` call counts on the 403, 429, 404, 422 and 500 paths.
- **T-01-26** (configurable base URL) — rejected as a design; the reasoning is in `docs/OPERATIONS.md` and above. The Task 2 edit was restored and verified by `diff`, by `git status`, and by grep.
- **T-01-27** (uncached client) — `cache: "force-cache"` asserted in the outgoing init by a named test **and** confirmed by counting six renders against one upstream request. Neither check passes on an uncached client.
- **T-01-11** (unvalidated JSON cast) — accepted as planned; a malformed body throws at parse time and the cast is confined to one line.
- **T-01-SC** (npm installs) — nothing installed. `git diff --stat package.json package-lock.json` across both task commits is empty.

## Known Stubs

None. Every export is implemented, tested, and exercised against a running server.

## Threat Flags

None. No new network endpoint, auth path, file access pattern, or schema was introduced beyond the outbound GitHub call the threat register already covers. The temporary `/cache-confirm` route existed for one task and is deleted; `git status --porcelain src/app/` is empty.

## Verification

Run with Node 24.18.1 after `nvm use`, in this session, output read:

| Command | Result |
|---|---|
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm run test:coverage` | 4 files, **54 tests passed**; statements 101/101, branches 56/56, functions 19/19, lines 101/101 — **100%**, thresholds met |
| `npm run build` | compiled successfully; route table shows only `○ /` and `○ /_not-found` |

Plan verification block:

| Check | Result |
|---|---|
| `grep -rn "api.github.com" src/` | `client.ts` (3, incl. comments) + `client.test.ts` (3 assertions) — see Deviation 3 |
| `grep -rn "process.env" src/` | `client.ts:92` only |
| `grep -rn "NEXT_PUBLIC" src/` | no matches |
| `grep -n "force-cache" src/lib/github/client.ts src/lib/github/client.test.ts` | both files match |
| `grep -rn "127.0.0.1" src/` | no matches |
| `git diff --stat package.json package-lock.json` | empty |
| `git status --porcelain src/app/` | empty |
| `test ! -d src/app/cache-confirm` | pass |
| `diff scratch/client.ts.backup src/lib/github/client.ts` | identical |
| `docs/OPERATIONS.md` headings | `### Measured…` at line 42, `#### Confirmed against the shipped client` at line 105 |

`npm run test:e2e` and `npm run test:a11y` were not run: this plan adds no route, component, or markup that survives it. They belong at the phase gate, per AGENTS.md.

Housekeeping: the probe server and `next start` were both killed (`lsof -ti :4599 :3100` returns nothing) and the scratch harness deleted. `.next/types` was regenerated by a rebuild after deleting the temporary route — without it `typecheck` fails on a stale route validator, the same issue 01-02 hit.

## Self-Check: PASSED

- `src/lib/github/client.ts` — FOUND
- `src/lib/github/client.test.ts` — FOUND
- `docs/OPERATIONS.md` — FOUND, contains `#### Confirmed against the shipped client`
- `src/app/cache-confirm/` — ABSENT, as required
- Commits `b9db5fc` and `cdaa34f` — both present in `git log`

## User Setup Required

None. `GITHUB_TOKEN` stays optional; the app runs unauthenticated and says so once in the logs.

## Next Phase Readiness

Plan 01-04 can write `search.ts` and `repo.ts` directly against `githubFetch<T>({ path, endpoint, revalidate })` with no exploration. The units own query construction (`URLSearchParams`, `encodeURIComponent`, the `per_page=20` of D-12) and the empty-query guard of API-04; they own neither the cache opt-in nor the error mapping.

Carried forward:

- **Two `<verification>` greps in later plans need scoping to non-test files** — see Deviation 3.
- **`docs/ARCHITECTURE.md` still shows `githubFetch(path, init)`** in two diagrams — see Deviation 4, for 01-05.
- **A malformed-JSON 200 logs at `level: "info"`** before it throws. The plan fixes the order — read headers, log, then branch — so the line is guaranteed even if a later step fails, and the parse failure surfaces as the thrown `GitHubRequestError` instead. Worth knowing when reading stdout: an `info` line can be immediately followed by a boundary error.
- **`durationMs` can legitimately be `0`** on a cache hit, as the live run showed. Nothing should treat a zero duration as a bug or as a cache signal.

---
*Phase: 01-github-api-client*
*Completed: 2026-08-02*
