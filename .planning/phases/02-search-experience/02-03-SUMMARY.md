# Plan 02-03 Summary — SearchInput and Pagination

**Completed:** 2026-08-02
**Files:** `src/components/SearchInput.tsx`, `src/components/SearchInput.test.tsx`, `src/components/Pagination.tsx`, `src/components/Pagination.test.tsx`, `src/app/page.tsx`, `src/app/page.test.tsx`.

## What is now live

- **`SearchInput`** (`"use client"` — the one Client Component in Phase 2). A local `useDebounce(value, delay)` hook backed by `setTimeout`/`clearTimeout`. Debounce delay defaults to 300ms (D-17). On every debounced value change: `router.replace(target)` where `target = /` for a blank/whitespace input or `/?q=${encodeURIComponent(q)}&page=1` otherwise. A new keyword always resets page to 1. Initial mount does not trigger a replace (a `useRef` guard).
- **`Pagination`** (Server Component). Renders a `<nav aria-label="ページ移動">` with previous/next `<Link>` elements. Disabled edges render as `<span role="link" aria-disabled="true">` — the element stays in the DOM so tab order and reading order are stable across pages (D-19). Encodes `q` in both `href`s.
- **`page.tsx`** now composes both. The `<div data-slot="search-input" />` placeholder is gone; `<SearchInput initialQuery={q} />` sits in the label. In the happy branch, `<Pagination q={q} page={currentPage} hasNextPage={hasNextPage} />` renders after `<ResultList />`. Empty, rate-limit, and invalid-query branches render no pagination — a user in those states has no page-2 to visit.

## Decisions and deviations

- **Debounce approach: Option B (the local hook), not Option A (`useDeferredValue`).** Rationale documented in the source file: the delay must be a real number of milliseconds a test can drive with `vi.advanceTimersByTime`. `useDeferredValue`'s scheduler-driven timing is not controllable from a test, and a controllable delay is the point — SRCH-05's assertion is that a burst of keystrokes produces exactly one URL change.
- **Tests use `fireEvent.change` rather than `userEvent.type`.** `userEvent.type` with `vi.useFakeTimers()` deadlocks under RTL v16 (each `type` awaits real timers even with `delay: null`). Documented at the top of `SearchInput.test.tsx`. The behaviour under test is the debounce, not the keystroke path — `fireEvent.change` triggers the same React state update and the same effect chain.
- **Test mock of `useRouter` returns a stable singleton.** Documented in the mock. Rationale: the effect deps are `[debouncedQuery, router]` (React's `exhaustive-deps` rule requires `router` in the list); if the mock returned a new object per call, the effect would fire on every render and defeat the debounce, producing a false failure. Real Next.js keeps the router methods stable across renders. This is a test seam matching production behaviour, not a workaround.

## Contract satisfied

- **SRCH-04 (paging).** A user can visit page 2..50 through the pagination links; each link is a `<Link>` `href` that carries the keyword and the new page. The link is refresh-safe (Server Component, no client state).
- **SRCH-05 (no request per keystroke).** Asserted three ways in `SearchInput.test.tsx`:
  1. A three-character burst inside one debounce window → exactly one `router.replace`.
  2. A three-character burst across resetting timer windows → exactly one `router.replace` with the final value.
  3. `router.push` was never called across the whole suite.
- **D-15/D-16 (no debounce library).** `grep -rn "use-debounce\|lodash" src/` matches only explanatory comments. `git diff --stat package.json package-lock.json` is empty across the entire phase — zero new dependencies from any of the three plans.
- **D-19 (stable tab order at pagination edges).** The disabled span carries `role="link"` and `aria-disabled="true"`; a screen-reader user hears "link, disabled" for both endpoints of the pagination range, and the tab order does not shift between pages.

## Verification (this plan only)

- `npm test -- src/components/SearchInput.test.tsx src/components/Pagination.test.tsx src/app/page.test.tsx` — all pass (7 + 6 + 8 = 21).
- Full suite `npm test` — **145 passed** across 13 files (Phase 1's 113 + Phase 2's 32).
- `npm run lint` — clean; **no `eslint-disable` in `src/`**.
- `npm run typecheck` — clean.
- `head -1 src/components/SearchInput.tsx` — `"use client"`.
- `grep "\"use client\"" src/components/Pagination.tsx` — no match.
- `grep -rn "use-debounce\|lodash" src/` — matches only explanatory comments in `SearchInput.tsx`.
- `grep -rn "from \"@/lib/github" src/components/SearchInput.tsx` — no match.
- `git diff --stat package.json package-lock.json` — empty across the whole phase.

## Handoff to Phase 3

- **The URL contract:** keystroke → `router.replace("/?q=<encoded>&page=1")` (or `"/"` for empty); previous/next → `<Link href="/?q=<encoded>&page=N±1">`. Every result row → `<Link href="/repos/<encoded owner>/<encoded name>?from=<encoded current search url>">`.
- Phase 3's detail page parses `?from` to render a "戻る" link that restores the keyword and page. The value round-trips exactly — the search URL was itself constructed as `` `/?q=${encodeURIComponent(q)}&page=${currentPage}` `` in `page.tsx`, so decoding `from` yields a valid target.
