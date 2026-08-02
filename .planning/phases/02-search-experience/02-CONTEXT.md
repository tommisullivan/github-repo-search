# Phase 2: Search Experience - Context

**Gathered:** 2026-08-02
**Status:** Ready for planning

<domain>
## Phase Boundary

A user types a keyword, sees a list of matching GitHub repositories, and can page through them. Every state that a user can actually reach — loading, empty result set, network failure, rate limit — renders as a distinct, human-readable Japanese state, never as "no results". The keyword and page live in the URL so the result is shareable, refreshable, and reachable with the browser back button.

This phase builds `src/app/page.tsx`, `src/app/loading.tsx`, `src/app/error.tsx`, and the components that render the search input, the pagination controls, and each result row. It **consumes** the sealed Phase 1 boundary (`src/lib/github/search.ts` and `src/types/github.ts`) — the client contract is fixed and this phase does not modify it. The repository detail route lives on Phase 3 and runs in parallel; this phase links into it but does not build it.

Requirements: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, UX-01, UX-02, UX-03, UX-04, I18N-01.

</domain>

<decisions>
## Implementation Decisions

### URL is state — the whole approach rests on this

- **D-01:** The keyword and page live in the URL query string, not in local component state. `?q=<keyword>&page=<n>` is the source of truth; the input reads from it and every navigation updates it (SRCH-03).
- **D-02:** Rationale: a share-able and refresh-able result page is the honest test of "URL is state". Any state model that fetches on submit and holds the result in memory fails a refresh, and holding it in `sessionStorage` fails a shared link. The URL is the only container that survives both.
- **D-03:** `router.replace()` — not `router.push()` — on keystroke and page change. Otherwise the browser history fills with a URL per keystroke, and the back button no longer takes the user to where they came from.
- **D-04:** The current search URL is carried into a detail link as `?from=<encoded url>` so Phase 3 can render a "戻る" (back) link that restores the keyword and page. This is the Phase 2 ↔ Phase 3 contract, and it is fixed here so both phases can be built in parallel.

### Server-side data flow, client-side interactivity only

- **D-05:** `src/app/page.tsx` is a **Server Component** that reads `searchParams` and calls `searchRepositories()` on the server. This is the AGENTS.md default and the safest place for a call that reads the optional `GITHUB_TOKEN`.
- **D-06:** The search input is a Client Component (`"use client"`), pushed as far down the tree as possible. It owns the debounce, the input value, and the call to `router.replace()`. It does **not** own the fetched data — that comes from the server render.
- **D-07:** The page does **not** `try`/`catch` the client call. `searchRepositories()` returns a `Result` for expected failures (`RATE_LIMIT`, `INVALID_QUERY`) and **throws** `GitHubRequestError` for transport faults, timeouts and 5xx. A `try`/`catch` in the page would intercept a throw that D-03 in Phase 1 says must reach `app/error.tsx`.

### Distinguishing INVALID_QUERY causes — carried forward from Phase 1

- **D-08:** `searchRepositories()` returns `INVALID_QUERY` for **two** distinct causes: a blank or whitespace-only keyword, and a page past the 1000/perPage ceiling (page 51+). The phase 1 `Result` alone cannot tell them apart, and one message would be wrong for one of them.
- **D-09:** The page inspects the inputs *before* calling the client: if `q` is blank or whitespace, show "キーワードを入力してください" ("please enter a keyword") without a request; if `page > SEARCH_MAX_PAGE`, show "検索できるページを超えています" ("beyond the searchable page range"). The Phase 1 client still returns `INVALID_QUERY` in both cases — this decision lives in the page so the copy can be right.
- **D-10:** The client's `SEARCH_PER_PAGE` and `SEARCH_MAX_RESULTS` are imported and used to derive `SEARCH_MAX_PAGE = Math.floor(SEARCH_MAX_RESULTS / SEARCH_PER_PAGE)` — the same derivation the client already exports for. Never written as a literal `50`.

### Failure UI — every state has its own copy

- **D-11:** `RATE_LIMIT` renders a dedicated panel showing the reset time as "あと約N分後にリトライ可能" ("retry possible in about N minutes"), computed from `resetAt`. This is the single most-visible state to a reviewer during the rate-limited windows GitHub imposes on unauthenticated search (~10/min). Never shown as an empty result.
- **D-12:** Empty result set (`ok: true`, zero items) is a **success**, not a failure — it renders a distinct empty state ("該当するリポジトリが見つかりませんでした") that suggests trying a different keyword.
- **D-13:** `NETWORK` and any 5xx propagate as a thrown `GitHubRequestError` and reach `app/error.tsx`. `app/error.tsx` renders a Japanese-labelled generic-retry state and never renders a raw error object or stack trace.
- **D-14:** `app/loading.tsx` renders a Japanese-labelled loading state that the App Router shows during the server render.

### Debouncing without a library

- **D-15:** The input is debounced with **no library** — no `use-debounce`, no `lodash`. React 19's `useDeferredValue` and `useTransition` together, or a small custom `useDebounce` hook using `setTimeout`, cover the requirement.
- **D-16:** Rationale: AGENTS.md requires preferring the platform over a library. A debounce is a `setTimeout` and a `clearTimeout`; adding a dependency for it would be a `package.json` line item, an `npm audit` line, and a Dependabot PR that cannot be justified.
- **D-17:** The debounce delay is 300ms — long enough that a normal typing burst fires one request, short enough that the result feels immediate. Recorded here as a decision, not a magic number.

### Pagination controls

- **D-18:** `<Link href={...}>` for previous/next, not `router.push` — server-rendered pagination is refresh-safe and works without JavaScript running. `hasNextPage` and `page` come straight from `SearchResult`.
- **D-19:** "Previous" is disabled on page 1; "Next" is disabled when `!hasNextPage`. Both use the `aria-disabled` attribute rather than being removed from the DOM, so the tab order and reading order are stable across pages.
- **D-20:** No page number strip — one previous, one next, and the current page displayed as "X / Y" text where Y is derived from `Math.min(totalCount, SEARCH_MAX_RESULTS)`. A strip is more code and more test cases for no reviewer benefit here.

### Japanese UI copy, English code (I18N-01)

- **D-21:** All user-facing strings are Japanese: labels, placeholders, buttons, empty states, error messages, page titles, and every `aria-label`. All identifiers, types, file names, comments, commit messages, and test names remain English.
- **D-22:** Strings are colocated with the component that renders them — not centralised in an `i18n.ts` module. Rationale: a reviewer opening a component finds its copy immediately, and there is one language, so a translation table would be dead code.
- **D-23:** Error messages are actionable in Japanese, not translated jargon. The rate-limit message says when to retry; the empty-state message says what to try next.

### Testing surface

- **D-24:** Tests mock `@/lib/github/search`, never the real GitHub API and never `fetch` directly. Phase 1 exercises `githubFetch` at the network boundary; this phase exercises the page and components against a mocked capability unit.
- **D-25:** Component tests cover the happy path and at least the two failure paths a user is most likely to hit — an empty result set (D-12) and a rate-limited response (D-11). This is the roadmap floor (Phase 2 SC #7), not the ceiling.
- **D-26:** Tests query by role and accessible name, per `docs/TESTING.md`. Never a snapshot-only test, never a query for a class name.

### Claude's Discretion

- Internal component decomposition beyond the boundaries fixed above (a `SearchForm` client component, a `ResultList` server component, a `Pagination` server component are natural — exact names and file layout are Claude's to decide inside `src/components/`).
- Whether the `useDebounce` implementation is a small custom hook or the React 19 pattern with `useDeferredValue`/`useTransition`. Both satisfy D-15/D-16. Pick and record the reason.
- Tailwind class layout inside components. Design is explicitly not graded — the constraint is legibility on a phone and a laptop, not visual polish. Phase 4 owns responsiveness formally.
- Exact copy for the empty-state and rate-limit panels, provided the copy honours D-11, D-12, D-14, and D-23.

</decisions>

<specifics>
## Specific Ideas

- **The search route is `/`.** `src/app/page.tsx` is the search page. It reads `searchParams.q` and `searchParams.page`, calls `searchRepositories()` on the server, and renders the results plus pagination. There is no separate `/search` route; that would create two ways to reach the same view.
- **A result row shows: name, owner login, primary language (or a `-` when null), and star count.** Roadmap SC #1 lists these four for the list view. Owner avatar is a Phase 3 concern — remote images need `images.remotePatterns` configured, which is SEC-02 in Phase 3, so avatars ship on the detail page rather than the list.
- **Each result row is wrapped in a `next/link`** pointing at `/repos/${owner}/${name}?from=<current search url encoded>`. Phase 3 builds the destination route; this phase provides only the link.
- **`INVALID_QUERY` for out-of-range page is only reachable by hand-editing the URL** because pagination controls clamp to `hasNextPage`. It still needs its own message — a reviewer probing `?page=99999` should get "beyond the searchable page range", not "please enter a keyword".
- **A stale rate-limit reset can still render an OK message.** `resetAt` is Unix seconds; the UI derives "N minutes" from `Math.max(0, Math.ceil((resetAt - now)/60))`. When the reset is in the past, "リトライ可能" ("retry now possible") is the honest answer, not a negative number.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Rules and constraints
- `AGENTS.md` — Japanese UI/English code, `dangerouslySetInnerHTML` banned, no `NEXT_PUBLIC_` token, tests colocated, agent never merges
- `.planning/REQUIREMENTS.md` — SRCH-01..05, UX-01..04, I18N-01
- `.planning/ROADMAP.md` §Phase 2 — the 7 success criteria plus the Definition of Done

### Architecture and boundaries
- `docs/ARCHITECTURE.md` — App Router flow, the boundary rules between `src/lib/github/`, `src/app/`, and `src/components/`
- `docs/TESTING.md` — the five failure modes, the mocking boundary at `@/lib/github/search`, and coverage rules

### Operations and security
- `docs/OPERATIONS.md` — rate-limit headroom as the leading signal, timeout policy, no retry on rate-limit
- `docs/SECURITY.md` — token handling, URL construction rules, the response-header plan (headers themselves are Phase 4)

### Phase 1 handoff (the sealed contract this phase consumes)
- `src/lib/github/search.ts` — `searchRepositories(query, page)` returning `Result<SearchResult>` and throwing `GitHubRequestError`; exports `SEARCH_PER_PAGE` and `SEARCH_MAX_RESULTS`
- `src/lib/github/errors.ts` — `GitHubFailure`, `Result`, `GitHubRequestError`
- `src/types/github.ts` — `RepoSummary`, `SearchResult`
- `.planning/phases/01-github-api-client/01-CONTEXT.md` — the failure-model reasoning (D-01..D-08) this phase renders

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets

- **`src/lib/github/search.ts`** — the capability unit. Consumed unchanged. Its `Result` is destructured on `ok`; its throw is the path to `error.tsx`.
- **`src/lib/github/errors.ts`** — the failure vocabulary. `RATE_LIMIT` carries `resetAt`; `INVALID_QUERY` and `NOT_FOUND` are empty; `GitHubRequestError` is what reaches `error.tsx`.
- **`src/types/github.ts`** — `RepoSummary` (list-row shape), `SearchResult` (page shape with `hasNextPage`).
- **The existing `src/app/page.tsx`** — the create-next-app landing page. Replaced wholesale by this phase's search page.
- **The existing `src/app/page.test.tsx`** — a smoke test that renders `Home()` and expects an `h1`. Replaced by the search page's colocated tests.
- **`src/app/layout.tsx`** — the root layout with `lang="en"` and the "Create Next App" metadata. This phase sets `lang="ja"` and gives the app a Japanese title.

### Established patterns

- **Test harness**: Vitest + React Testing Library (jsdom), 100% coverage on the Phase 1 boundary, mocked at `@/lib/github/*`. This phase mocks the same module boundary — never `fetch` and never the real GitHub API.
- **Boundary lint rules**: `src/eslint-rules.test.ts` proves the `dangerouslySetInnerHTML` ban and the "no client import of `src/lib/github/`" rule fire. Both continue to hold in Phase 2.
- **Structured JSON logging** through `src/lib/github/log.ts`. This phase adds no new log call — every GitHub call still flows through `githubFetch`, which already logs.
- **Zero production dependencies** beyond Next/React. D-15 keeps it that way — no debounce library.

### Integration points

- The GitHub client is imported as `@/lib/github/search` in server components and mocked at the same specifier in tests.
- `.env.example` already documents `GITHUB_TOKEN` as server-side only; no change here.
- CI already runs the full gate on every PR.

</code_context>

<deferred>
## Deferred Ideas

- **Repository detail page** (`/repos/[owner]/[repo]`) — Phase 3. This phase links into it.
- **Owner avatars in the list** — deliberately not shipped in the list view. Avatars need `images.remotePatterns` (SEC-02, Phase 3), and the roadmap SC #1 does not require an avatar on a list row (only on the detail view — DTL-02).
- **Keyboard-operable audit, mobile responsiveness, E2E happy-path spec** — Phase 4. Component tests here cover the happy path plus two failure paths; end-to-end coverage is Phase 4's job.
- **Security response headers and CSP** — Phase 4. This phase must not add its own CSP.
- **Raising coverage thresholds** — Phase 4, once every route is in place.
- **README `subscribers_count` note** — Phase 4 (carried in STATE.md pending todos, not a Phase 2 concern).

</deferred>

---

*Phase: 02-search-experience*
*Context gathered: 2026-08-02*
