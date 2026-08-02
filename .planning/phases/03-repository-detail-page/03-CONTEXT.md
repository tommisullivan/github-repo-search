# Phase 3: Repository Detail Page — Context

**Gathered:** 2026-08-02
**Status:** Ready for planning
**Source:** Assembled from AGENTS.md + ROADMAP.md Phase 3 + REQUIREMENTS.md + the Phase 3 execution brief (URL contract, back-target open-redirect guard, failure-state coverage). No `/gsd:discuss-phase` was run — the decisions below were locked before Phase 1 opened, restated here so the planner does not re-derive them.

<domain>
## Phase Boundary

Build the repository detail page on its own App Router route, using the Phase 1 boundary (`src/lib/github/{client,errors,repo}`, `src/types/github.ts`) unchanged. Ship:

- `src/app/repos/[owner]/[repo]/page.tsx` — the Server Component that fetches and renders.
- `src/app/repos/[owner]/[repo]/loading.tsx` — the Suspense fallback.
- `src/app/repos/[owner]/[repo]/error.tsx` — the route-scoped error boundary for thrown `GitHubRequestError` (network / timeout / 5xx / malformed JSON).
- `src/app/repos/[owner]/[repo]/not-found.tsx` — the not-found page reached via Next's `notFound()`.
- `src/components/RepoDetail.tsx` — the presentation component with the seven required fields.
- Presentational sub-components for the rate-limit state (either colocated or inside `RepoDetail.tsx`'s render tree).
- `next.config.ts` — `images.remotePatterns` scoped to `avatars.githubusercontent.com` on `https` (SEC-02).
- Colocated tests: `RepoDetail.test.tsx` (happy path + at least one failure path), and one page-level test that asserts `notFound()` is invoked for `NOT_FOUND` (DTL-04 half of TEST-02).

Requirements this phase owns: DTL-01, DTL-02, DTL-03, DTL-04, DTL-05, UX-05, TEST-02 (detail half only — Phase 2 owns the search half, running in parallel), SEC-02.

What Phase 3 does **not** own:

- The search route (`/`) — Phase 2. Phase 3 only *links back to it* as the fallback back-target.
- Accessibility passes (`test:a11y` beyond what already ships), README updates, and CSP headers — Phase 4.
- Anything under `src/lib/github/**` or `src/types/**` — Phase 1's sealed contract. If a genuine change is needed there, stop and report rather than editing.

</domain>

<decisions>
## Implementation Decisions

### Route shape

- **D3-01: Detail is a Server Component at `src/app/repos/[owner]/[repo]/page.tsx`.** A modal is an explicit assignment fail. Server rendering also keeps `GITHUB_TOKEN` out of the client bundle by construction rather than by discipline (API-03), and means a bare or refreshed URL renders correctly on first request (DTL-04).
- **D3-02: Route params come from Next 16's async `params` shape.** `page.tsx` signature is `({ params, searchParams }: { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ from?: string | string[] }> })`. Await both. This is a Next 16 breaking change from prior versions and worth stating so the executor does not regress it — see `node_modules/next/dist/docs/` before writing.
- **D3-03: The page calls `getRepository(owner, repo)` and branches on the returned `Result`.** No `try`/`catch` on `getRepository`: a thrown `GitHubRequestError` must reach `error.tsx` untouched (Phase 1 D-03 / D-05a). Branching only on `ok: false` is incomplete and Phase 1 spelled this out — the throw is the second contract.

### Failure branching

- **D3-04: `NOT_FOUND` → `notFound()`.** The page calls Next's `notFound()`, which triggers the colocated `not-found.tsx`. That page reads "リポジトリが見つかりません" and links back to `/`. Reasons:
  - `notFound()` is the framework-native path for this state, gives a real 404 status, and is testable by asserting the thrown Next tag rather than by asserting rendered markup that would require a full route render.
  - Rendering the not-found copy inline from the page would give the wrong HTTP status and would not compose with any future not-found handling.
- **D3-05: `RATE_LIMIT` → dedicated inline panel with a Japanese message and a reset time.** Never falls through to a generic error page and never reads as "not found" — that is the single most misleading failure this app can produce (docs/TESTING.md). The message states *when* to retry using the `resetAt` value the client already surfaces (Phase 1 D-08). Format the reset time with the browser locale on the client is *not* an option — a Server Component cannot access the browser's timezone — so render `HH:mm` in `Asia/Tokyo` (reviewers are Japanese) using `Intl.DateTimeFormat` with `timeZone: 'Asia/Tokyo'`.
- **D3-06: `INVALID_QUERY` → `notFound()`.** `getRepository` folds a blank owner or repo into `NOT_FOUND` (see repo.ts lines 46–54), so this branch is only reachable if Phase 1's contract changes. Route it to `notFound()` for defence in depth — an unmapped code should not silently render as success.
- **D3-07: Thrown `GitHubRequestError` → route-scoped `error.tsx`.** A generic Japanese retry message with a reset button (`reset()` prop from the `error.tsx` contract). Never renders the raw error, its `message`, or its stack — production Next sanitises them anyway but the copy is explicit about not depending on that.
- **D3-08: Loading via `loading.tsx`.** Next's Suspense boundary is the right home, not a hand-rolled flag; keeps the page component free of loading state.

### The back link (DTL-05)

- **D3-09: Back-link target is read from a `?from=` query param on the URL, defaulting to `/`.** Phase 2 places the link with `?from=${encodeURIComponent(currentSearchUrl)}` so the user's keyword and page survive a round trip. The detail page never invents a URL — inventing one would guess wrong on page 3 with a filter.
- **D3-10: Open-redirect guard, mirrored from Phase 1's origin defence.** Accept `from` only if it starts with a single `/` and the next character is neither `/` nor `\`. Anything else (including protocol-relative `//host`, backslash `\host` which the WHATWG URL parser normalises to `/host`, and absolute URLs) falls back to `/`. This is the exact same rule `src/lib/github/client.ts`'s `SITE_RELATIVE_PATH` regex encodes for outbound paths — the reason lives at that comment. Ship it as a **pure helper in `src/components/RepoDetail.tsx`** (or a small `src/lib/backTarget.ts` — planner may choose) with a unit test that covers each rejection case; a review-only rule was rejected by Phase 1 and the same reasoning applies here.
  - **Rejected: accept any string that starts with `/`.** `/\evil.example.com/x` parses as `/evil.example.com/x`, which then routes to `/evil.example.com/x` inside the app rather than out to another host; even so, a leading `\` in the resolved path can be a header-splitting or router-confusion vector, and the sentinel is one character — no reason to weaken the mirror to `SITE_RELATIVE_PATH`.
  - **Rejected: URL-decode `from` before checking.** Double-encoding is the only way to smuggle a `\` past `encodeURIComponent`; the check runs on the raw string precisely so a `%5C` reads as literal characters, not as `\`. If a caller ever double-encodes, that is a caller bug, not a security regression.

### Presentation and copy

- **D3-11: `<RepoDetail>` renders the seven required fields.** Name, owner avatar, primary language, stars, watchers (already mapped from `subscribers_count` in `repo.ts`), forks, open issues. Also render `fullName`, `description`, and a link to the repository on GitHub — those are not required by the brief but are the fields a reviewer will look for and their absence would read as an oversight. Do not add contributors, releases, README fetches, or anything that costs a second GitHub request.
- **D3-12: Owner avatar via `next/image`.** `width` and `height` explicit, `alt` set to `${owner.login} のアバター`, and `priority` on the avatar because it is above the fold. Phase 4 will re-evaluate LCP; a `priority` avatar is the honest choice for now.
- **D3-13: Numbers formatted with `Intl.NumberFormat('ja-JP')`.** 12,345 rather than 12345. Small polish, low cost, high signal.
- **D3-14: All UI strings Japanese, in the component that renders them.** Labels, buttons, error copy, `aria-label` values. English identifiers, English tests. Nothing user-facing lives under `src/lib/github/**` or `src/types/**` — that is Phase 1's boundary and the automated Japanese-character grep in that plan is still in force.
- **D3-15: One exported component per file.** `PascalCase.tsx`. Rate-limit and not-found copy either live inside the render tree of `RepoDetail.tsx` (if trivial) or in colocated small components (if they grow past a handful of lines); the planner chooses at implementation time.

### Testing (TEST-02, detail half)

- **D3-16: Component tests mock at `@/lib/github/repo`.** Not at `fetch`, because unlike the client's own tests the *subject* is the component's rendering, not the client's translation. `docs/TESTING.md` explicitly permits a module mock at the component layer where the client is not the subject.
- **D3-17: Coverage floor is happy path + at least one failure path.** For a phase whose *reason to exist* is the failure matrix, one is the floor not the target. Ship at minimum: (a) all seven fields visible on the happy path, (b) rate-limit panel appears with reset time when the client returns `RATE_LIMIT`, (c) the page invokes `notFound()` for `NOT_FOUND`, (d) `next/image` receives the allowlisted avatar host so SEC-02 has a live assertion. The `NETWORK` throw is covered by Phase 1's unit suite; the render half is out of scope until Phase 4's E2E and would need a full route render harness that the component layer does not offer.
- **D3-18: Assertions query by role and accessible name.** No test IDs, no class names, no snapshot-only tests. A control that cannot be found by role and name is an accessibility bug the test has just caught. This is `docs/TESTING.md` restated because it will bind every test written this phase.

### Security (SEC-02)

- **D3-19: `images.remotePatterns` in `next.config.ts` is a single entry.** `{ protocol: 'https', hostname: 'avatars.githubusercontent.com' }`. Never a wildcard, never `**.githubusercontent.com`, never additional hosts "in case". The property under `pathname` stays absent — GitHub's avatar URLs vary in shape and pinning them would break the first time GitHub renames a bucket.
- **D3-20: `dangerouslySetInnerHTML` remains banned.** GitHub descriptions and repository names are untrusted input; render as text. The Phase 1 ESLint rule (`no-restricted-syntax` on `JSXAttribute[name.name="dangerouslySetInnerHTML"]`) already fires repo-wide.

### Discretion left to the planner

Named explicitly so it does not read as an oversight later.

- Whether the back-target guard lives inside `RepoDetail.tsx`, as its own `src/lib/backTarget.ts`, or as a helper next to `page.tsx`. Any of those satisfies the constraint; the important thing is that it has a unit test that covers each rejection case.
- Whether the rate-limit panel is a colocated `RateLimitPanel.tsx` or inlined inside `RepoDetail.tsx`'s render.
- The precise Tailwind class list. Design is not graded.
- Whether the `error.tsx` state gets its own colocated test — one page-level test asserting the routing to `notFound()` is enough for TEST-02; the thrown-error test at the client layer already covers the propagation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Rules and constraints (binding)

- `AGENTS.md` — every rule binds. Japanese UI, English code; Server Components by default; `dangerouslySetInnerHTML` banned; tests ship with the feature; the agent never merges; AI usage log required with a real *why*.
- `.planning/ROADMAP.md` — Phase 3 success criteria (7 items) + Definition of Done (7 items), both binding.
- `.planning/REQUIREMENTS.md` — DTL-01..05, UX-05, TEST-02 (detail half), SEC-02.
- `.planning/STATE.md` — pending todos carried forward from Phase 1.

### Design contracts

- `docs/ARCHITECTURE.md` — the shipped hybrid failure model, the boundary table, the "detail request — cold" Mermaid sequence at lines ~279–320 (the page calling `notFound()` itself is drawn there).
- `docs/OPERATIONS.md` — rate-limit headroom is historical, not live; the 300-second detail revalidate window; the retry policy that binds the client and therefore this page.
- `docs/SECURITY.md` — token handling, `images.remotePatterns` scoping, `dangerouslySetInnerHTML` ban.
- `docs/TESTING.md` — happy-path + failure-path floor, module mocking permitted at the component layer, query by role and name, no snapshot-only tests.

### Phase 1 shipped code (sealed contract — do not modify)

- `src/types/github.ts` — `RepoDetail`, `RepoSummary`. `watchers` maps to `subscribers_count`. There is no `watchersCount` field — the type prevents populating watchers any other way (see the extended comment at lines 99–112).
- `src/lib/github/repo.ts` — `getRepository(owner, repo): Promise<Result<RepoDetail>>`. Blank arg → `NOT_FOUND` without a request (lines 46–54). 300s revalidate window. May throw `GitHubRequestError` for network / 5xx / timeout / malformed JSON.
- `src/lib/github/errors.ts` — `Result<T>`, `GitHubFailure` (`RATE_LIMIT | NOT_FOUND | INVALID_QUERY`), `GitHubRequestError` (carries `code: "NETWORK"`).
- `src/lib/github/client.ts` — the origin guard for outbound paths (`SITE_RELATIVE_PATH` at line 49) is the exact pattern to mirror for the back-target guard.
- `eslint.config.mjs` — the `presentation-layer-boundary` rule already forbids `@/lib/github/client` from `src/app/**` and `src/components/**`. `@/lib/github/errors` and `@/lib/github/repo` remain allowed, deliberately.

### Phase 1 evidence to preserve

- `src/lib/github/repo.test.ts` — the watchers-trap test at lines 193–209 asserts the mapping this phase renders. The component tests should quote the same fixture shape so drift shows up as a test failure, not a review catch.
- `docs/AI-USAGE.en.md` Process 6 — the format reference for the entry this phase must write.

</canonical_refs>

<specifics>
## Specific Ideas

- **The back-target guard is a strict mirror of Phase 1's outbound origin defence.** Same reasoning, same regex shape, both `/` and `\` rejected in the second character. A future reader who reads the two side-by-side should see they say the same thing.
- **`Intl.DateTimeFormat` with `timeZone: 'Asia/Tokyo'`.** The reviewers are Japanese engineers and the app has no server-side clock signal that would justify anything else. Do not fall back to UTC — "20:14 UTC" is not actionable in Tokyo.
- **Do not add `next-intl` or any localisation library.** Every user-facing string is Japanese, always, by decision. A library would be dead weight and would fail AGENTS.md's "adding a dependency is a decision, not a detail" test.
- **Do not fetch the README, contributors, releases, or any secondary GitHub endpoint.** Every extra call spends a quota that is 60/hour for anonymous callers. The brief lists seven fields; ship those and stop.
- **The route params for Next 16 are `Promise<...>`.** Awaiting is required. This is the shape most likely to be regressed from muscle memory of Next 14/15 — call it out in `<read_first>` for the page task.
- **The scaffold `src/app/page.tsx` will be replaced by Phase 2 in a parallel worktree.** Do not touch it in Phase 3; the back-link fallback (`/`) will route to whichever page Phase 2 lands. If Phase 2 merges first this branch will need a rebase, which is expected and recorded honestly.

</specifics>

<deferred>
## Deferred Ideas

- **The E2E search-to-detail journey** — TEST-03, Phase 4.
- **Raised coverage thresholds** — TEST-04, Phase 4. Do not raise Vitest thresholds in this phase; the existing 70% floor is Phase 1's decision and stays intact.
- **Keyboard operability and heading structure audit** — UX-06, Phase 4. Component tests query by role and name, which surfaces the worst of these, but the full keyboard pass is Phase 4 work.
- **CSP headers** — SEC-01, Phase 4.
- **README updates for `subscribers_count`, the token, and the AI summary** — DOC-01, DOC-08, Phase 4. Do not add them here; DOC-01 is Phase 4's plan and pre-empting it splits the reasoning across two commits.
- **Rate-limit reset formatting in the user's local timezone.** Rejected for v1 because a Server Component cannot read the browser's timezone and rendering it client-side would require a client boundary just to reformat a number. Revisit if the app ever ships to non-Japanese users.

</deferred>

<scope_fence>
## Scope Fence

- **Do not modify** `src/lib/github/**` or `src/types/**`. Phase 1's contract is sealed. A genuine gap is a stop-and-report.
- **Do not modify** `src/app/page.tsx` or `src/app/layout.tsx`. Phase 2 owns the root route; the layout is a Phase 4 concern if anywhere.
- **Do not touch** `eslint.config.mjs`, `vitest.config.mts`, `.github/workflows/*.yml`, `package.json`, or `package-lock.json` unless a change is genuinely required to close a Phase 3 requirement. Zero new production dependencies across the phase. If a dependency is truly needed, stop and raise it — it is a human decision.
- **Do not raise** the Vitest coverage thresholds. That is Phase 4's TEST-04.
- **Do not add** `pages/`, downgrade Next.js, or introduce client-side data fetching for the detail view.

</scope_fence>

---

*Phase: 03-repository-detail-page*
*Context gathered: 2026-08-02 (assembled from AGENTS.md + ROADMAP + REQUIREMENTS + Phase 3 execution brief; no `/gsd:discuss-phase` was run because the constraints are pre-locked).*
