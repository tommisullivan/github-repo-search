---
phase: 04-quality-gate-submission-readiness
reviewed: 2026-08-02T16:20:00Z
depth: deep
files_reviewed: 56
files_reviewed_list:
  - e2e/home.a11y.spec.ts
  - e2e/keyboard.spec.ts
  - e2e/repo-detail.a11y.spec.ts
  - e2e/responsive.spec.ts
  - e2e/search-detail.spec.ts
  - e2e/search.a11y.spec.ts
  - e2e/security-headers.spec.ts
  - e2e/smoke.spec.ts
  - src/app/error.test.tsx
  - src/app/error.tsx
  - src/app/globals.css
  - src/app/layout.tsx
  - src/app/loading.test.tsx
  - src/app/loading.tsx
  - src/app/page.test.tsx
  - src/app/page.tsx
  - src/app/repos/[owner]/[repo]/error.tsx
  - src/app/repos/[owner]/[repo]/loading.tsx
  - src/app/repos/[owner]/[repo]/not-found.tsx
  - src/app/repos/[owner]/[repo]/page.test.tsx
  - src/app/repos/[owner]/[repo]/page.tsx
  - src/components/EmptyState.tsx
  - src/components/InvalidQueryNotice.tsx
  - src/components/Pagination.test.tsx
  - src/components/Pagination.tsx
  - src/components/RateLimitPanel.test.tsx
  - src/components/RateLimitPanel.tsx
  - src/components/RepoDetail.test.tsx
  - src/components/RepoDetail.tsx
  - src/components/RepoRateLimitPanel.test.tsx
  - src/components/RepoRateLimitPanel.tsx
  - src/components/ResultList.test.tsx
  - src/components/ResultList.tsx
  - src/components/SearchInput.test.tsx
  - src/components/SearchInput.tsx
  - src/eslint-rules.test.ts
  - src/instrumentation.ts
  - src/lib/backTarget.test.ts
  - src/lib/backTarget.ts
  - src/lib/csp.test.ts
  - src/lib/csp.ts
  - src/lib/e2e/fixtures.ts
  - src/lib/e2e/githubApiMock.ts
  - src/lib/github/client.test.ts
  - src/lib/github/client.ts
  - src/lib/github/errors.test.ts
  - src/lib/github/errors.ts
  - src/lib/github/log.test.ts
  - src/lib/github/log.ts
  - src/lib/github/repo.test.ts
  - src/lib/github/repo.ts
  - src/lib/github/search.test.ts
  - src/lib/github/search.ts
  - src/proxy.test.ts
  - src/proxy.ts
  - src/types/github.ts
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 4: Code Review Report — Pre-Submission Deep Audit

**Reviewed:** 2026-08-02T16:20:00Z
**Depth:** deep (full call-chain and cross-file analysis, all 4 phases)
**Files Reviewed:** 56 (all git-tracked files under `src/` and `e2e/`; `src/app/favicon.ico` excluded as binary; `next.config.ts`, `eslint.config.mjs`, `playwright.config.ts`, `vitest.config.mts`, `vitest.setup.ts` read as supporting configuration)
**Status:** issues_found — 0 Critical, 4 Warning, 6 Info

## Summary

The codebase is in strong shape for submission. The Phase 1 GitHub boundary is the best part of the repo: the error vocabulary is exhaustively mapped and tested (200 unit tests, all passing this session), the retry policy matches the documented rules exactly (single retry on `TypeError` only; no HTTP response, timeout, or rate limit is ever retried — verified at `src/lib/github/client.ts:155-221` against `docs/OPERATIONS.md`), the log line is a closed type that cannot carry a secret, and the token-redaction guarantees are asserted by tests that actually grep captured stdout for the token value. The origin guard (`SITE_RELATIVE_PATH`) and its inbound mirror in `backTarget.ts` were probed with `/\`, `//host`, `%2F%5C`, encoded-backslash, protocol-relative, and `javascript:` forms — **no bypass found**; the raw-string check plus the two-character regex holds because percent-encoded sequences stay literal in path-absolute references and dot-segment normalisation cannot re-introduce an authority.

Cross-file analysis found **zero boundary violations**: nothing outside `src/lib/github/` imports `client.ts` (grep-verified; also lint-enforced with negative controls in `src/eslint-rules.test.ts`), `search.ts` and `repo.ts` do not import each other, and the fixtures are compiler-checked against the payload types so type drift between `GitHubRepoDetailPayload` and `src/lib/e2e/fixtures.ts` is structurally impossible. The E2E mock cannot self-activate: the gate is `NEXT_RUNTIME === "nodejs" && E2E_GITHUB_MOCK === "1"`, only `playwright.config.ts` sets the flag, unmatched requests get a sentinel 500 (never a live pass-through), and activation logs loudly.

Verification run this session: `npm run lint` clean, `npm run typecheck` clean, `npm test` 200/200 passing (Node 24.18.1). Production build + `next start` measurement performed for the status-code finding below.

The four Warnings are real but none blocks submission: one is the confirmed known item (200-vs-404 doc divergence), one is a reachable back-button UI desync, one is misleading Japanese copy on a reachable GitHub 422, one is the English default global 404 in a Japanese-UI app.

## Warnings

### WR-01: Unknown-repo detail URL returns HTTP 200, but code comments and docs claim "a real 404 status" — CONFIRMED (known item)

**File:** `src/app/repos/[owner]/[repo]/page.tsx:15`, `src/app/repos/[owner]/[repo]/not-found.tsx:6`, `src/app/repos/[owner]/[repo]/loading.tsx` (the cause); stale claims also in `.planning/STATE.md:113`, `docs/AI-USAGE.en.md:255`, `docs/AI-USAGE.ja.md:255`, `.planning/phases/03-repository-detail-page/03-CONTEXT.md:43`
**Issue:** Measured this session against the production build (`next build` + `next start` with the E2E mock):

```
/repos/e2e-fixture/no-such-repo  -> HTTP 200   (body streams リポジトリが見つかりません)
/no-such-top-level-route         -> HTTP 404   (static global 404)
```

The colocated `loading.tsx` wraps the page in a Suspense boundary, so Next flushes the 200 shell before `getRepository()` resolves and `notFound()` fires; the not-found UI arrives in-stream after the status line is already sent. The user-visible behaviour is correct (the designed Japanese not-found page renders, e2e asserts it), but the HTTP status is wrong for crawlers/SEO and — more importantly for this submission — **the code comments and the AI-usage log assert the opposite of measured behaviour**. A reviewer who curls the URL and then reads `page.tsx:15` ("gives a real 404 status") catches the repo making a false claim, which is worse than the status itself. Phase 3's STATE.md claim is stale.
**Fix:** Two defensible options; pick one and make the record truthful either way:
1. *Correct behaviour:* delete `src/app/repos/[owner]/[repo]/loading.tsx`. Without the Suspense boundary the page render blocks the response, `notFound()` sets a real 404 before headers flush. Cost: no loading state on the detail route for up to the 5s fetch deadline (cold, uncached). The search route keeps its `loading.tsx` — its status is always 200 anyway.
2. *Correct the record (cheaper, no UX cost):* keep streaming, and fix the comments in `page.tsx:15` and `not-found.tsx:6` to say "renders the not-found UI in-stream; the HTTP status is 200 because the loading boundary flushes the shell first — accepted for a streamed dynamic route", plus reconcile STATE.md and both AI-USAGE files. Optionally pin the measured behaviour with an e2e status assertion so the claim can never drift again.

### WR-02: Search input desynchronises from the URL on browser back/forward navigation

**File:** `src/components/SearchInput.tsx:71-92`
**Issue:** `useState(initialQuery)` captures the prop once; the component instance survives same-route client navigations (the keyboard e2e spec relies on exactly this DOM preservation). Reproduction using only ordinary interactions:
1. Type `react` → URL replaced to `/?q=react&page=1` (history entry A).
2. Click 次へ → `Link` pushes `/?q=react&page=2` (entry B).
3. Type `vue` → entry B replaced with `/?q=vue&page=1`.
4. Press **Back** → URL is `/?q=react&page=1`, the server re-renders react results — but the input still displays `vue`.

Nothing reconciles: `debouncedQuery` hasn't changed so the effect doesn't re-fire, and the new `initialQuery` prop is ignored by `useState`. The app now shows results for a keyword that contradicts the visible input, on the exact interaction (`the back button behaves`) that `docs/ARCHITECTURE.md` names as the payoff of URL-as-state. No test covers history navigation on the search route.
**Fix:** Adopt an external URL change without clobbering in-flight typing — track what this component last navigated to, and reset state only when `initialQuery` changes to something it did not itself produce:

```tsx
const lastNavigated = useRef(initialQuery.trim());
// inside the debounce effect, after router.replace(target):
lastNavigated.current = trimmed;
// render-time reconciliation (React's recommended derived-state pattern):
const [prevInitial, setPrevInitial] = useState(initialQuery);
if (initialQuery !== prevInitial) {
  setPrevInitial(initialQuery);
  if (initialQuery.trim() !== lastNavigated.current) {
    setQuery(initialQuery); // external navigation (back/forward): adopt the URL
    lastNavigated.current = initialQuery.trim();
  }
}
```

Add a test: render with `initialQuery="react"`, change input to `vue`, re-render with `initialQuery="react"` (simulating Back), assert the input shows `react`.

### WR-03: A real GitHub 422 renders "キーワードを入力してください" to a user who did enter a keyword

**File:** `src/app/page.tsx:102-106`; copy at `src/components/InvalidQueryNotice.tsx:23-31`
**Issue:** The comment claims this branch is "defensive against a future client-side return we cannot predict", but it is reachable today with a non-blank keyword: GitHub's search API returns 422 for documented cases the local guards do not cover — queries longer than 256 characters, and queries with more than five `AND`/`OR`/`NOT` operators. Paste a 300-character string into the search box and the page tells you "キーワードを入力してください / 上の入力欄にキーワードを入力してください" — an instruction to enter a keyword, addressed to someone looking at their keyword. This violates the AGENTS.md rule that error messages must be *actionable* Japanese: the actionable advice here is "shorten/simplify the query", not "enter one".
**Fix:** Add a third `reason` to `InvalidQueryNotice` (e.g. `"unsupported"`) with copy like 「この検索キーワードは処理できませんでした / キーワードを短くするか、条件を減らして再度お試しください。」 and route the client-returned `INVALID_QUERY` branch (`page.tsx:102`) to it, keeping `"blank"` for the pre-request guard. One component test per reason keeps the copies from drifting. (Alternatively, guard length > 256 locally before the request — same pattern as the page-ceiling guard, saves the quota too — but the 422 branch still needs honest copy for the operator-count case.)

### WR-04: The global 404 is Next's default English page in an app whose rule is "all user-facing strings are Japanese"

**File:** `src/app/` (missing `not-found.tsx` at the root); observed at `/no-such-top-level-route` → "404 | This page could not be found."; acknowledged in passing at `e2e/security-headers.spec.ts:185-188`
**Issue:** AGENTS.md is absolute: user-facing strings — including page titles and error states — are Japanese. A Japanese reviewer who typos any top-level path gets Next's default English 404. The e2e comment frames unknown top-level routes as "not a designed destination", but a 404 page is user-facing whether designed or not, and the fix is one small file. Note this is distinct from the accepted D4-08 CSP disposition (static `/_not-found` bootstrap blocked — not re-reported here): a custom root `not-found.tsx` would be equally static and its *content* renders fine under the CSP exactly as the current default's does, so adding one does not disturb that disposition — it only changes whose words render.
**Fix:** Add `src/app/not-found.tsx` mirroring the detail route's not-found (「ページが見つかりません」 + explanation + `next/link` back to `/`), and extend `e2e/security-headers.spec.ts:188-189` to assert the Japanese copy instead of the English default. Update the D4-08 measurement annotation text if its wording references Next's default page.

## Info

### IN-01: The page bound "1〜50" and "1000件" are hardcoded in user-facing copy while the code derives them

**File:** `src/components/InvalidQueryNotice.tsx:38`
**Issue:** `search.ts:44-48` and `page.tsx:29-34` go out of their way never to write `50` as a literal ("Derived, never written as a literal `50`") — but the Japanese copy writes both `1000件` and `1〜50` literally. Changing `SEARCH_PER_PAGE` would silently make the UI copy lie.
**Fix:** Interpolate: import `SEARCH_MAX_RESULTS` and derive the max page (see IN-02), then render `` `GitHub検索APIは最大${SEARCH_MAX_RESULTS}件までしか結果を返しません。ページ番号を1〜${maxPage}の範囲で指定してください。` ``.

### IN-02: `SEARCH_MAX_PAGE` is derived independently in two files

**File:** `src/lib/github/search.ts:48` (private), `src/app/page.tsx:34`
**Issue:** The same formula `Math.floor(SEARCH_MAX_RESULTS / SEARCH_PER_PAGE)` appears twice because the unit keeps its constant private. Today they agree; a future edit to one formula (e.g. a `-1` off-by-one "fix") would desynchronise the page guard from the unit guard — the page would show the out-of-range notice for a page the unit would happily serve, or vice versa.
**Fix:** Export `SEARCH_MAX_PAGE` from `search.ts` and import it in `page.tsx`, deleting the local derivation.

### IN-03: `headerInt` is duplicated verbatim in the two shared-core modules

**File:** `src/lib/github/client.ts:118-126`, `src/lib/github/errors.ts:75-83`
**Issue:** Identical private helper in two files of the same shared core. The unit-boundary rationale for duplicating the mappers (search vs repo) does not apply here — `client.ts` already imports `errors.ts`, so a single exported helper in `errors.ts` breaks no boundary rule.
**Fix:** Export `headerInt` from `errors.ts` (or a tiny `headers.ts` in the core) and import it in `client.ts`. Low priority; the duplication is small and both copies are tested through their callers.

### IN-04: Small dead-surface items in exports and types

**File:** `src/lib/e2e/fixtures.ts:28`; `src/types/github.ts:23,49`
**Issue:** Three trivia, none harmful: (1) `FIXTURE_OWNER` is exported but consumed only inside `fixtures.ts` — no spec imports it (specs hardcode `e2e-fixture`, which is arguably better for sentinel honesty). (2) `GitHubOwnerPayload` is exported but referenced only within `types/github.ts`. (3) `incomplete_results: boolean` is modelled but never read anywhere, while the module header states "Only the fields this app actually reads are modelled (API-01)" — a small self-contradiction.
**Fix:** Drop the two unnecessary `export` keywords, and either delete `incomplete_results` or annotate it as deliberately modelled-for-shape. Cosmetic; safe to leave for a post-submission pass.

### IN-05: The E2E mock ships in the production server bundle and is gated by an environment variable alone — accepted design, residual risk recorded

**File:** `src/instrumentation.ts:19-27`, `src/lib/e2e/githubApiMock.ts:148-184`
**Issue:** Traced the gating as tasked: the mock **cannot self-activate** — `E2E_GITHUB_MOCK=1` is set only by the Playwright `webServer` (`playwright.config.ts`), and `dev`/`build`/`start` never set it. But because the E2E strategy deliberately runs Playwright against the *production* build, the mock and fixtures are necessarily compiled into the production **server** bundle (server-side only — the dynamic import is inside `register()`, so nothing reaches the client bundle), and any operator who sets `E2E_GITHUB_MOCK=1` on a real deployment serves fixture data. Mitigations already present: double gate, loud `console.info` sentinel on install, sentinel-500 on unmatched routes. This is the right trade for the mocking strategy; the residual risk is operational, not a code defect.
**Fix:** None required. Optionally add one line to `docs/OPERATIONS.md`'s deployment notes: "never set `E2E_GITHUB_MOCK` in a real environment; if the server log shows `[e2e-github-mock] installed`, the deployment is misconfigured."

### IN-06: A page past the end of a small result set (but under the ceiling) renders the empty state's "try another keyword" copy

**File:** `src/app/page.tsx:126-128`, `src/components/EmptyState.tsx:21-26`
**Issue:** `?q=react&page=30` for a 25-result set passes both guards (30 ≤ 50), GitHub returns 200 with zero items, and the UI says 「該当するリポジトリが見つかりませんでした / 別のキーワードを試してください」 — but the keyword *does* match; the page number is what's wrong. Only reachable by hand-editing the URL (pagination never links there), so this is a nit, not a bug.
**Fix:** Acceptable as-is. If polishing: when `items.length === 0 && totalCount > 0`, render a distinct 「このページには結果がありません」 with a link back to page 1.

## Verified Dispositions (checked, holding — no action)

- **Never-retry-rate-limit rule:** `requestWithSingleTransportRetry` retries only `cause instanceof TypeError`, at most once; every HTTP response (403/429/404/422/5xx) and every timeout takes the no-retry path. Matches OPERATIONS.md's table exactly; pinned by named tests (`client.test.ts:303-407`).
- **Timeout on every request:** `AbortSignal.timeout(5000)` created per attempt inside the loop (fresh signal on retry — no reused-aborted-signal bug). Asserted at `client.test.ts:193-199`.
- **Log redaction:** `GitHubCallLog` is a closed type; tests grep captured stdout for the token and the string "authorization" on success and failure paths. The unmatched-mock log prints pathname only, keeping query values out of stdout.
- **Origin/backslash guards:** probed `//host`, `/\host`, `\host`, `%2F%5C`, `/%5C…`, `/.//host`, `javascript:`, bare `?`/`#` — all rejected or origin-pinned. The raw-string (never decoded) check in `backTarget.ts` is correct because browsers do not decode percent-sequences before authority resolution, and dot-segment normalisation happens after the authority is fixed.
- **`watchers` = `subscribers_count`:** the trap is closed at three layers — type (`RepoDetail` has no `watchersCount`), unit test (`repo.test.ts:188-231` asserts the exact key set), and E2E (fixture sets `watchers_count` equal to stars, spec asserts the distinct 678). README documents it bilingually.
- **`style-src` `'unsafe-hashes'` + sha256:** measured concession, styles only, exact policy pinned by `csp.test.ts:44-58`; `script-src` never carries `unsafe-inline` (asserted in unit, proxy, and e2e layers). Static `/_not-found` CSP bootstrap block remains accepted per D4-08 (re-measured 404 status for it this session).
- **Two rate-limit panels:** deliberate divergence (relative minutes on search where retry-in-place is useful; absolute Tokyo time + leave-and-return on detail), each with its own anti-collapse test (never renders the other state's copy). Drift risk is accepted and mitigated by per-component tests.
- **Boundary rules:** grep + lint + `eslint-rules.test.ts` (with negative controls) all agree — no import of `client.ts` outside the boundary, no cross-unit imports, `errors.ts` deliberately importable by the presentation layer.
- **No test touches the live API:** unit/component tests stub `fetch` or mock `@/lib/github/*`; E2E routes through the server-side interceptor with a sentinel 500 on unmatched paths. No real-network path exists in any test layer.

## Verification Evidence (this session, Node 24.18.1)

- `npm run lint` — clean, exit 0
- `npm run typecheck` — clean, exit 0
- `npm test` — 19 files, 200 tests, all passed
- `npm run build` + `E2E_GITHUB_MOCK=1 next start` — measured: detail not-found → **200** (WR-01), global 404 → **404**, known repo → 200, search → 200

---

_Reviewed: 2026-08-02T16:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
