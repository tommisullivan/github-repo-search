<!-- generated-by: gsd-doc-writer -->
# Architecture

How this app is put together and why. Decisions that were considered and rejected are recorded here too — for a selection task, the reasoning is part of the deliverable.

> **Read this as a design contract, not a description of finished code.** At the time of writing, the repository contains the scaffold, the test harness, the CI quality gate, **and the GitHub boundary (`src/lib/github/`, `src/types/github.ts`) delivered in Phase 1**. The search route, the detail route, and the components are specified here and built in the phases named below. Everything in this document is tagged so intent is never mistaken for reality.

## Build status legend

| Tag | Meaning |
|---|---|
| **Built** | Exists in the repository today and is exercised by `npm test` / `npm run build` / CI |
| **Planned · Phase N** | Specified here, not yet written. `N` is the delivery phase it lands in |

Delivery phases, in execution order:

| Phase | Delivers |
|---|---|
| 0 | Scaffold, test harness, CI quality gate, this document — **complete** |
| 1 | The GitHub boundary: typed client, the failure vocabulary, token handling, caching, structured logging — **complete** |
| 2 | Search experience: URL-as-state, result list, pagination, loading/empty/error/rate-limit states |
| 3 | Repository detail page on its own route, plus not-found handling |
| 4 | Accessibility, responsive layout, E2E coverage, coverage threshold, reviewer-facing docs |

## Shape of the system

This is a **stateless read-through client for the GitHub REST API**. There is no database, no session, and no user identity. Every view is derived from a GitHub response; nothing is owned locally.

```mermaid
flowchart LR
    U["Browser"] -->|"GET /?q=next&page=1"| SP["Search page<br/>Server Component<br/>Planned · Phase 2"]
    U -->|"GET /repos/OWNER/REPO"| DP["Detail page<br/>Server Component<br/>Planned · Phase 3"]
    SP --> GC["GitHub boundary<br/>src/lib/github<br/>Built · Phase 1"]
    DP --> GC
    GC -->|"fetch + force-cache + revalidate"| API[("GitHub REST API")]
    GC -->|"returns Result — RATE_LIMIT · NOT_FOUND · INVALID_QUERY"| SP
    GC -.->|"throws GitHubRequestError — NETWORK"| EB["error.tsx · not-found.tsx<br/>Planned · Phases 2-3"]

    classDef planned stroke:#b26a00,stroke-width:1px,stroke-dasharray:5 5
    class SP,DP,EB planned
```

The browser never calls GitHub directly. Both routes are Server Components that call the boundary module on the server, which means the optional token never reaches the client bundle and there is no client-side API layer to maintain.

Dashed borders in every diagram below mean **Planned**; solid borders mean **Built**.

## Directory layout

```
src/
  app/
    layout.tsx                      Built          Root layout, fonts, globals
    page.tsx                        Built          Currently the create-next-app scaffold page.
                                                   Becomes Search in Phase 2.
    page.test.tsx                   Built          Scaffold smoke test; replaced in Phase 2
    globals.css                     Built          Tailwind v4 entry point
    loading.tsx                     Planned P2     Search loading state
    error.tsx                       Planned P2     Search error boundary
    repos/[owner]/[repo]/
      page.tsx                      Planned P3     Detail — its own route, never a modal
      loading.tsx                   Planned P3
      error.tsx                     Planned P3
      not-found.tsx                 Planned P3     Unknown owner/repo
  components/                       Planned P2-P3  Directory does not exist yet
    SearchForm.tsx                  Planned P2     Client Component — the only interactive island
    RepoList.tsx  RepoCard.tsx      Planned P2
    Pagination.tsx                  Planned P2
    RepoDetail.tsx                  Planned P3
  lib/github/                       Built          The GitHub boundary
    client.ts                       Built          githubFetch({ path, endpoint, revalidate }) —
                                                   base URL, headers, auth, cache opt-in,
                                                   5s timeout, retry policy, the log line
    errors.ts                       Built          Result<T>, GitHubFailure, GitHubRequestError,
                                                   toFailure() / toRequestError()
    log.ts                          Built          logGitHubCall() / logUnauthenticatedOnce() —
                                                   one JSON line per call, closed field set
    search.ts                       Built          searchRepositories(query, page?)
    repo.ts                         Built          getRepository(owner, repo)
  types/
    github.ts                       Built          Payload shapes (snake_case) and the
                                                   domain shapes that cross the boundary

e2e/
  smoke.spec.ts                     Built          Playwright smoke spec
  home.a11y.spec.ts                 Built          axe accessibility spec

.github/workflows/ci.yml            Built          Quality gate (see below)
```

Unit and component tests are colocated as `*.test.ts(x)` beside their subject under `src/`; Playwright specs live in `e2e/`. The `@/*` path alias maps to `./src/*` (`tsconfig.json`).

## Structural view — components, modules, and functions

Nothing on the left of the boundary knows how GitHub is called; nothing on the right of it knows React exists.

```mermaid
flowchart TD
    subgraph client["Browser · client bundle"]
        SF["SearchForm<br/>Client Component<br/>submits by navigating"]
    end

    subgraph routes["src/app · Server Components"]
        SP["Search page<br/>reads q and page from searchParams"]
        DP["Detail page<br/>reads owner and repo from params"]
        EB["error.tsx · loading.tsx · not-found.tsx"]
    end

    subgraph ui["src/components · presentation only, no fetching"]
        RL["RepoList"]
        RC["RepoCard"]
        PG["Pagination"]
        RD["RepoDetail"]
    end

    subgraph gh["src/lib/github · the GitHub boundary"]
        subgraph unitS["Search capability — owns /search/repositories"]
            SR["search.ts<br/>searchRepositories(q, page)"]
        end
        subgraph unitR["Repository capability — owns /repos/OWNER/REPO"]
            GR["repo.ts<br/>getRepository(owner, repo)"]
        end
        subgraph core["Shared HTTP and error core"]
            CF["client.ts<br/>githubFetch({ path, endpoint, revalidate })"]
            ER["errors.ts<br/>toFailure(response)<br/>toRequestError(cause, status?)"]
            LG["log.ts<br/>logGitHubCall(entry)<br/>logUnauthenticatedOnce()"]
        end
    end

    API[("GitHub REST API")]

    SF -->|"router navigation"| SP
    SP --> SF
    SP --> RL
    SP --> PG
    RL --> RC
    RC -->|"next/link"| DP
    DP --> RD

    SP -->|"await"| SR
    DP -->|"await"| GR
    SR --> CF
    GR --> CF
    CF --> ER
    CF --> LG
    CF -->|"fetch, Accept: application/vnd.github+json"| API
    SR -->|"Result — INVALID_QUERY · RATE_LIMIT"| SP
    GR -->|"Result — NOT_FOUND · RATE_LIMIT"| DP
    SR -.->|"throws GitHubRequestError"| EB
    GR -.->|"throws GitHubRequestError"| EB

    classDef planned stroke:#b26a00,stroke-width:1px,stroke-dasharray:5 5
    class SF,SP,DP,EB,RL,RC,PG,RD planned
```

Everything inside `src/lib/github` is **Built** (Phase 1); everything in `src/app` and `src/components` is still **Planned**. What occupies the `Search page` slot today is the scaffold `layout.tsx` / `page.tsx` pair, until Phase 2 replaces it.

**`githubFetch` takes one options object, not `(path, init)`.** `endpoint` and `revalidate` are not `RequestInit` members, and — the reason that decides it — an `init` parameter would invite a caller to pass its own `cache`, silently undoing the caching guarantee the client exists to hold (API-05). The window is the caller's; the cache opt-in is the client's, and it is not reachable from the outside.

## API boundary segregation

`src/lib/github` is not one blob with two functions in it. It is **two independent capability units sitting on a shared HTTP and error core**, and the seams between them are the point.

```mermaid
flowchart TB
    subgraph consumers["Consumers"]
        C1["Search page"]
        C2["Detail page"]
    end

    subgraph boundary["src/lib/github — boundary"]
        direction LR
        subgraph U1["Search unit"]
            direction TB
            F1["searchRepositories(query, page?)"]
            T1["SearchResult · RepoSummary"]
            G1["guard: reject empty query<br/>and out-of-range page<br/>before any request"]
        end
        subgraph U2["Repository unit"]
            direction TB
            F2["getRepository(owner, repo)"]
            T2["RepoDetail"]
            G2["maps subscribers_count<br/>to watchers"]
        end
        subgraph CORE["Shared core — stateless"]
            direction TB
            F3["githubFetch({ path, endpoint, revalidate })"]
            F4["toFailure(response) → GitHubFailure or null"]
            F5["toRequestError(cause, status?) → GitHubRequestError"]
            F6["logGitHubCall(entry)"]
        end
    end

    C1 --> U1
    C2 --> U2
    U1 --> CORE
    U2 --> CORE
    CORE --> EXT[("GitHub REST API")]

    classDef planned stroke:#b26a00,stroke-width:1px,stroke-dasharray:5 5
    class C1,C2 planned
```

**Boundary rules.** These are enforceable by reading the imports of any file in `src/lib/github`:

| Unit | Owns | May depend on | Must not |
|---|---|---|---|
| **Search unit** (`search.ts`) | The `search/repositories` endpoint, its query construction, its 1000-result cap and `per_page` limits, and the `SearchResult` / `RepoSummary` mapping | `client.ts`, `errors.ts`, `types/github.ts` | Import `repo.ts`, call `getRepository()`, or know anything about the detail endpoint's shape |
| **Repository unit** (`repo.ts`) | The `repos/{owner}/{repo}` endpoint, path encoding of owner/repo, the `subscribers_count` → watchers mapping, and the `RepoDetail` mapping | `client.ts`, `errors.ts`, `types/github.ts` | Import `search.ts`, call `searchRepositories()`, or assume a search result was fetched first |
| **Shared core** (`client.ts`, `errors.ts`, `log.ts`) | Base URL, `Accept` header, optional `Authorization`, the cache opt-in and timeout, the retry policy, HTTP-status-to-failure-code mapping, and the log line | Nothing inside the units | Import either unit, or contain any endpoint-specific logic |
| **Components / routes** | Rendering | The two units' exported functions and types | Call `githubFetch()` directly, construct GitHub URLs, or interpret raw HTTP status codes |

Three properties follow, and they are the reason the seams are drawn this way:

1. **No shared mutable state.** The core holds no cache object, no client instance, no in-flight map. `githubFetch` is a pure function over its arguments; caching is delegated to Next's fetch cache, which is keyed by request, not by module state. Two concurrent renders cannot interfere.
2. **No cross-calling between units.** Search never reaches into repository detail and vice versa. A detail page loaded directly by URL performs exactly one GitHub read and needs no prior search.
3. **Each unit is independently replaceable.** Swapping the search unit for the GraphQL API, or stubbing the repository unit in a test, touches one file and its type export. Nothing else in the tree has to change, because nothing else knows how either endpoint works.

The rules are a code-review checklist, not decoration: an import of `search.ts` inside `repo.ts` (or of `client.ts` inside a component) is a boundary violation and should be rejected in review.

## Request sequences

### Search — `GET /?q=next&page=2`

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser
    participant P as Search page
    participant S as search.ts
    participant C as client.ts
    participant E as errors.ts
    participant G as GitHub REST API

    U->>P: navigate with q and page in the query string
    P->>S: searchRepositories(q, page)
    S->>S: guard — blank query, or a page past the 1000-result<br/>ceiling, returns { ok: false, INVALID_QUERY }, no request
    S->>C: githubFetch({ path: "/search/repositories?q=...&page=2",<br/>endpoint, revalidate: 60 })
    C->>G: fetch — Accept header, optional server-side token,<br/>force-cache + revalidate, AbortSignal.timeout(5000)

    alt 200 OK
        G-->>C: JSON payload
        C-->>S: { ok: true, data } typed as GitHubSearchPayload
        S-->>P: { ok: true, data: SearchResult }
        P-->>U: RepoList and Pagination, or the empty state when items is 0
    else 403 or 429 with rate-limit headers
        G-->>C: rate-limited response
        C->>E: toFailure(response)
        E-->>C: { code: "RATE_LIMIT", resetAt }
        C-->>S: { ok: false, error } — returned, not thrown
        S-->>P: { ok: false, error } — returned unchanged
        P-->>U: rate-limit state rendered inline — "try again at HH:MM"
    else 422 validation
        G-->>C: 422
        C->>E: toFailure(response)
        E-->>C: { code: "INVALID_QUERY" }
        C-->>S: { ok: false, error }
        S-->>P: { ok: false, error }
        P-->>U: guidance to refine the query, rendered inline
    else transport fault, 5s timeout, any 5xx, or malformed JSON
        C->>E: toRequestError(cause, status?)
        E-->>C: GitHubRequestError — code NETWORK
        C-->>S: throw
        S-->>P: throw — no try/catch in the unit
        P-->>U: error.tsx — generic retry message
    end
```

### Detail — `GET /repos/OWNER/REPO`

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser
    participant D as Detail page
    participant R as repo.ts
    participant C as client.ts
    participant E as errors.ts
    participant G as GitHub REST API

    U->>D: open or refresh the detail URL directly
    D->>R: getRepository(owner, repo)
    R->>R: guard — blank owner or repo returns<br/>{ ok: false, NOT_FOUND }, no request
    R->>C: githubFetch({ path: "/repos/OWNER/REPO",<br/>endpoint, revalidate: 300 })
    C->>G: fetch — Accept header, optional server-side token,<br/>force-cache + revalidate, AbortSignal.timeout(5000)

    alt 200 OK
        G-->>C: JSON payload
        C-->>R: { ok: true, data } typed as GitHubRepoDetailPayload
        R->>R: map subscribers_count to watchers
        R-->>D: { ok: true, data: RepoDetail }
        D-->>U: RepoDetail component — name, avatar, language, stars, watchers, forks, open issues
    else 404
        G-->>C: 404
        C->>E: toFailure(response)
        E-->>C: { code: "NOT_FOUND" }
        C-->>R: { ok: false, error } — returned, not thrown
        R-->>D: { ok: false, error } — returned unchanged
        D->>D: the page branches on the code and calls notFound() itself
        D-->>U: not-found.tsx
    else 403 or 429 with rate-limit headers
        G-->>C: rate-limited response
        C->>E: toFailure(response)
        E-->>C: { code: "RATE_LIMIT", resetAt }
        C-->>R: { ok: false, error }
        R-->>D: { ok: false, error }
        D-->>U: rate-limit state rendered inline — never the not-found page
    else transport fault, 5s timeout, any 5xx, or malformed JSON
        C->>E: toRequestError(cause, status?)
        E-->>C: GitHubRequestError — code NETWORK
        C-->>R: throw
        R-->>D: throw — no try/catch in the unit
        D-->>U: error.tsx — generic retry message
    end
```

The detail sequence starts from a bare URL on purpose: it is the proof that the detail view is a real route with its own data fetch, not a modal reading state left behind by a search.

## Key decisions

### Server Components fetch the data

Rendering happens on the server, so the GitHub call happens there too. This keeps `GITHUB_TOKEN` server-side by construction rather than by discipline, removes a whole client-side fetching layer, and means the detail page is directly linkable and refreshable with no hydration dance.

`SearchForm` is the one Client Component — it needs input state. It submits by navigating, so results come from the server.

### URL is the state

The keyword and page number live in the query string (`/?q=next&page=2`), not React state.

This is the decision that most affects usability, which is what the brief says is graded. Results become shareable, the back button behaves, refresh preserves what you were looking at, and the server can render the correct page on first request. It also removes the need for any state management library, and it is what lets a user return from the detail page to their results with the keyword and page intact.

### Typed errors, distinct UI

`errors.ts` maps HTTP status to a stable machine-readable code rather than letting raw responses escape the boundary. The vocabulary is four codes, and **how each one travels is part of the contract** (D-01..D-05a):

| Condition | Code | How it travels | What the user sees |
|---|---|---|---|
| 403/429 with rate-limit headers | `RATE_LIMIT`, carrying `resetAt` (unix seconds) | **Returned** — `{ ok: false, error }` | "GitHub rate limit reached — try again at HH:MM", rendered inline |
| 404 on `repos/{owner}/{repo}` | `NOT_FOUND` | **Returned** | The page branches on the code and calls `notFound()` itself |
| 422, or a blank query / out-of-range page caught before the request | `INVALID_QUERY` | **Returned** | Guidance to refine the query, rendered inline |
| Transport fault, 5s timeout, **any** 5xx, or malformed JSON | `NETWORK`, on a thrown `GitHubRequestError` | **Thrown** | `error.tsx` — generic retry message |

Both capability units therefore have a **dual contract**: `searchRepositories()` and `getRepository()` return a `Result` **and** may throw. A caller that handles only `ok: false` is incomplete.

#### Why the split, and why not simply throw everything

This is the strongest single decision in the phase, and it is not a style preference.

**In production, Next sanitises server errors before the client error boundary receives them.** An `error.tsx` gets a generic `Error` with a digest, not the class or the fields the server threw. So branching on error type inside `error.tsx` is unreliable: per-state UI — a rate-limit message with a reset time, versus "refine your keyword" — would work in development and silently degrade to one generic message after deployment. That is a bug class that only appears in production, which is the worst kind to design in.

The states that need distinct UI are therefore **returned as values** and rendered by the page that asked for them, where the data is still intact. `NETWORK` is the one case where nothing is lost by throwing, because no branching is needed: a generic retry message is the correct and complete answer for a transport fault, a timeout, or a 5xx.

The failure modes are genuinely different and collapsing them is the common mistake: a rate-limited search that renders as "no results found" is actively misleading, and it is the state a reviewer is most likely to hit. Empty results are `{ ok: true }` with an empty list — structurally impossible to confuse with `{ ok: false, RATE_LIMIT }`. Every branch of this mapping has a named unit test (Phase 1, TEST-01).

### Caching instead of infrastructure

Rate-limit pressure is handled by Next's fetch cache with `revalidate`, not by a cache service. Repeated searches and detail views inside the window cost zero API calls. One line, no container, no failure mode — and no cache state living inside the boundary modules.

Search revalidates after 60s and detail after 300s (D-09): results shift as repositories are created and starred, while detail changes slowly and is the page most likely to be reloaded during review. A single number would be wrong for one of them. The **cache opt-in belongs to `githubFetch`**, not to the units — the units pass only a window, so a future edit cannot accidentally drop the caching. That this configuration actually caches was **measured, not assumed**: six renders through the shipped client produced one upstream request. See [OPERATIONS.md § Measured](./OPERATIONS.md#measured-what-the-fetch-cache-does-to-this-signal).

### `subscribers_count` for watchers

A GitHub API quirk worth stating plainly: REST `watchers_count` is a **duplicate of `stargazers_count`**. The real watcher count is `subscribers_count`, and it is only present on the detail endpoint.

The brief lists stars and watchers as separate required fields, so using the obvious field would render two identical numbers and look like a bug. The detail page uses `subscribers_count` for watchers, the mapping lives inside the repository unit (nowhere else needs to know), and the README says so.

## Rejected alternatives

| Considered | Rejected because |
|---|---|
| **MongoDB / any database** | Nothing to persist — GitHub owns the data. Local setup is currently `npm install && npm run dev` with zero services; a DB would add a container, a connection string, and a seed step to solve a problem the app does not have. Unnecessary infrastructure is the clearest over-engineering signal in a code review. |
| **GitHub OAuth / user accounts** | Not in the brief. Searching public repositories needs no identity. Inventing scope costs review credibility and adds real security surface. |
| **Client-side fetching (SWR / React Query)** | Would force the token into the browser or require a proxy route to avoid it. Server Components solve both for free. Sensible if this app had heavy client-side interactivity; it does not. |
| **Route Handlers as an API layer** | A `/api/*` proxy in front of a Server Component that could call GitHub directly is an indirection with no consumer. Would be justified only if the client needed to fetch. |
| **Redux / Zustand** | The only state is the search keyword and page, and both belong in the URL. |
| **Throwing every failure, letting `error.tsx` branch on the type** | The simpler-looking model, and it fails where it cannot be seen. In production Next sanitises server errors before the client error boundary receives them, so the error's type and fields are not available to `error.tsx`. The distinct rate-limit and empty-result states the brief cares about would work in development and collapse into one generic message once deployed. Rate limit, not found and invalid query are therefore returned as values; only `NETWORK`, which needs no branching, throws. |
| **`githubFetch(path, init)` — a `RequestInit` passthrough** | `endpoint` and `revalidate` are not `RequestInit` members, and an `init` parameter invites a caller to pass its own `cache`, silently undoing the caching guarantee (API-05). The options object keeps the opt-in unreachable from outside the client. |
| **A logging library (`pino`)** | A read-only app with one upstream needs no levels, transports, or redaction machinery, and Next already writes stdout. `console.log` with `JSON.stringify` satisfies OBS-01 in full for zero dependencies (D-17, D-18). |
| **A configurable `GITHUB_API_BASE_URL`** | A one-variable token-exfiltration path: anyone who can set an environment variable redirects the `Authorization` header to a host they control. A temporary reverted source edit buys identical test coverage with no attack surface — see [OPERATIONS.md](./OPERATIONS.md). |
| **Modal for repository detail** | Explicitly forbidden by the brief. |
| **A component library (shadcn/ui)** | Permitted but optional. Design is not graded, and hand-written components keep the diff small and readable for reviewers. |

## Toolchain

All **Built** — this is the current state of the repository.

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node **24.18.1**, pinned in `.nvmrc`, `engines` requires `>=22` | Next 16 needs `>=20.9`, but Node 20 reached end-of-life in April 2026. Node 24 is supported until April 2028 |
| Framework | **Next.js 16.2.12**, App Router only | No `pages/` directory, ever |
| UI | **React 19.2.4** | Server Components by default |
| Language | **TypeScript** with `strict: true` | No `any`, no `@ts-ignore`, no non-null `!` to silence the compiler |
| Styling | **Tailwind CSS v4** via `@tailwindcss/postcss` | `src/app/globals.css` is the entry point |
| Unit / component tests | **Vitest 4** + React Testing Library, jsdom | `vitest.config.mts`, setup in `vitest.setup.ts` |
| E2E / a11y | **Playwright** + `@axe-core/playwright` | `playwright.config.ts`, port 3100, builds and starts the app |
| Coverage | v8 provider, thresholds at 70% lines/functions/branches/statements | Raised as real code lands — Phase 4 |
| Dependencies | `npm audit` at **0 vulnerabilities** | `overrides` raise `postcss` to `^8.5.25` and `sharp` to `^0.35.3` inside `next`, both of which ship with advisories at the pinned versions. npm `overrides` do not apply to an already-installed tree — if `npm ls` reports `invalid: ... overridden`, delete `node_modules` and `package-lock.json` and reinstall. |

`next.config.ts` is currently empty. Phase 3 adds `images.remotePatterns` for `avatars.githubusercontent.com` so `next/image` can render owner avatars.

## Local development

```bash
nvm use          # Node 24.18.1 — the machine default (18) is EOL and cannot run Next 16
npm install
npm run dev
```

No services, no containers, no database. The app is fully functional unauthenticated.

Verification commands, all of which must pass before any work is called done:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`GITHUB_TOKEN` is optional. Unauthenticated GitHub search allows ~10 requests/minute; a token raises that to ~30/min and lifts the core REST limit from 60/hour to 5,000/hour. It is read server-side only — never `NEXT_PUBLIC_`, never committed. See `.env.example`.

## Quality gate

CI runs on every pull request and on pushes to `main` and `develop` ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)). All jobs are **Built** and run in parallel:

| Job | Checks |
|---|---|
| `quality` | ESLint, `tsc --noEmit`, Vitest with coverage, `next build` |
| `e2e` | Playwright — **GitHub API intercepted**, never called live; report uploaded as an artifact |
| `a11y` | axe against the running build (`A11Y=1 playwright test`) |
| `audit` | `npm audit --audit-level=high` |
| `secrets` | gitleaks secret scanning over full history |
| `codeql` | CodeQL SAST, `security-and-quality` query suite |

Plus Dependabot (`.github/dependabot.yml`) for dependency updates.

**Why E2E mocks the API:** CI runners share IPs and are aggressively rate-limited by GitHub. Unmocked E2E would fail intermittently for reasons unrelated to the code, and a flaky pipeline is worse than no pipeline.

**Why no DAST:** ZAP needs a deployed target, and this app has no auth, no session, no datastore, and one input that never reaches a query engine. A baseline scan would report header configuration and nothing more. It is recorded as a v2 item — something a real production deployment would add.

**One caveat, stated honestly:** every script the workflow invokes (`lint`, `typecheck`, `test:coverage`, `test:e2e`, `test:a11y`, `audit`, `build`) has been run locally and passes, but the workflow YAML itself has never executed, because no GitHub remote is configured yet. The gate is defined and locally verified, not yet observed green in CI.
