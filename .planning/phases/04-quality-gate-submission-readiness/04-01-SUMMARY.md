# Plan 04-01 — Summary

**Completed:** 2026-08-02
**Requirements closed:** TEST-03
**Requirements advanced:** UX-06/UX-07 (the mock infrastructure plans 04-02/04-03 drive), SEC-01 (04-03 verifies CSP under these mocked page loads)

## What shipped

### `src/lib/e2e/fixtures.ts`

Raw GitHub REST JSON payloads (snake_case), typed against the sealed `@/types/github` payload types so a drift fails compilation. Implements the D4-02a scenario table verbatim:

| Scenario | Fixture |
|---|---|
| `q` contains `fixture-alpha`, page 1 | `SEARCH_PAGE_1` — `total_count: 25`, 20 items, first `e2e-fixture/repo-alpha` (TypeScript, 12,345 stars) |
| same, page 2 | `SEARCH_PAGE_2` — the remaining 5 items |
| `q` contains `fixture-empty` | `SEARCH_EMPTY` — `total_count: 0` |
| `GET /repos/e2e-fixture/repo-alpha` | `REPO_ALPHA_DETAIL` — `subscribers_count: 678`, `watchers_count: 12345` **deliberately equal to stars** (GitHub's real duplication), Japanese description, avatar on the allowlisted host |

`RATE_LIMIT_RESET = 4102444800` (2100-01-01) so the rate-limit panel's copy renders deterministically. Every value is a sentinel that cannot exist on real GitHub (D4-02).

### `src/lib/e2e/githubApiMock.ts`

`installGitHubApiMock()`: captures `globalThis.fetch`, replaces it with a router —

- `api.github.com` → the fixture table. `q` matched with `includes` (the client's `q` *contains* the keyword). `q` containing `fixture-ratelimit` → 403 with `x-ratelimit-remaining: 0` and the fixed far-future reset. Unknown repo → 404. **Anything unmatched → 500 with body `E2E_MOCK_UNMATCHED`, never a pass-through** (T-04-03). Success responses carry plausible `x-ratelimit-*` headers, which the client's structured logs pick up.
- `avatars.githubusercontent.com` → a hardcoded 1×1 valid PNG (D4-04, see Measurements).
- Every other host → the captured previous fetch, unchanged.

Header comment records the rejected alternatives in one line each (page.route — browser-side only; env base URL — T-01-26; MSW — dependency for a small wrapper). Installation logs one loud line so accidental activation is instantly visible (T-04-01). Double-install guarded. Zero new dependencies (T-04-SC: `package.json`/`package-lock.json` untouched).

### `src/instrumentation.ts`

Next 16 `register()` hook (semantics confirmed against `node_modules/next/dist/docs/.../instrumentation.md`). Double-gated: `NEXT_RUNTIME === "nodejs"` **and** `E2E_GITHUB_MOCK === "1"`, dynamic import so the mock is not even loaded otherwise. Outside E2E it is a no-op — verified by measurement, not assumed (see below).

### `playwright.config.ts`

`webServer` gains `env: { ...inheritedEnv, E2E_GITHUB_MOCK: "1" }`. Providing `env` replaces Playwright's default full inheritance of `process.env`, so the config spreads it back in with `undefined` values filtered (the `{ [key: string]: string }` type refuses them — a cast would have hidden that). Both the local build-and-start path and the CI `PLAYWRIGHT_PREBUILT` path activate the mock at `next start` time; the CI build job stays flag-free.

### `vitest.config.mts`

Coverage `exclude` gains `src/instrumentation.ts` and `src/lib/e2e/**` with the in-config reason: exercised by Playwright, not Vitest; counting them as uncovered source would distort the TEST-04 thresholds (D4-03).

### `e2e/search-detail.spec.ts`

Five tests, all by role + accessible name or sentinel text — no `waitForTimeout`, no CSS-class selectors, no snapshots:

1. **The journey (TEST-03):** `/?q=fixture-alpha` → click the `e2e-fixture/repo-alpha` link → URL matches `/repos/e2e-fixture/repo-alpha?from=` → h1, avatar by role `img` + Japanese alt (never pixels), and the four counters scoped to the 「リポジトリ統計」 region: stars `12,345`, **watchers `678`** — the value only `subscribers_count` can supply, since the fixture sets `watchers_count` equal to stars — forks `234`, open issues `56` → click 「戻る」 → URL contains **both** `q=fixture-alpha` **and** `page=1` (SRCH-03/DTL-05 at the E2E layer).
2. **Cold load (DTL-04):** direct `/repos/e2e-fixture/repo-alpha`, no `from` — renders, back link `href="/"`.
3. **Rate limit is never "no results":** 「アクセス制限中」 visible AND the empty-state copy asserted absent.
4. **Not found:** `/repos/e2e-fixture/no-such-repo` → 「リポジトリが見つかりません」.
5. **Pagination:** 「次へ」 → `page=2` in the URL, fixture-only item `repo-filler-20` and 「全 25 件中 21〜25 件」 visible.

`e2e/smoke.spec.ts`'s stale "intercept api.github.com in specs" comment corrected to name the server-side mock; the one-assertion harness check itself unchanged.

### `docs/TESTING.md` + `.github/workflows/ci.yml`

- § "The one non-negotiable rule": the `page.route` claim replaced with the server-side interception + sentinel-500 truth.
- § "Mocking strategy": the Playwright `page.route` example replaced with the real strategy (diagram, why `page.route` cannot work — all GitHub calls are server-side — and the three rejected alternatives with reasons and the T-01-26 link). The Vitest half stays — it was already true.
- § "Status of this harness" and § "E2E — the journey": TEST-03 no longer future work; the five shipped tests stated accurately. The status list's stale "component layer is a placeholder" line (pre-Phase-3) corrected in the same section.
- `ci.yml` e2e job: comment-only correction naming the instrumentation mock and `E2E_GITHUB_MOCK=1`. No step/env/matrix edits.
- Coverage sections untouched (plan 04-04's).

Remaining `page.route` mentions in TESTING.md: exactly two, both as the explained rejection — not as the strategy.

## Measurements the plan asked to record

- **Instrumentation ordering (D4-01):** the `NODE_OPTIONS --import` fallback was **not needed**. Measured on the production build: `E2E_GITHUB_MOCK=1 npx next start` logs `[e2e-github-mock] installed` before "first request", and the client's structured log lines show the fixture's `rateLimitRemaining: 30, rateLimitReset: 4102444800` with `durationMs: 5` — the interceptor is in the path.
- **Avatar host interception (D4-04): worked.** `GET /_next/image?url=https%3A%2F%2Favatars.githubusercontent.com%2F...&w=128&q=75` against the mocked server returned `200 image/png`, and the body is a processed PNG derived from the 1×1 fixture — the optimizer's fetch does go through `globalThis.fetch`. Specs still assert the avatar by role and alt only.
- **Mock inert outside E2E:** `npx next start` without the flag logs no install line; `npm run build` (no flag) shows the identical route table (`ƒ /`, `○ /_not-found`, `ƒ /repos/[owner]/[repo]`) — no new route, no change.
- **UX-06 findings for 04-02:** none. Every control the spec needed was reachable by role and accessible name (result links, 戻る, 次へ, headings, the labelled stats region). No CSS-selector workaround was required anywhere.

## Verification

Ran in this session on Node 24.18.1, on the final tree:

- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm test` — 182 passed / 182 (17 files).
- `npm run test:e2e` — 6 passed / 6 (the five journey tests + smoke).
- `npm run test:a11y` — 1 passed / 1 (existing spec, now against the mocked server).
- `npm run build` — compiled without the flag; route table unchanged.

## Decisions taken as-is vs modified

Everything shipped as the plan specified. Two small calls inside the plan's leeway:

- For `q=fixture-alpha` with a page other than 1 or 2, the mock returns the sentinel 500 rather than defaulting to page 1 — strict fidelity to the D4-02a table ("a spec that triggers this has a bug, and it must fail loudly").
- Fixtures import the sealed payload types from `@/types/github` (read-only import, no modification) so the "fixtures MUST mirror these shapes" requirement is compiler-enforced rather than reviewed.

## Caveats

- Locally, `reuseExistingServer` is on outside CI: if a server is already listening on port 3100 *without* the flag, Playwright would reuse it un-mocked. Pre-existing behaviour, unchanged by this plan; CI always starts fresh.
- The a11y suite still covers only the blank home render — widening it per-state is plan 04-02, on top of this mock.
