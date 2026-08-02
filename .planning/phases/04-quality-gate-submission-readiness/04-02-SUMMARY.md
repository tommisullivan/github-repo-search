# Plan 04-02 — Summary

**Completed:** 2026-08-02
**Requirements closed:** UX-06, UX-07
**Deferred items closed:** the `RepoDetail` `description: null` branch test (STATE.md Phase 4 UX item)

One-liner: seven axe-checked render states, a keyboard-only search → detail → back journey, and measured no-overflow assertions at 375/1280 — with the two audit findings and one measured overflow fixed in components, never in specs.

## What shipped

### Task 1 — UX-06 audit and fixes (`c1a7bfd`)

The audit checklist, applied file by file against the shipped markup:

| # | Checklist item | Finding |
|---|---|---|
| 1 | Exactly one `h1`; headings descend without skips | **None.** Search: `h1` + state-panel `h2`s. Detail: `h1` (repo name) + sr-only `h2` (stats region). Not-found, rate-limit panel, both error boundaries: single `h1` each. No skipped levels anywhere. |
| 2 | Every interactive control has a Japanese accessible name | **None.** Search input `リポジトリを検索`, result links (fullName), pagination `前へ`/`次へ`, back link `戻る`, external link `GitHubで開く`, retry buttons `再試行`. |
| 3 | Focus visible on every control | **None.** The one `focus:outline-none` (SearchInput) carries a `focus:ring-2` replacement; every other control keeps the UA default outline — nothing suppresses it. |
| 4 | Tab order follows reading order; `aria-disabled` pagination controls remain focusable | **Finding, fixed.** The disabled `<span role="link" aria-disabled="true">` endpoints had no `tabindex` — in the DOM but *not* in the tab order, so the sequence shifted between page 1 and page 2, which is exactly the instability D-19 said it prevented. Fix: `tabIndex={0}` on both disabled spans (`Pagination.tsx`). Existing Pagination tests pass unmodified. |
| 5 | Results region and state panels reachable landmarks or headed sections | **Finding, fixed.** The happy-path results block was a bare `<div>` — neither landmark nor headed. Fix: `<section aria-label="検索結果">` (region landmark) in `page.tsx`. The state panels were already reachable: `role="status"`/`role="alert"` + `h2` each — verified, no change. |
| 6 | Avatar has meaningful Japanese alt | **None.** Phase 3's `${owner.login} のアバター` survived; asserted by unit test and the journey spec. |

**`description: null` branch test:** added to `RepoDetail.test.tsx` — asserts the description text is absent and that no empty `<p>` remains anywhere in the tree. The test passed on first run, as expected: the branch shipped in Phase 3 untested (a coverage gap, not a behavior gap), so this is a RED-passes-immediately coverage close, not a RED/GREEN feature cycle. `RepoDetail.tsx` branch coverage gap closed.

### Task 2 — per-state axe specs (`f5137a4`)

`e2e/search.a11y.spec.ts` (4 states), `e2e/repo-detail.a11y.spec.ts` (2 states), `e2e/home.a11y.spec.ts` (blank state, now awaiting its identifying heading before scanning). Seven states total, each named for the render it pins:

| State | URL | Awaited copy |
|---|---|---|
| Blank query | `/` | `キーワードを入力してください` |
| Results | `/?q=fixture-alpha` | link `e2e-fixture/repo-alpha` |
| Empty | `/?q=fixture-empty` | `該当するリポジトリが見つかりませんでした` |
| Rate limit | `/?q=fixture-ratelimit` | `アクセス制限中` |
| Invalid query | `/?q=fixture-alpha&page=99999` | `検索できるページを超えています` |
| Detail happy | `/repos/e2e-fixture/repo-alpha` | `h1` `repo-alpha` |
| Not found | `/repos/e2e-fixture/no-such-repo` | `h1` `リポジトリが見つかりません` |

Same tags as the pre-existing spec (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`), `violations` asserted equal to the empty array, no rule exclusions.

**Axe violations found: none.** All seven states passed with zero violations on the first run — after Task 1's fixes were already in the tree, so this run is the evidence that the audited-and-fixed markup is clean, not that the audit was unnecessary.

### Task 3 — keyboard journey and responsive assertions (`e7e6bac`)

**`e2e/keyboard.spec.ts`** — the journey with `page.keyboard` only. The observed tab-stop sequence:

1. Tab 1 from the document → search input (`searchbox` `リポジトリを検索`); typed `fixture-alpha`; URL updated to `?q=fixture-alpha&page=1` after the debounce (asserted via Playwright's retrying URL expectation, no timeout). Focus survived the `router.replace` refresh — the client component's DOM node is preserved.
2. Tab 2 → first result link `e2e-fixture/repo-alpha` — **no intermediate stops** between the input and the results. Enter → `/repos/e2e-fixture/repo-alpha?from=…`.
3. On the detail page, Tab 1 → `戻る` link (first control in reading order). Enter → back to `?q=fixture-alpha&page=1` with keyword and page intact.

Every stop asserted with `toBeFocused` on a role + accessible-name locator.

**`e2e/responsive.spec.ts`** — at 375×667 and 1280×800, on both views: `document.documentElement.scrollWidth <= clientWidth`, plus bounding-box containment for the key controls (search input + result link; back link + stats region).

**Overflow finding, measured and fixed:** the fixture `repo-alpha` description carried no long unbroken token, so the first 375px pass was exercising nothing. Extended the description with a long unbroken URL token (additive change to the 04-01-owned `fixtures.ts`, sanctioned by the plan) — the detail page then measured **639px scrollWidth against a 375px viewport**. Fix: `break-words` on the description paragraph in `RepoDetail.tsx`. Re-measured: 375/375. No other overflow at either viewport on either view.

## Deviations from plan

**1. [Rule 3 – Blocking] Next's persistent fetch cache served stale fixture JSON, masking the fixture edit.**
- **Found during:** Task 3 — the responsive spec passed before the long-token fixture was in the served HTML.
- **Issue:** Next's data cache (`.next/cache/fetch-cache`) survives server restarts and serves cached GitHub-mock responses with stale-while-revalidate semantics, so a rebuilt server still rendered the old description. This falsifies 04-01's note that additional caching of fixture responses is "harmless in E2E": it is harmless for stable sentinels but silently masks fixture *changes*.
- **Fix:** the local (non-`PLAYWRIGHT_PREBUILT`) webServer command in `playwright.config.ts` now runs `rm -rf .next/cache/fetch-cache` between build and start. CI path untouched — its fresh build artifact contains no fetch-cache entries (both routes are dynamic).
- **Files modified:** `playwright.config.ts` (outside this plan's `files_modified`; 04-01-owned, no overlap with 04-03).
- **Commit:** `e7e6bac`.

**2. Sanctioned additive fixture extension.** `src/lib/e2e/fixtures.ts` `repo-alpha` description gained the long unbroken URL token (the plan's own instruction when the shipped description is "too tame"). Recorded here per the coordination rule. Commit: `e7e6bac`.

**3. Parallel-tree observation (no action).** One intermediate `test:e2e` run failed on `e2e/security-headers.spec.ts` — plan 04-03's spec, mid-iteration in the shared working tree (the `next/image` `style-src-attr` CSP violation, D4-06's known ladder step). Not this plan's file; not touched. 04-03's subsequent commit resolved it, and the final verification run has all 17 E2E tests green.

## Verification

Ran in this session on Node 24.18.1, on the final tree (all after the last code change):

- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm test` — 200 passed / 200 (20 files; includes the new `description: null` test and 04-03's parallel csp tests).
- `npm run test:e2e` — 17 passed / 17 (keyboard journey, 4 responsive tests, 04-01's five journey tests, smoke, 04-03's six header/CSP tests).
- `npm run test:a11y` — 7 passed / 7, zero violations in every state.

One harness hiccup during verification: a leftover `next start` chain from a prior Playwright run collided with the a11y run's build (`Another next build process is already running`). Killed the orphaned processes and re-ran; not a code issue.

## Known stubs

None.

## Threat flags

None — this plan adds specs and class/attribute-level component fixes; no new network endpoints, auth paths, file access, or schema changes.

## Commits

| Hash | Subject |
|---|---|
| `c1a7bfd` | Fix the UX-06 audit findings and close the description:null branch test |
| `f5137a4` | Add per-state axe specs across search and detail views |
| `e7e6bac` | Add keyboard-only journey and responsive overflow specs |

## Self-Check: PASSED

All five artifact files exist with their required content markers and minimum lengths (`fixture-ratelimit`, `repo-alpha`, `page.keyboard`, `scrollWidth`, `description: null`); all three commits present in the branch history.
