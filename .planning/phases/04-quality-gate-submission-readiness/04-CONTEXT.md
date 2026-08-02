# Phase 4: Quality Gate & Submission Readiness — Context

**Gathered:** 2026-08-02
**Status:** Ready for planning
**Source:** Assembled from AGENTS.md + ROADMAP.md Phase 4 + REQUIREMENTS.md + STATE.md pending todos + `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` (read in-tree, per the AGENTS.md warning that this Next is not the one in training data). No `/gsd:discuss-phase` was run — the constraints were pre-locked by earlier phases and by the assignment brief; re-deriving them would be theatre. Same pattern Phase 3 used.

<domain>
## Phase Boundary

Make the repository read as production work to a reviewing engineer: accessible (UX-06), responsive (UX-07), covered end-to-end against a mocked GitHub API (TEST-03), gated by a deliberately-raised coverage threshold (TEST-04), protected by real security response headers with a no-`unsafe-inline` CSP (SEC-01), and explained — a bilingual README with the key decisions and a self-contained AI usage summary (DOC-01, DOC-07, DOC-08), with both AI usage logs complete and identical (DOC-02).

Phase 4 also absorbs the STATE.md deferred items addressed to it: the README `subscribers_count` note, the `RepoDetail` `description: null` branch test, the empty per-file coverage table (fixed **before** thresholds are raised), and the `docs/OPERATIONS.md` `route`/`requestId` gaps.

Requirements this phase owns: UX-06, UX-07, TEST-03, TEST-04, DOC-01, DOC-02, DOC-07, DOC-08, SEC-01.

</domain>

<decisions>
## Implementation Decisions

### E2E mocking — the hard problem, solved honestly (TEST-03)

- **D4-01: The GitHub API is mocked at the Next server's outbound `fetch` boundary, via a test-only interceptor installed by `src/instrumentation.ts`, gated by `E2E_GITHUB_MOCK=1`. Zero new dependencies.**
  The app fetches GitHub **server-side** (Server Components), so the browser never contacts `api.github.com` — which means Playwright's `page.route()` **cannot** intercept these calls. The existing comment in `e2e/smoke.spec.ts` and the `page.route` example in `docs/TESTING.md` describe a strategy that would silently never fire; this phase corrects both documents.
  The interceptor wraps `globalThis.fetch` in the server process: requests whose URL targets `api.github.com` receive fixture `Response`s (including `x-ratelimit-*` headers); everything else passes through to the previous `fetch`. Installation happens in Next's documented `instrumentation.ts` `register()` hook (stable, runs once at server start, `NEXT_RUNTIME === "nodejs"` guarded), and **only** when `E2E_GITHUB_MOCK=1` — which only the Playwright `webServer` sets. Ordering with Next's own fetch patching is robust in either direction: if the interceptor installs first, Next's cache wrapper wraps it; if Next patches first, the interceptor wraps Next's wrapper. Both orders intercept correctly — the only variable is whether a GitHub fixture response is additionally cached, which is harmless in E2E.
  - **Rejected: `page.route("https://api.github.com/**")`.** Intercepts browser-originated requests only. The server-side `githubFetch` never appears in the browser's network stack. This is the correction to `docs/TESTING.md` § Mocking strategy, not a viable option.
  - **Rejected: an env-settable GitHub base URL pointing at a local mock server.** Explicitly sealed by Phase 1's T-01-26: an env-settable base URL redirects the `Authorization` header — the app's single secret — to any host an environment variable can name. The paragraph in `docs/OPERATIONS.md` § "Confirmed against the shipped client" exists precisely so the next person proposing this finds it first. Not reopened.
  - **Rejected: MSW via instrumentation.** The documented Next-recommended shape — but it is a new dev dependency, and `docs/TESTING.md` already records "adding a dependency here is a decision to be made deliberately, not by habit". What MSW would buy here (request matching, response stubbing for exactly two endpoint shapes) is a ~60-line wrapper on the platform. Same reasoning that chose `console.log` over pino (Phase 1 D-17/D-18) and `setTimeout` over a debounce library (Phase 2 D-15/D-16).
  - **Rejected: `undici` `setGlobalDispatcher(MockAgent)`.** The npm `undici` package is a separate module instance from the one bundled into Node; its global dispatcher does not govern Node's built-in `fetch`. Would install a mock that intercepts nothing.
  - **Rejected: the reverted-source-edit trick Phase 1's cache measurement used.** Correct for a one-off local measurement; useless for a committed CI spec, which must run from the checked-in tree.
  - **Fallback if measurement falsifies the instrumentation route:** preload the interceptor with `NODE_OPTIONS="--import …"` on the `next start` command in `playwright.config.ts`. This installs before Next boots at all. Only reach for it if the instrumentation hook demonstrably fails to intercept (see D4-02's self-verification — the failure is loud, not silent).

- **D4-02: Fixtures use sentinel values that cannot exist on real GitHub**, so a silently-broken interceptor fails named assertions instead of passing against live data (which would also rate-limit CI runners). Owner `e2e-fixture`, repo names `repo-alpha` etc. The detail fixture sets `subscribers_count` (678) to a visibly different value from `stargazers_count`/`watchers_count` (12,345), so the E2E run proves the watchers-trap mapping end to end — a spec asserting "678" can only pass through the fixture. An unmatched `api.github.com` request returns a 500 with a sentinel body, never a pass-through to real GitHub: **no E2E request escapes to the live API, matched or not.**

- **D4-02a: The scenario table is the contract between plan 04-01 (which implements it) and plans 04-02/04-03 (whose specs drive it):**

  | Request | Response |
  |---|---|
  | `GET /search/repositories?q=fixture-alpha…&page=1` (or no page) | 200 — `total_count: 25`, 20 items, first item `e2e-fixture/repo-alpha`, `language: "TypeScript"`, `stargazers_count: 12345` |
  | same, `page=2` | 200 — remaining 5 items |
  | `q=fixture-empty…` | 200 — `total_count: 0`, empty items |
  | `q=fixture-ratelimit…` | 403 — `x-ratelimit-remaining: 0`, `x-ratelimit-reset:` a fixed far-future value |
  | `GET /repos/e2e-fixture/repo-alpha` | 200 — full detail payload; `subscribers_count: 678`, `watchers_count: 12345` (deliberately equal to stars — the trap), `forks_count`, `open_issues_count`, `language`, `description` (Japanese text), `owner.avatar_url` on `avatars.githubusercontent.com` |
  | `GET /repos/e2e-fixture/no-such-repo` | 404 |
  | any other `api.github.com` request | 500 with sentinel body `E2E_MOCK_UNMATCHED` — a spec that triggers this has a bug, and it must fail loudly |

  Fixture payloads are **raw GitHub REST JSON shapes** (snake_case), because the interceptor sits beneath the real client — the client's parsing and mapping stay in the run, which is the point.

- **D4-03: Mock code lives at `src/instrumentation.ts` + `src/lib/e2e/`, excluded from Vitest coverage with an in-config comment.** These files are exercised by Playwright, not Vitest; counting them as uncovered source would distort the TEST-04 thresholds, and writing jsdom unit tests for a Playwright-only fixture server would be coverage theatre. `instrumentation.ts` must live under `src/` because the project uses the `src/` directory convention.

- **D4-04: The avatar host may also be intercepted, best-effort.** `next/image`'s optimizer fetches `avatars.githubusercontent.com` server-side when the browser requests `/_next/image`. That host is a CDN, not the rate-limited API, so a real fetch does not violate the no-live-API rule — but specs must not depend on it: assert the avatar `img` by role and `alt` text, never on loaded pixels. If the optimizer's fetch goes through `globalThis.fetch`, the interceptor may serve a tiny valid PNG; record what measurement shows either way.

### Security headers and CSP (SEC-01)

- **D4-05: Nonce-based CSP via `src/proxy.ts` — Next 16 renamed middleware to proxy.** Per `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`: the proxy generates a per-request nonce, sets it in the `Content-Security-Policy` header and an `x-nonce` request header; Next extracts the nonce from the CSP header and applies it to its framework scripts, bundles, and inline scripts automatically. Production `script-src` is `'self' 'nonce-…' 'strict-dynamic'`; `'unsafe-eval'` is appended **in development only** (React uses `eval` for dev-time error stack reconstruction — documented, and dev-only by construction via `NODE_ENV`). **`script-src` never contains `'unsafe-inline'` in any environment or fallback — that is the SEC-01 line that does not move.**
  - **Rejected: CSP via `next.config.ts` `headers()` alone.** The docs' no-nonce path requires `script-src 'unsafe-inline'` — the exact thing SEC-01 forbids. A static header cannot carry a per-request nonce.
  - **Rejected: experimental SRI (`experimental.sri`).** Would permit static generation with a strict CSP, but it is flagged experimental in the docs, and shipping an experimental framework flag in a selection task graded as production code is the wrong risk. Nonces are the stable, documented mechanism.
- **D4-06: `style-src` is decided by measurement, with a strictness ladder — and the concession, if any is needed, never touches scripts.** Start with the docs' production policy `style-src 'self' 'nonce-…'`. Drive both routes on the production build and read the violation reports. Known risk: `next/image` renders a `style="color:transparent"` **attribute**, and style attributes are not nonce-able — if it violates, step to `'unsafe-hashes'` plus the sha256 hash of the exact declaration (scoped, deterministic, still not `unsafe-inline`). Only if that also fails measurably does `style-src` fall back to `'self' 'unsafe-inline'` — recorded in `docs/SECURITY.md` and the summary as a scoped, styles-only concession with the measurement that forced it. An unmeasured "looks strict" policy is exactly what `docs/SECURITY.md` warns produces "a policy that looks strict but is not".
- **D4-07: Static headers ship in `next.config.ts` `headers()`; only the CSP lives in the proxy.** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (search terms in URLs must not leak), `X-Frame-Options: DENY` (belt to CSP's `frame-ancestors 'none'` braces), `Strict-Transport-Security: max-age=31536000; includeSubDomains`. These are per-deployment constants — putting them in the proxy would recompute them per request for nothing, and `headers()` also covers paths the proxy matcher skips.
- **D4-08: Dynamic-rendering interaction is measured, not assumed.** Nonces require dynamic rendering; both real routes are already dynamic (`ƒ` in the build's route table — `/` awaits `searchParams`, `/repos/[owner]/[repo]` awaits `params`). The statically prerendered global `/_not-found` cannot receive a nonce, so its inline bootstrap scripts will be blocked under the CSP. Measure it: if the static 404 still renders its content (it is static JSX with no interactivity to lose), **accept and record**; if it visibly breaks, force it dynamic and record the cost. The route-level `not-found.tsx` under `/repos/…` renders inside a dynamic route and is unaffected.

### Coverage (TEST-04)

- **D4-09: Fix the empty per-file `text` table first, then raise thresholds — in that order, in one plan.** The raise is the run where someone needs to read which file fell short; raising against an unreadable table is the failure mode STATE.md's todo names. Root cause is investigated from `.planning/phases/01-github-api-client/deferred-items.md` (symptom recorded, `skipFull` ruled out); acceptable fixes are a reporter configuration that prints per-file rows, or a documented replacement reporter — not "read lcov.info forever".
- **D4-10: Thresholds are raised to bind, not to boast, and are set from measured post-Phase-4 figures.** Aggregate at Phase 3 close: 96.44% lines / 95.78% branches / 87.5% functions — and Phase 4 adds tested source (csp helper) and new component tests before the raise. Target zone: **90 lines / 90 statements / 85 branches / 80 functions**, adjusted to the measured run so the floor sits meaningfully below actual (a threshold you trip over on the next honest refactor is a lint-disable waiting to happen — AGENTS.md forbids that move). Never lowered. The known 0%-reported files (`loading.tsx`, `error.tsx`, `not-found.tsx` route conventions that only run inside Next's runtime) are weighed when choosing the number, with the reasoning recorded in `docs/TESTING.md`.

### Accessibility and responsiveness (UX-06, UX-07)

- **D4-11: Per-state axe coverage, driven through the mock.** The current a11y spec checks one blank render. Phase 4 runs axe against: search with results, empty state, rate-limit state, invalid-query state, the detail page, and the not-found page — every distinct render a reviewer can reach. Zero-violation assertion, same tags (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`).
- **D4-12: Keyboard operability is proven by a Playwright keyboard-only journey, not claimed.** Tab to the input, type, reach a result link by keyboard, Enter to navigate to the detail route, reach 戻る by keyboard, Enter to return with `?q=` and `page` intact. Findings (focus not visible, dead tab stops, wrong heading order) are **fixed in the components**, never accommodated by weakening a spec.
- **D4-13: Responsiveness is asserted as "no horizontal overflow, nothing clipped" at 375×667 and 1280×800**, on both views, via `document.documentElement.scrollWidth <= clientWidth` plus visibility of the key controls. Design is explicitly not graded; this is a usability floor, not a visual pass.
- **D4-14: The `RepoDetail` `description: null` branch test lands here** (STATE.md deferred item): fixture with `description: null`, assert no empty paragraph renders. Closes the one uncovered branch Phase 3 recorded.

### Documentation (DOC-01, DOC-02, DOC-07, DOC-08)

- **D4-15: One `README.md`, bilingual, Japanese first, English second, separated by an explicit divider.** The reviewers and the brief are Japanese; the README is the first document read (DOC-07's own rationale). Rejected: split `README.md`/`README.en.md` — GitHub renders exactly one README at the repository root, and a reviewer must not need a second click to find the language they read.
- **D4-16: The README carries a self-contained AI usage summary, not only links** (DOC-08 — the brief says 「利用方法のレポートをREADMEにまとめてください」: summarised *in* the README). Structure mirrors the log's own fields: how AI was used, what the human decided, how output was verified — with links to `docs/AI-USAGE.ja.md` / `docs/AI-USAGE.en.md` for per-process detail. Both language halves of the README carry the summary.
- **D4-17: Key decisions explained in the README with their reasons:** no database and no auth (nothing to persist; reads as over-engineering — and the security dividend `docs/SECURITY.md` names), `subscribers_count` for watchers (the REST `watchers_count`-duplicates-stars trap — this is the STATE.md deferred DOC-01 note, whose reasoning already lives at `src/lib/github/repo.ts` and `RepoDetail.tsx`; the README states it where the brief asks), no DAST (no auth/session/datastore to attack), optional server-side `GITHUB_TOKEN` (works with zero config; never `NEXT_PUBLIC_`; `.env.example`).
- **D4-18: `docs/OPERATIONS.md`'s `route` and `requestId` gaps are reconciled as documentation, not code.** The log call sites live in `src/lib/github/client.ts` — sealed. The honest v1 disposition: `requestId` stays per-GitHub-call and `route` stays omitted, recorded as a decision with its reasons (one upstream, one call per user action — a per-call id already correlates a retry with its first attempt, which is the only correlation this app has needed; threading an inbound-request id through the sealed client is v2 work if ever). The doc stops saying "deferred to Phase 2" — that phase has passed, and a stale forward reference is worse than a recorded decision.
- **D4-19: Process 9 covers Phase 4, appended to both logs, identical content, before the phase-close commit.** Entry-count parity check (`## Process` vs `## 工程`) holds after the append. The *why* fields record the E2E-mock and CSP decision ladders above, including the rejected alternatives — that is the evidence the log exists to carry.

### Process

- **D4-20: The terminal plan runs the full 7-command Definition of Done gate and stops before any merge.** `gh pr merge` appears in no plan. A human merges — AGENTS.md, restated because this is the phase where the temptation to "finish" is strongest.
- **D4-21: The LICENSE question is flagged to the human, not answered by an agent.** STATE.md carries "No LICENSE file. Considered and not selected; revisit before submission." Choosing a licence for a selection-task submission is the owner's call. The phase-close summary and PR description surface it; no plan adds a file.

</decisions>

<scope_fence>
## Scope Fence

- **Do not modify** `src/lib/github/**` or `src/types/**`. Phase 1's contract is sealed. The E2E interceptor works *beneath* it and the OPERATIONS.md reconciliation works *around* it precisely so this stays true. A genuine gap is a stop-and-report.
- **Zero new production dependencies. No new dev dependencies without stopping to ask the human** — MSW was considered and rejected (D4-01) partly on this ground; do not re-add it quietly.
- **Do not weaken any existing test, lint rule, or TypeScript setting** to make the CSP, axe, or coverage gates pass. Fix the code or record the measured concession (D4-06 is the only sanctioned ladder).
- **Never lower a coverage threshold.** Raising is TEST-04; lowering is a regression by definition.
- **Do not add `pages/`, downgrade Next.js, or render the detail view as anything but its route.**
- **No test — E2E, a11y, or otherwise — touches the live GitHub API.** The mock's unmatched-request behaviour is a loud 500, not a pass-through (D4-02).
- **No merge step in any plan.** Open the PR, report, stop (D4-20).
</scope_fence>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before implementing.**

### Rules and constraints (binding)
- `AGENTS.md` — every rule binds; especially: Japanese UI/English code, verification before assertion, both AI logs before commit, agents never merge.
- `.planning/ROADMAP.md` § Phase 4 — the 8 success criteria + the Definition of Done.
- `.planning/REQUIREMENTS.md` — UX-06, UX-07, TEST-03, TEST-04, DOC-01, DOC-02, DOC-07, DOC-08, SEC-01.
- `.planning/STATE.md` § Pending Todos — the deferred items this phase absorbs.

### Framework truth (read in-tree, not from memory)
- `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` — the nonce/proxy mechanism, dynamic-rendering requirement, dev `'unsafe-eval'` caveat.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` — proxy signature and matcher (middleware was renamed in Next 16).
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` — `register()` semantics and `NEXT_RUNTIME` guard.

### Design contracts
- `docs/TESTING.md` — layers, the five failure modes, coverage config; its § Mocking strategy Playwright example is corrected by this phase (D4-01).
- `docs/SECURITY.md` — § Response headers is the table this phase implements; updated from "planned" to "shipped + measured".
- `docs/OPERATIONS.md` — the `route`/`requestId` rows reconciled by D4-18; T-01-26's base-URL paragraph, which D4-01 honours.
- `.planning/phases/01-github-api-client/deferred-items.md` — the empty coverage-table investigation notes for D4-09.

### Shipped code this phase drives (sealed or near-sealed)
- `src/app/page.tsx`, `src/components/*` — the search view Phase 4 audits; component names: `SearchInput`, `ResultList`, `Pagination`, `EmptyState`, `RateLimitPanel`, `InvalidQueryNotice`.
- `src/app/repos/[owner]/[repo]/*`, `src/components/RepoDetail.tsx`, `RepoRateLimitPanel.tsx` — the detail view.
- `src/lib/github/search.ts` / `repo.ts` test fixtures — the raw GitHub JSON shapes the E2E fixtures must mirror.
- `playwright.config.ts`, `vitest.config.mts`, `.github/workflows/ci.yml` — the harness; CI already runs `test:e2e`/`test:a11y` with `PLAYWRIGHT_PREBUILT=1` against a shared build, and the env-gated mock activates at `next start` time, so the CI build stays clean with no workflow change.
- `docs/AI-USAGE.en.md` Process 8 — the format reference for Process 9.
</canonical_refs>

<deferred>
## Deferred Ideas

- **FAV-01/02, OPS-01/02/03** — v2, per REQUIREMENTS.md.
- **Per-inbound-request `requestId` threading** — v2; requires opening the sealed client (D4-18).
- **Rate-limit reset in the viewer's local timezone** — rejected for v1 in Phase 3; unchanged.
- **LICENSE file** — human decision, flagged at phase close (D4-21), not implemented by an agent.
- **Cross-browser E2E matrix** — chromium-only stands (docs/TESTING.md); not in the brief.
</deferred>

---

*Phase: 04-quality-gate-submission-readiness*
*Context assembled: 2026-08-02*
