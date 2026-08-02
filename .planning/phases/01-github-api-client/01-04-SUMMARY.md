---
phase: 01-github-api-client
plan: 04
subsystem: api
tags: [github-search, github-detail, urlsearchparams, path-encoding, pagination, subscribers-count, vitest]

requires:
  - phase: 01-github-api-client
    provides: "01-03 — githubFetch<T>({ path, endpoint, revalidate }), which owns the cache opt-in, the timeout, the retry policy and the status mapping"
  - phase: 01-github-api-client
    provides: "01-01 — Result<T>, GitHubFailure, GitHubRequestError, and the GitHubEndpointLabel literal union"
provides:
  - "searchRepositories(query, page?) — the only search entry point Phases 2 and 3 call"
  - "getRepository(owner, repo) — the only detail entry point, including the subscribers_count → watchers correction"
  - "SEARCH_PER_PAGE (20) and SEARCH_MAX_RESULTS (1000), from which the last reachable page is derived rather than hard-coded"
  - "The dual contract both units share: returns a Result AND may throw GitHubRequestError"
affects: [01-05 docs and phase gate, phase-2 search UI, phase-3 detail UI]

tech-stack:
  added: []
  patterns:
    - "A URL-construction test parses the outgoing URL with `URL`/`URLSearchParams` and asserts on `pathname` and `searchParams`, never on a substring — a substring check passes on a URL that is still wrong"
    - "A guard test asserts `fetch` was never called, not merely that the returned code was right: the guarantee is about the request not being made"
    - "Each unit maps the payload it owns; the shared summary shape is duplicated across the boundary on purpose, with the compiler catching drift"

key-files:
  created:
    - src/lib/github/search.ts
    - src/lib/github/search.test.ts
    - src/lib/github/repo.ts
    - src/lib/github/repo.test.ts
  modified: []

key-decisions:
  - "`page > 50` returns INVALID_QUERY without a request — derived from SEARCH_MAX_RESULTS / SEARCH_PER_PAGE, never written as 50"
  - "Blank owner or repo returns NOT_FOUND, not INVALID_QUERY: a blank owner names no repository and the not-found page is the honest answer"
  - "`repo.ts` writes its own summary mapping rather than importing `search.ts`'s — the boundary table forbids the import and the compiler catches drift in both units at once"
  - "Both units return a Result AND may throw; a caller handling only `ok: false` is incomplete"

patterns-established:
  - "Endpoint knowledge (query shape, ceiling, path encoding, field quirks) lives in the capability unit; transport, caching and status mapping stay in the client"

requirements-completed: [API-01, API-04, API-05]

duration: 20min
completed: 2026-08-02
---

# Phase 1 Plan 04: Search and Repository Units Summary

**The two functions Phases 2 and 3 will actually call now exist: `searchRepositories()` refuses a blank keyword and an out-of-range page before GitHub ever sees them, and `getRepository()` reads the watcher count from `subscribers_count` — the one field on the one endpoint that reports it honestly.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 of 2
- **Files created:** 4

## Task Commits

1. **Task 1: Search unit — query guard, encoding, pagination, and the 1000-result ceiling** — `fabb431` (feat)
2. **Task 2: Repository unit — path encoding and the subscribers_count correction** — `0dc068f` (feat)

---

# The caller-visible contract

Phases 2 and 3 are planned directly against this section. Everything a caller must handle is here.

## The exact exported signatures

```ts
// src/lib/github/search.ts
export const SEARCH_PER_PAGE = 20;
export const SEARCH_MAX_RESULTS = 1000;

export async function searchRepositories(
  query: string,
  page?: number            // defaults to 1
): Promise<Result<SearchResult>>;

// src/lib/github/repo.ts
export async function getRepository(
  owner: string,
  repo: string
): Promise<Result<RepoDetail>>;
```

`Result<T>` is `{ ok: true; data: T } | { ok: false; error: GitHubFailure }` from `@/lib/github/errors`. `SearchResult`, `RepoSummary` and `RepoDetail` are from `@/types/github`, unchanged by this plan.

## Each function returns a Result **and may throw**

This is the part that is easy to miss and expensive to miss.

```ts
// INCOMPLETE — this compiles, passes review, and drops a whole failure class.
const result = await searchRepositories(q, page);
if (!result.ok) { /* render the code */ }
```

Both units deliberately do **not** wrap `githubFetch` in `try`/`catch`. A `GitHubRequestError` — transport fault, 5s timeout, **any 5xx**, malformed JSON — propagates through untouched, because D-03 routes it to `error.tsx` and catching it here would convert an unexpected fault into a state the UI has no branch for.

So in a Server Component the throw is handled by the route's `error.tsx`, which is the intended design; a caller that instead awaits these functions inside its own `try` must decide deliberately what to do with the rejection rather than swallowing it. Four tests assert the propagation directly (`rejects.toBeInstanceOf(GitHubRequestError)`), two per unit — one for a 500, one for a transport fault after the client's single retry.

## Which returned codes each function can actually produce

| Function | Returned codes | Never returned |
|---|---|---|
| `searchRepositories` | `INVALID_QUERY` — blank/whitespace keyword, **or a page past the ceiling**, or GitHub's own 422<br>`RATE_LIMIT` — with `resetAt` (unix seconds) | `NOT_FOUND` (search has no 404), `NETWORK` (thrown, never returned) |
| `getRepository` | `NOT_FOUND` — a 404 **or a blank/whitespace owner or repo**<br>`RATE_LIMIT` — with `resetAt` (unix seconds) | `INVALID_QUERY`, `NETWORK` (thrown, never returned) |

An exhaustive `switch` in Phase 2 or 3 still has to cover the union, but these are the arms that can actually be reached from each function.

## Empty results are a success

`total_count: 0` with `items: []` returns `{ ok: true, data: { items: [], totalCount: 0, hasNextPage: false } }`. It is **not** a failure and can never be confused with `RATE_LIMIT`, which is `{ ok: false }`. Two tests hold this: one asserts `ok: true` on a zero-result payload, and one runs both responses through the same call site and asserts they are structurally distinguishable. A rate limit rendering as "no results" is the most misleading failure this app could produce, and this is the layer where the two would otherwise merge.

## ⚠️ `page > 50` returns `INVALID_QUERY` — and this collides with Phase 2's planned copy

**Phase 2 must make a deliberate decision here.**

Page 51 begins at result 1001, past GitHub's hard 1000-result cap, so the request could only ever come back 422. `searchRepositories` refuses it locally without spending quota (T-01-14) and returns `INVALID_QUERY` — the same code a blank keyword produces.

Phase 2 currently plans to render `INVALID_QUERY` as **"refine your keyword"**. For a page out of range that message is wrong and confusing: the keyword was fine, the page number was not.

This is an **edge case, not a live bug**. `hasNextPage` is computed against the clamped, reachable count, so the UI cannot generate a link to page 51 — it is only reachable by hand-editing the URL. But a reviewer hand-editing the URL is exactly the kind of thing that happens during an interview.

Phase 2's options, both defensible:
1. **Accept it** — one message for both, on the grounds that the hand-edited case is not worth a branch.
2. **Distinguish it** — clamp the page to `SEARCH_MAX_RESULTS / SEARCH_PER_PAGE` in the route before calling, or check the bound in the page component and render a "that page does not exist" state. Both exported constants are there for exactly this.

What must not happen is Phase 2 discovering this from a screenshot.

## Page normalisation

`0`, `-3`, `1.5`, `NaN` and anything else that is not a positive integer normalise to page **1**, and `data.page` reports the normalised value. The page arrives from a URL query parameter in Phase 2, so all of these are reachable by hand; turning a typo into an error screen would be the wrong trade. Only a genuine integer above the ceiling is refused.

## `hasNextPage` is already clamped — trust it over `totalCount`

`totalCount` is GitHub's **raw** `total_count` (D-14) and can be far above 1000. `hasNextPage` is computed against `Math.min(total_count, SEARCH_MAX_RESULTS)`, so on page 50 of a 48,283-match search it is `false`. Pagination built from `totalCount / perPage` would render links to pages that can only 422; pagination built from `hasNextPage` cannot.

## The two revalidate windows, and where caching actually lives

| Function | `revalidate` | Why |
|---|---|---|
| `searchRepositories` | **60s** | Results shift as repositories are created and starred |
| `getRepository` | **300s** | Detail changes slowly and is the page most likely to be reloaded during review |

**The cache opt-in itself is `githubFetch`'s, not the units'** (`cache: "force-cache"`, D-11a). The units pass only a window. So if Phase 2 or 3 ever wants a different staleness, it changes a number in one unit and **does not need to touch caching** — and cannot accidentally drop it. Both units carry a test asserting `cache: "force-cache"` is still on the outgoing init after passing through, so a future edit that adds a conflicting `cache` option fails a test rather than silently spending the rate limit.

## URL construction, as proven

- **Search:** `URLSearchParams` only. A keyword of `next&per_page=100` becomes the *value* of `q` — the parsed outgoing URL has exactly one `q` and `per_page` is still `20` (T-01-12).
- **Detail:** `encodeURIComponent` **per segment**. `getRepository("../../search", "repositories")` produces `pathname === "/repos/..%2F..%2Fsearch/repositories"` — still `/repos/`, still exactly two segments after it (T-01-13). Spaces, `#`, `?` and Japanese characters encode into the path with `url.search` and `url.hash` both empty.

Every URL assertion parses the outgoing URL with `URL`. None uses a substring match.

## Boundary

`search.ts` and `repo.ts` do not import each other, do not call `fetch`, and do not construct a base URL. Verified below.

---

## Deviations from Plan

### 1. [Judgement] `repo.ts` duplicates the summary mapping rather than sharing `toRepoSummary`

The plan anticipated this and set the rule: keep `toRepoSummary` unexported unless `repo.ts` genuinely needs it; if both need it, move it to `@/types/github` rather than import across the boundary.

**Chosen: duplicate.** Moving it would have modified `src/types/github.ts`, which is not in this plan's `files_modified` and is deliberately a types-only module — putting a function in it to save ten assignments trades a clean boundary for a small one. The duplication is also self-policing: `RepoDetail extends RepoSummary`, so a field added to `RepoSummary` fails to compile in **both** units at once. Drift is a build error, not a review catch.

Recorded because "the same ten lines in two files" is the kind of thing a reviewer flags, and the answer should not have to be reconstructed.

### 2. [Judgement] Two `<verification>` greps cannot pass as literally written — the same class 01-01 and 01-03 hit

Reported rather than worked around, and 01-05 inherits both.

- **`grep -rn "from \"./repo\"\|from \"./search\"" src/lib/github/` — "no matches."** It matches `repo.test.ts:4` and `search.test.ts:8`, where each test file imports **its own subject**. That is not a boundary violation; it is the test importing the thing it tests. Scoped to non-test files the check is clean:
  ```
  grep -rn 'from "./repo"\|from "./search"' --include='*.ts' src/lib/github/ | grep -v '\.test\.ts'
  → no matches
  ```
- **`grep -rn "watchers_count" src/` — "matches the type definition and its warning comment only; never a mapping."** It also matches `repo.ts:97`, which is the explanatory comment the plan's own `<action>` **required** to be placed at the mapping line, plus the test fixture and the test that asserts the field is absent from the domain object. The substantive check — that `watchers_count` is never read into a value — holds:
  ```
  grep -rn "watchers_count" src/ --include='*.ts' | grep -v '\.test\.ts' | grep -vE ':\s*(\*|//)'
  → src/types/github.ts:75:  watchers_count: number;   (the type field, nothing else)
  ```

Task 1's inline gate `! grep -q "repo\"" src/lib/github/search.ts` passes as written, but only by luck of phrasing — it would also fire on a comment containing the word. The three plans in a row that have hit this suggest the fix is a convention: scope boundary greps to non-test files and to non-comment lines.

### 3. [Judgement] No RED-only commit despite `tdd="true"`

Same as 01-01 and 01-03. Each test file was written first and run to observe it fail — `Failed to resolve import "./search"` and `Failed to resolve import "./repo"`, 1 file failed, no tests, in both cases — but AGENTS.md requires a green tree at every commit, so RED and GREEN landed together. The failing run is the evidence; the commit is not.

---

**Total deviations:** 3 — all documented judgements. No auto-fixes were needed, no scope creep, no new dependencies, no architectural change.

## TDD Gate Compliance

Both tasks carried `tdd="true"`. RED was observed for each (import resolution failure, zero tests collected) before any implementation was written, then GREEN was run and read. No `test(...)` commit exists separately — see Deviation 3.

## Requirements

Applying the rule this phase has used since 01-02 — **a requirement is marked Complete only when no remaining plan in the phase still claims it** — this plan closes three of the six it touches. Plan 01-05 still claims `SEC-03`, `TEST-01`, `API-02` and `OBS-01`.

| Requirement | Status | Why |
|---|---|---|
| API-01 | **Complete** | Both endpoints are now wrapped with explicit response types; no `unknown` GitHub JSON reaches a caller. No later plan claims it. |
| API-04 | **Complete** | Blank and whitespace-only queries return before any request. No later plan claims it. |
| API-05 | **Complete** | Both units route through the cache with their windows; 01-03 proved the cache by counting, and this plan is what made an app response cached. No later plan claims it. |
| API-02 | Pending | Still claimed by 01-05. The units return the mapping unmodified, but 01-05 owns the final sweep. |
| SEC-03 | Pending | Still claimed by 01-05. |
| TEST-01 | Pending | Still claimed by 01-05 — third instalment of three. |

## Threat Mitigations Applied

- **T-01-12** (query tampering) — `q` set through `URLSearchParams` only. A keyword of `next&per_page=100` yields exactly one `q` and `per_page=20`, asserted against the parsed URL.
- **T-01-13** (path tampering) — each segment through `encodeURIComponent` separately. `../../search` stays inside its segment; asserted on `pathname` and its segment count, not a substring.
- **T-01-14** (unbounded pagination) — pages past the derived ceiling are refused with `fetch` never called, asserted for both page 51 and page 99999.
- **T-01-15** (blank-query storm) — three blank forms return with `fetch` never called.
- **T-01-17** (cross-unit import) — neither unit imports the other; verified by grep on non-test files.
- **T-01-SC** (npm installs) — nothing installed. `git diff --stat package.json package-lock.json` is empty across both task commits.

## Known Stubs

None. Both exports are fully implemented and every `<behavior>` bullet in the plan has at least one named test.

## Threat Flags

None. No new network endpoint, auth path, file access pattern, or schema. The two outbound calls are the ones the threat register already covers.

## Verification

Run with Node 24.18.1 after `nvm use`, in this session, output read.

| Command | Result |
|---|---|
| `npm run lint` | clean, no output |
| `npm run typecheck` | clean, no output |
| `npm run test:coverage` | 6 files, **106 tests passed** (52 new: 28 search, 24 repo); statements 133/133, branches 73/73, functions 23/23, lines 133/133 — **100%**, thresholds met |
| `npm run build` | compiled successfully; route table unchanged (`○ /`, `○ /_not-found`) |

Per-task gates:

| Gate | Result |
|---|---|
| `npm test -- src/lib/github/search.test.ts` | 28 passed |
| `npm test -- src/lib/github/repo.test.ts` | 24 passed |
| `! grep -q 'repo"' src/lib/github/search.ts` | pass |
| `! grep -qE 'from "\./repo"' src/lib/github/search.ts` | pass |
| `grep -q "encodeURIComponent" src/lib/github/repo.ts` | pass |
| `! grep -qE 'from "\./search"' src/lib/github/repo.ts` | pass |

Plan `<verification>` block:

| Check | Result |
|---|---|
| cross-unit imports in `src/lib/github/` | test files only — see Deviation 2; **no matches** in non-test files |
| `grep -rn "fetch(" src/lib/github/search.ts src/lib/github/repo.ts` | **no matches** — only `client.ts` calls `fetch` |
| `grep -rn "watchers_count" src/` | type field + comments + test fixture — see Deviation 2; **never a mapping** |
| `git diff --stat package.json package-lock.json` | empty |

`npm run test:e2e` and `npm run test:a11y` were not run: this plan adds no route, component, or markup. They belong at the phase gate, per AGENTS.md.

A supporting measurement, run in this session rather than assumed, because the traversal assertion depends on it:

```
new URL("/repos/..%2F..%2Fsearch/repositories", "https://api.github.com").pathname
→ "/repos/..%2F..%2Fsearch/repositories"
```

The WHATWG parser removes dot-segments only when a segment is exactly `..` (or a percent-encoded spelling of it). `..%2F..%2Fsearch` is a single segment that merely begins with `..`, so it is preserved — which is precisely why per-segment encoding works.

## Self-Check: PASSED

- `src/lib/github/search.ts` — FOUND
- `src/lib/github/search.test.ts` — FOUND
- `src/lib/github/repo.ts` — FOUND
- `src/lib/github/repo.test.ts` — FOUND
- Commits `fabb431` and `0dc068f` — both present in `git log`
- Neither task commit deleted a tracked file (`git diff --diff-filter=D HEAD~1 HEAD` empty for both)

## User Setup Required

None.

## Next Phase Readiness

Plan 01-05 (docs and phase gate) can proceed. It owns:

- The `SEC-03`, `TEST-01`, `API-02` and `OBS-01` closures.
- **`docs/ARCHITECTURE.md` still shows `githubFetch(path, init)`** in two diagrams — carried forward from 01-03 Deviation 4.
- **The grep-scoping convention** — three plans have now hit greps that cannot distinguish a use from an assertion about that use. See Deviation 2.
- The README note the brief requires on the `subscribers_count` decision (AGENTS.md § GitHub API rules). The reasoning is at `src/lib/github/repo.ts` and on `GitHubRepoDetailPayload`; the README still needs it.

For Phase 2 specifically, in priority order:

1. **Handle the throw**, not only `ok: false`. Four tests assert the propagation; `error.tsx` is the destination.
2. **Decide what `INVALID_QUERY` means in the UI** now that it covers both a blank keyword and a page past the ceiling.
3. **Paginate from `hasNextPage`, not from `totalCount`** — the raw total exceeds what GitHub will serve.
4. **`SEARCH_PER_PAGE` and `SEARCH_MAX_RESULTS` are exported** so the route can clamp without re-deriving the numbers.

---
*Phase: 01-github-api-client*
*Completed: 2026-08-02*
