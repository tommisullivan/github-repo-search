# Phase 1: GitHub API Client - Context

**Gathered:** 2026-08-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Every GitHub read flows through one typed, server-side client that fails in predictable, named ways. This phase builds `src/lib/github/` and `src/types/github.ts` only — no routes, no components, no UI. Phases 2 and 3 consume what this phase exports.

Requirements: API-01, API-02, API-03, API-04, API-05, TEST-01, OBS-01, OBS-02, OBS-03, SEC-03.

</domain>

<decisions>
## Implementation Decisions

### Failure signalling

- **D-01:** Hybrid model. Expected failures return a typed `Result` the caller renders inline; a missing repository calls Next's `notFound()`; only genuinely unexpected faults throw and reach `error.tsx`.
- **D-02:** Expected failures (returned, never thrown): rate limit (403/429), invalid or empty query (422 class), and empty result sets. These are normal states of a working app, not exceptions.
- **D-03:** Unexpected failures (thrown): transport faults and unrecognised status codes. These reach the App Router error boundary.
- **D-04:** Rationale, and the reason not to simply throw everything: **in production Next sanitises server errors before the client error boundary receives them.** Branching on error type inside `error.tsx` is therefore unreliable, and per-state UI (rate limit vs no results) would silently degrade to a generic message in production while working in development — a bug class that only appears after deployment.

### Error vocabulary and language

- **D-05:** The client returns stable machine-readable codes — `RATE_LIMIT`, `NOT_FOUND`, `INVALID_QUERY`, `NETWORK`. It returns no user-facing prose.
- **D-06:** Japanese strings live in the UI layer (Phase 2+), which maps code → message. The client stays presentation-free.
- **D-07:** Consequences that make this the right split: the client is testable without asserting on Japanese prose; translations sit beside the components that render them, where a reviewer will look; and the same code can drive different copy in different contexts.
- **D-08:** `RATE_LIMIT` carries the reset time from `x-ratelimit-reset` so the UI can say *when* to retry, not merely that it failed.

### Caching

- **D-09:** Search results revalidate after **60 seconds**; repository detail after **300 seconds**.
- **D-10:** Rationale: search results shift as repositories are created and starred, so a minute is the tolerable staleness; detail changes slowly and is the page most likely to be reloaded during review. Different windows because the two have genuinely different volatility — a single number would be wrong for one of them.
- **D-11:** Implemented with Next's `fetch` cache (`next: { revalidate }`), not a cache service. No infrastructure.

### Pagination

- **D-12:** 20 results per page (`per_page=20`).
- **D-13:** Rationale: substantial without endless scrolling, small payload, and it exercises pagination naturally inside GitHub's 1000-result ceiling. GitHub's own default of 30 produces a longer scroll for no benefit here.
- **D-14:** The client accepts a page parameter and surfaces total count so Phase 2 can render pagination without a second call.

### Missing token

- **D-15:** When `GITHUB_TOKEN` is absent the app runs unauthenticated and logs **one** server-side info line at startup noting the reduced limit (~10 searches/minute).
- **D-16:** No user-facing notice. An end user cannot act on it, and it leaks deployment detail into the interface. A reviewer who hits the limit finds the explanation in the logs.

### Logging

- **D-17:** `console.log` with `JSON.stringify` — no logging dependency. Satisfies OBS-01 in full; Next already writes to stdout.
- **D-18:** Chosen over pino because `AGENTS.md` requires preferring the platform over a library, and a read-only app with one upstream does not need levels, transports, or redaction machinery.

### Claude's Discretion

- Internal module structure within `src/lib/github/`, beyond the boundary rules already fixed in `docs/ARCHITECTURE.md`.
- Exact TypeScript shapes of the `Result` type and the response interfaces.
- Test file organisation and fixture design, within the standards in `docs/TESTING.md`.
- Whether the request timeout uses `AbortSignal.timeout()` or an equivalent, provided a timeout exists.

</decisions>

<specifics>
## Specific Ideas

- **Watchers must come from `subscribers_count`.** GitHub's REST `watchers_count` is a duplicate of `stargazers_count`; using the obvious field renders two identical numbers and reads as a bug. The detail type must expose the correct value, and the naming should make the trap visible to the next reader.
- **A rate limit must never be presentable as "no results".** These are opposite meanings. The code vocabulary in D-05 exists so the UI cannot conflate them.
- **Quota headroom is logged on every call.** `x-ratelimit-remaining` is this app's one leading indicator of failure — see `docs/OPERATIONS.md`.
- **Cache hits complicate that reading.** A cached response carries the headers from when it was cached, so its rate-limit numbers are historical. Confirm the actual behaviour during implementation and do not treat a cached value as live headroom.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture and boundaries
- `docs/ARCHITECTURE.md` — module layout for `src/lib/github/`, the named functions, the boundary-rules table (what each unit owns, may depend on, must not touch), and the rejected alternatives
- `AGENTS.md` — coding standards, the non-negotiable assignment constraints, and the resilience/security rules that bind code

### Operations
- `docs/OPERATIONS.md` — what every GitHub call logs, rate-limit headroom as the key signal, the timeout and no-retry-on-rate-limit policy, and what must never be logged

### Security
- `docs/SECURITY.md` — token handling, URL construction rules, and the attack-surface table

### Testing
- `docs/TESTING.md` — the three test layers, mocking at the `fetch` boundary, and the five failure modes every feature must cover

### Requirements
- `.planning/REQUIREMENTS.md` — API-01..05, TEST-01, OBS-01..03, SEC-03
- `.planning/ROADMAP.md` §Phase 1 — the nine success criteria, plus the Definition of Done that applies to every phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

None. `src/` contains only the create-next-app scaffold (`layout.tsx`, `page.tsx`, `page.test.tsx`, `globals.css`). `src/lib/` and `src/types/` do not exist yet — this phase creates them.

### Established Patterns

- **Test harness is working and proven**: Vitest + React Testing Library, colocated `*.test.tsx` under `src/`, coverage thresholds at 70%, network mocked at the boundary. Phase 1 tests follow it rather than introducing anything new.
- **TypeScript `strict` with no escape hatches** — no `any`, no `@ts-ignore`, no non-null `!`.
- **Node 24.18.1** pinned in `.nvmrc` and enforced by `engines`.
- **Zero production dependencies beyond Next/React.** D-17 keeps it that way.

### Integration Points

- `src/app/page.tsx` is still the scaffold page; Phase 2 replaces it and becomes the first consumer of `searchRepositories()`.
- `.env.example` already documents `GITHUB_TOKEN` as optional and server-side only — this phase makes it functional.
- CI already runs the full gate on every PR, so Phase 1 code is verified the moment it opens one.

</code_context>

<deferred>
## Deferred Ideas

- **UI rendering of every error state** — Phase 2 (search) and Phase 3 (detail). This phase only defines the vocabulary.
- **Japanese message copy** — Phase 2, where the strings live with their components.
- **Debounced input / no request per keystroke (SRCH-05)** — Phase 2; a UI concern, not a client one.
- **`images.remotePatterns` avatar allowlist (SEC-02)** — Phase 3, when avatars are first rendered.
- **Security response headers and CSP (SEC-01)** — Phase 4.
- **Raising coverage thresholds (TEST-04)** — Phase 4, once there is real code to cover.

</deferred>

---

*Phase: 01-github-api-client*
*Context gathered: 2026-08-02*
