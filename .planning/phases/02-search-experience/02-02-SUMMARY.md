# Plan 02-02 Summary — Search page and its render states

**Completed:** 2026-08-02
**Files:** `src/app/page.tsx`, `src/app/page.test.tsx`, `src/components/{EmptyState,InvalidQueryNotice,RateLimitPanel,ResultList}.tsx`, plus tests for `RateLimitPanel` and `ResultList`.

## Contract

`src/app/page.tsx` is an async **Server Component** whose props are `{ searchParams: Promise<Record<string, string | string[] | undefined>> }` — the Next 16 App Router shape. It handles five renderable states:

| Input | Render | Renderer |
| --- | --- | --- |
| `q` blank/whitespace | Japanese "please enter a keyword" notice, **no request** | `<InvalidQueryNotice reason="blank" />` |
| `q` valid, `page > 50` | Japanese "beyond searchable range" notice, **no request** | `<InvalidQueryNotice reason="out-of-range" />` |
| `q` valid, empty result set | Japanese empty state (role="status") | `<EmptyState />` |
| `q` valid, `RATE_LIMIT` | Japanese alert panel with retry-in-N-minutes | `<RateLimitPanel resetAt now />` |
| `q` valid, results | List of rows with name/owner/language/stars, each linking to `/repos/{owner}/{repo}?from=<encoded current url>` | `<ResultList items currentSearchUrl />` |

`GitHubRequestError` from `searchRepositories` propagates to `app/error.tsx` — the page has no `try`/`catch`. `SEARCH_MAX_PAGE = Math.floor(SEARCH_MAX_RESULTS / SEARCH_PER_PAGE)` is derived from the client exports; no literal `50`.

## What this closes

- **The Phase 1 STATE.md carry-forward on distinguishing INVALID_QUERY causes.** `searchRepositories` returns `INVALID_QUERY` for both a blank keyword and a page past the ceiling. The page decides which case it is **before** calling the client, and picks distinct copy accordingly. A reviewer probing `?page=99999` sees "検索できるページを超えています", not "please enter a keyword". D-08/D-09 from the phase context, now demonstrable in test 6.
- **SRCH-01, SRCH-02, SRCH-03** at the server-rendered layer. Test 1 asserts rows render for a keyword; test 2 asserts the four fields; the URL-driven behaviour is inherent in the Server Component's `searchParams` read.
- **UX-02** (empty state — its own Japanese copy, `role="status"`) and **UX-04** (rate limit — its own Japanese copy, `role="alert"`, computed reset time) are asserted mutually exclusively — the rate-limit test asserts no empty-state copy is present, and vice versa.
- **I18N-01** for the server-rendered surface. Every fixed string on the page is Japanese; identifiers, comments, tests are English.

## Deviations from plan

- **`RateLimitPanel`'s `now` prop is now required, not optional.** Rationale in the source: React 19's `react-hooks/purity` lint rule fails on `Date.now()` inside a component render. The prop stays a test seam and a design signal ("the component is pure; the page samples the clock"). The page passes `Math.floor(Date.now() / 1000)` at request time. This is a minor API tightening from the plan, not a behavioural change.
- **`EmptyState` and `<loading.tsx>`'s `role="status"` elements gained explicit `aria-label`s.** jsdom does not derive the accessible name from text content for `role="status"` reliably; the label makes the accessibility property explicit rather than implicit. The visible text is unchanged. Same rationale as plan 02-01.

## Verification (this plan only)

- `npm test -- src/app/page.test.tsx src/components/` — 8 page tests + 3 rate-limit tests + 5 result-list tests, all pass.
- `npm run lint` — clean.
- `npm run typecheck` — clean.
- Full suite `npm test` — **132 passed** across 11 files (Phase 1's 113 + Phase 2's 19 so far).
- `grep "\"use client\"" src/app/page.tsx src/components/*.tsx` — no runtime match (comment-only). Everything except `error.tsx` is a Server Component.
- `grep "try {" src/app/page.tsx` — no match. The page does not swallow throws.
- `grep "from \"@/lib/github" src/components/` — no match. Components do not import the client at runtime.
- `grep -Pn "(?<!\d)50(?!\d)" src/app/page.tsx` — matches only the explanatory comment; `SEARCH_MAX_PAGE` is derived.
- `git diff --stat package.json package-lock.json` — empty.

## Handoff to plan 02-03

- The `<div data-slot="search-input" />` placeholder is where `<SearchInput initialQuery={q} />` will land.
- After a happy-path result, `<Pagination q={q} page={result.data.page} hasNextPage={result.data.hasNextPage} />` slots in under the `<ResultList />`.
- The `currentSearchUrl` string used by result links is exactly `` `/?q=${encodeURIComponent(q)}&page=${currentPage}` `` — the same shape Pagination will build for previous/next `href`s and the same shape Phase 3 will decode from `?from=`.
