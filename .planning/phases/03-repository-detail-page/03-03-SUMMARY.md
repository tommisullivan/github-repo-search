# Plan 03-03 — Summary

**Completed:** 2026-08-02
**Requirements closed:** DTL-01, DTL-04, UX-05 (plus TEST-02 finished by adding the page-level half to plan 02's component half)

## What shipped

### `src/app/repos/[owner]/[repo]/page.tsx`

A Server Component (`async function`), Next 16's `params` and `searchParams` are awaited as `Promise<{...}>`. Calls `getRepository(owner, repo)` exactly once, with no `try`/`catch` — a thrown `GitHubRequestError` reaches the route-scoped `error.tsx` untouched, which is Phase 1's D-03 property that the page test asserts by `rejects.toBe(thrown)`.

The `switch` on `result.error.code` uses an `assertNever(x: never): never` helper in the default so a fifth `GitHubFailure` variant becomes a compile error, not a runtime one. `NOT_FOUND` and `INVALID_QUERY` both call `notFound()`; TypeScript infers those cases return `never` so the switch is exhaustive without falls-through and without any ESLint disables. (An initial `eslint-disable-next-line no-fallthrough` was added and immediately removed after this was checked — AGENTS.md forbids silencing rules.)

### `src/app/repos/[owner]/[repo]/loading.tsx`

Static Server Component with `role="status" aria-live="polite"` and "読み込み中…" copy. No logic.

### `src/app/repos/[owner]/[repo]/error.tsx`

`"use client"` (Next requires it for error boundaries). Renders a Japanese heading ("問題が発生しました"), a short explanatory paragraph, a reset button labelled "再試行", and — only if present — a small `エラーID: {digest}` line. Never renders `error.message` or `error.stack`.

### `src/app/repos/[owner]/[repo]/not-found.tsx`

Server Component. Heading "リポジトリが見つかりません" + short explanatory paragraph + link back to `/` with accessible name "検索に戻る".

### `src/app/repos/[owner]/[repo]/page.test.tsx` — 7 tests

Mocks `@/lib/github/repo` at the module boundary (docs/TESTING.md permits this at the component/route layer; the client's translation work is Phase 1's subject and its unit tests already cover it). Mocks `next/navigation`'s `notFound` to throw `NEXT_HTTP_ERROR_FALLBACK;404`, matching Next's real behaviour, so `await expect(RepoPage(...)).rejects.toThrow()` asserts the routing without pulling Next's server runtime into jsdom.

| # | Test | Covers |
|---|---|---|
| 1 | Renders `<RepoDetail>` with all 7 required fields on ok | DTL-02 (rendered), DTL-04 (page called with awaited async params), DTL-05 (back link default `/`) |
| 2 | Passes safe `?from` through to the back link | DTL-05 |
| 3 | Falls back to `/` when `?from` is an open-redirect attempt | SEC-02-adjacent — the back-target guard, integrated |
| 4 | Calls `notFound()` on `NOT_FOUND` | UX-05 |
| 5 | Calls `notFound()` on `INVALID_QUERY` (defence in depth) | UX-05 |
| 6 | Renders `<RateLimitPanel>` on `RATE_LIMIT` (and never routes via notFound) | The load-bearing D-01 assertion at the route layer |
| 7 | Does not catch a thrown `GitHubRequestError` — it propagates | D-03 |

## Verification — Definition of Done gate

All seven gate commands ran in this session on Node 24.18.1 and their output was read:

| Command | Result |
|---|---|
| `npm run lint` | Clean |
| `npm run typecheck` | Clean |
| `npm run test:coverage` | **150 passed / 150** (11 files), aggregate 96.44% lines, 95.78% branches, 87.5% functions |
| `npm run build` | Compiled 1511ms. Route table now shows `ƒ /repos/[owner]/[repo]` as a dynamic route — **DTL-01's proof** |
| `npm run test:e2e` | 1 passed (scaffold — real search→detail E2E is TEST-03, Phase 4) |
| `npm run test:a11y` | 1 passed (same scope caveat) |
| `npm audit --audit-level=high` | **0 vulnerabilities** |

Coverage of the new files:

| File | Lines | Branches | Functions |
|---|---|---|---|
| `src/lib/backTarget.ts` | 100% | 100% | 100% |
| `src/components/RepoDetail.tsx` | 100% | 75% | 100% |
| `src/components/RateLimitPanel.tsx` | 100% | 100% | 100% |
| `src/app/repos/[owner]/[repo]/page.tsx` | 83% | 83% | 50% |
| `src/app/repos/[owner]/[repo]/loading.tsx` | 0% | 100% | 0% |
| `src/app/repos/[owner]/[repo]/error.tsx` | 0% | 0% | 0% |
| `src/app/repos/[owner]/[repo]/not-found.tsx` | 0% | 100% | 0% |

Honest notes on the coverage:
- `RepoDetail.tsx`'s 75% branches: the one uncovered branch is `description === null`. The language-null branch has a dedicated test; adding a description-null test is a fair improvement for Phase 4 UX work.
- `page.tsx`'s 83% lines: the two uncovered are `assertNever`'s throw line and the switch's `default` arm — both unreachable by the exhaustive switch by design.
- `loading.tsx` / `error.tsx` / `not-found.tsx` at 0%: these are Next file-convention modules that only run inside Next's routing runtime, which jsdom does not simulate. They contain no logic — only static JSX — which is why the file-convention role was chosen for them.

## Phase 3 sweeps

| Sweep | Expected | Actual |
|---|---|---|
| `grep -rn "dangerouslySetInnerHTML" src/ e2e/` | Only test/comment lines that assert the ban | Only `src/eslint-rules.test.ts` (Phase 1's proof that the rule fires) |
| `grep -rn "window.location" src/` | Nothing | Nothing — all navigation via `next/link` |
| `grep -c '^ *hostname:' next.config.ts` | Exactly 1 (the allowlisted entry) | **1**. Note: the looser `grep -c "avatars.githubusercontent.com" next.config.ts` returns **2** because the file also carries a comment naming the rejected wildcard form; the plan's original criterion was over-strict, and the tighter grep above is the honest check. |
| Wildcards in `next.config.ts` | Nothing | Only in the documentation comment; the config value has no `**` or `*.` |
| `grep -rn "watchers_count" src/` | Only comments / trap declarations / Phase 1 fixtures | ✓. The 2 hits in `RepoDetail.tsx` and `page.tsx` are the load-bearing comments that document the trap for the next reader. |
| `grep -rn "@/lib/github/client" src/app/ src/components/` | Nothing (ESLint rule enforces) | 1 comment in `RepoDetail.tsx` explaining the ESLint rule; ESLint reports 0 violations |
| `git diff --stat develop..HEAD -- package.json package-lock.json` | Empty | Empty. **Zero new production dependencies across the phase.** |

## Decisions taken as-is vs modified

Two AI-side corrections during implementation, both worth recording:

1. **The metrics accessibility structure.** The 03-02 plan sketched a `<dl>` for the four metrics, but jsdom queries against `getByRole("list")` fail on a bare `<dl>` — ARIA does not give `<dl>` a default `list` role. The fix was to structure the component with `<section role="region" aria-labelledby="stats-heading">` and query by region + accessible name. Neither the test was weakened nor a fake `role` was added to a `<dl>` — the accessible structure was corrected.

2. **The `no-fallthrough` disable that never made it to disk.** I added `eslint-disable-next-line no-fallthrough` after each `notFound()` in the `switch`, then removed it after realising Next's `notFound()` has TypeScript signature `() => never` and the switch is already exhaustive without falls-through. AGENTS.md forbids silencing a rule to make an error go away — the correction happened before the commit.

## Caveats — recorded in the honest form Phase 0 and Phase 1 used

- **E2E and a11y still exercise only the scaffold home page.** The detail route has no live end-to-end coverage until TEST-03 (Phase 4) wires up the search→detail journey against a mocked GitHub API. This is honest: Phase 3's acceptance criteria did not include an E2E spec, TEST-02 is component-layer only, and adding an E2E spec here would preempt a Phase 4 plan that owns the shared Playwright fixture.
- **The parallel Phase 2 worktree.** Phase 2 owns Process 7 in the AI usage log. Both agents append to the same two log files on separate branches; a merge conflict on the log at PR time is expected and both entries stand. If Phase 2's PR merges first, this branch will need a rebase — normal.
- **CI has still never executed.** No GitHub remote is configured for this repository; every script the workflow invokes has been run locally and passes, but the workflow YAML itself is *defined and locally verified*, not *observed green in CI*. Same caveat Phase 0 and Phase 1 recorded.
- **DTL-03 (the README note on `subscribers_count`).** Not written here. It belongs to Phase 4's DOC-01 plan; splitting it now would put half a note in the Phase 3 commit and half in the Phase 4 commit. The reasoning already lives at `src/lib/github/repo.ts:97` and in `RepoDetail.tsx`'s header comment for now.

## Requirements closed by this plan

| ID | Requirement | Evidence |
|---|---|---|
| DTL-01 | Detail is a page with its own URL | Build output shows `ƒ /repos/[owner]/[repo]` |
| DTL-04 | Direct-URL or refreshed detail renders correctly | The page test calls `RepoPage` with awaited `Promise<params>` — the shape a bare URL produces — and asserts the RepoDetail render |
| UX-05 | Unknown owner/repo renders a not-found page | `not-found.tsx` + the page test asserting `notFound()` is called on `NOT_FOUND` and `INVALID_QUERY` |

## Requirements closed by the phase overall

| ID | Requirement | Plan(s) |
|---|---|---|
| DTL-01 | Detail is a dedicated route | 03-03 |
| DTL-02 | Seven required fields rendered | 03-02 |
| DTL-03 | Watchers uses `subscribers_count`, README note deferred | 03-02 (rendered) + repo.ts comment (Phase 1). README note is Phase 4 DOC-01. |
| DTL-04 | Direct URL / refresh works | 03-03 |
| DTL-05 | Back to results without losing search | 03-01 (guard) + 03-02 (render) + 03-03 (integration) |
| UX-05 | Unknown owner/repo renders not-found | 03-03 |
| TEST-02 | Component tests, happy + failure | 03-02 (component half) + 03-03 (page-level half) |
| SEC-02 | Single-host `images.remotePatterns` | 03-01 |
