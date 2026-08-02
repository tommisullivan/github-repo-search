<!-- generated-by: gsd-doc-writer -->
# Testing

How this repository is tested, what each layer is responsible for, and the rules a change must satisfy before it is considered done.

The app is a **stateless read-through client for the GitHub REST API** ([`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)) — no database, no auth, no session. That shape decides the test strategy: almost everything worth testing is *how the app behaves when GitHub responds*, including when GitHub responds badly.

## Status of this harness

Two things are true at once, and conflating them would be dishonest:

- **The harness exists and passes.** Vitest, React Testing Library, Playwright, axe, and the coverage gate are configured and green locally.
- **The unit layer is real as of Phase 1.** `src/lib/github/` ships with 106 colocated unit tests covering every branch of the failure mapping.
- **The component layer is real as of Phases 2–3.** The search and detail views ship with colocated component tests covering their states, including the failure paths.
- **The E2E journey is real as of Phase 4.** [`e2e/search-detail.spec.ts`](../e2e/search-detail.spec.ts) drives search → results → detail → back against a production build, with the GitHub API mocked server-side (see [Mocking strategy](#mocking-strategy)).

Per the phase mapping in [`.planning/ROADMAP.md`](../.planning/ROADMAP.md): client tests in Phase 1 (TEST-01, **done**), component tests in Phases 2–3 (TEST-02, **done**), E2E search → detail in Phase 4 (TEST-03, **done**). The raised coverage threshold (TEST-04) is the remaining Phase 4 work.

## The one non-negotiable rule

**No test ever touches the live GitHub API.**

Unauthenticated GitHub search allows roughly **10 requests per minute** (core REST is 60/hour). CI runners share outbound IPs with every other project on the platform and are rate-limited aggressively, so a single live call turns the suite into a coin flip. A flaky pipeline is worse than no pipeline — it trains everyone to re-run red builds instead of reading them.

So: unit and component tests mock at the `fetch` boundary; Playwright runs start the Next server with its outbound `fetch` wrapped by a fixture-serving interceptor (see [Mocking strategy](#mocking-strategy)), and an unmatched `api.github.com` request gets a sentinel 500 — never a pass-through to the live API.

## Toolchain

| Concern | Tool | Version | Config |
| --- | --- | --- | --- |
| Unit / component runner | **Vitest** | 4.1.10 | [`vitest.config.mts`](../vitest.config.mts) |
| DOM environment | jsdom | 29.1.1 | `test.environment: "jsdom"` |
| Component rendering | @testing-library/react | 16.3.2 | — |
| User interaction | @testing-library/user-event | 14.6.1 | — |
| DOM matchers | @testing-library/jest-dom | 6.9.1 | [`vitest.setup.ts`](../vitest.setup.ts) |
| Coverage | @vitest/coverage-v8 | 4.1.10 | `test.coverage` |
| E2E | @playwright/test | 1.62.1 | [`playwright.config.ts`](../playwright.config.ts) |
| Accessibility | @axe-core/playwright | 4.12.1 | `e2e/*.a11y.spec.ts` |

### Vitest, not Jest — despite one package name

The runner is **Vitest**. There is no Jest in this repository.

`@testing-library/jest-dom` is the confusing one: it is a *matcher library*, not a Jest plugin. It ships a Vitest entry point, and [`vitest.setup.ts`](../vitest.setup.ts) imports exactly that:

```ts
import "@testing-library/jest-dom/vitest";
```

That registers `toBeInTheDocument`, `toHaveAccessibleName`, and friends on Vitest's `expect`. The same file registers an `afterEach(cleanup)` so rendered trees do not leak between tests. `tsconfig.json` lists both `vitest/globals` and `@testing-library/jest-dom` under `types`, so the matchers and globals are typed without per-file imports.

## Running the tests

### Prerequisite: the right Node

```bash
nvm use   # Node 24.18.1, from .nvmrc
```

The machine default of Node 18 is end-of-life and **cannot run Next.js 16**. Every command below assumes `nvm use` has been run in the shell first — an unexplained failure in the harness is usually this.

### Commands

Every command is defined in [`package.json`](../package.json).

| Command | What it runs |
| --- | --- |
| `npm test` | `vitest run` — unit + component tests, single pass, no coverage |
| `npm run test:watch` | `vitest` — watch mode for local development |
| `npm run test:coverage` | `vitest run --coverage` — same tests plus v8 coverage, **fails below threshold** |
| `npm run test:e2e` | `playwright test` — E2E specs only, a11y specs excluded |
| `npm run test:a11y` | `A11Y=1 playwright test` — axe specs only, E2E specs excluded |
| `npm run lint` | `eslint` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `next build` |

Vitest passthrough works as usual for narrowing a run:

```bash
npm test -- src/app/page.test.tsx        # one file
npm test -- -t "renders the landing"     # one test by name
```

Playwright builds and serves the app itself — no dev server needed:

```bash
npm run test:e2e -- --headed             # watch it drive the browser
npm run test:e2e -- --debug              # step through with the inspector
npx playwright show-report               # open the last HTML report
```

Its `webServer` runs `npm run build && npx next start --port 3100`, so the first E2E run of a session includes a production build (config allows up to 180s). Locally `reuseExistingServer` is on, so an already-running server on port 3100 is reused; in CI it is not.

### Before claiming anything is done

Per [`AGENTS.md`](../AGENTS.md), run all three after any significant change:

```bash
npm test && npm run lint && npm run typecheck
```

## Test layers

Three layers, each with a job the others should not duplicate.

```
E2E (Playwright, chromium)       search → detail navigation, real routing, real build
   ↑  few
Component (Vitest + RTL, jsdom)  what the user sees per state, including failures
   ↑  some
Unit (Vitest, jsdom)             the GitHub client and its error mapping
   ↑  many
```

### Unit — the GitHub client (TEST-01, Phase 1)

**Owns:** `src/lib/github/` — the fetch wrapper, query guarding, response typing, and above all the status-to-failure mapping described in [ARCHITECTURE.md](./ARCHITECTURE.md#typed-errors-distinct-ui). Every branch of that mapping gets a test:

- the three **returned** codes — `RATE_LIMIT` (with `resetAt`), `NOT_FOUND`, `INVALID_QUERY` — asserted on the returned `Result`, never on a rejection;
- the one **thrown** type — `GitHubRequestError`, carrying `NETWORK`, for a transport fault, the 5s timeout, **any** 5xx, and malformed JSON — asserted with `rejects.toBeInstanceOf`;
- plus the whitespace-only query that must be rejected *before* a request is made, which is asserted by `fetch` never being called, not merely by the returned code.

**The dual contract has to be tested as a dual contract.** `searchRepositories()` and `getRepository()` both return a `Result` **and** may throw. A caller — or a test — that handles only `ok: false` is incomplete and will drop a whole failure class silently, because the rejection surfaces as an unhandled promise rather than as a failed assertion. Each unit therefore carries at least one `rejects` test alongside its returned-code tests.

This is where the error matrix is nailed down, once, because every other layer renders that result rather than re-deriving it.

**Does not own:** anything visual. No rendering, no routing, no markup assertions.

### Component — search and detail views (TEST-02, Phase 3)

**Owns:** what a user actually sees for a given input, for both the happy path and the failure paths. Rendering of result cards, the seven required detail fields, the empty state, the rate-limit message, the error state, and keyboard/label correctness at the component level. The client module is not exercised here — its responses (and its typed errors) are supplied as fixtures.

**Does not own:** whether the routes wire together, whether navigation preserves the query string, or whether the production build works. Those are E2E's.

### E2E — the journey (TEST-03, Phase 4)

**Owns:** one thing that no lower layer can prove — a real browser against a real production build, entering a keyword, seeing results, clicking through to the detail route, and coming back with the search intact. Plus the fact that a detail URL opened cold renders correctly.

[`e2e/search-detail.spec.ts`](../e2e/search-detail.spec.ts) ships this as five tests against the server-side mock: the journey with `q` and `page` asserted intact in the URL after 「戻る」, the cold detail load with its `/` back-link fallback, a rate limit rendering as a rate-limit state and never as empty results, the not-found page for an unknown repository, and pagination onto the fixture set's shorter page 2. Every assertion pins a sentinel value only the fixtures can produce — notably watchers = 678, which only the `subscribers_count` mapping can supply, proving the watchers trap end to end.

**Does not own:** the rest of the error matrix. Reproducing all five failure modes through the browser would be slow and duplicative; the specs cover the ones that change navigation or are dangerously confusable (not-found, rate-limit-vs-empty). E2E runs chromium only — cross-browser matrices are not in the brief and would cost CI time for no reviewed benefit.

## Mocking strategy

**The boundary is `fetch`.** Tests replace the network, not the code under test.

```
component  →  github client  →  fetch  ←── mocked here
                                  ↑
                       everything left of this line is real
```

In Vitest, stub the global:

```ts
import { afterEach, expect, it, vi } from "vitest";
import { GitHubRequestError } from "@/lib/github/errors";
import { searchRepositories } from "@/lib/github/search";

afterEach(() => vi.unstubAllGlobals());

it("returns RATE_LIMIT when GitHub reports an exhausted quota", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "2000000000",
        },
      })
    )
  );

  const result = await searchRepositories("next");

  // Asserted on the returned value, because that is how this failure travels.
  expect(result).toEqual({
    ok: false,
    error: { code: "RATE_LIMIT", resetAt: 2000000000 },
  });
});

// The other half of the dual contract: a transport fault is the case that rejects.
it("throws GitHubRequestError when the transport fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

  await expect(searchRepositories("next")).rejects.toBeInstanceOf(GitHubRequestError);
});
```

Note what the second test also proves incidentally: the client retries a transport fault exactly once, so `fetch` is called twice here. Retry policy is asserted by **call count**, never by reading the code — `expect(fetchMock).toHaveBeenCalledTimes(2)` for a transport fault, and `1` for every HTTP response including 5xx, which is never retried.

In Playwright, the interception happens **inside the Next server**, not in the browser:

```
browser ──▶ Next server ──▶ github client ──▶ globalThis.fetch  ←── mocked here
                                                  (E2E only, E2E_GITHUB_MOCK=1)
```

`page.route()` **cannot work here**, and understanding why is understanding the app's architecture: every GitHub call is made server-side, in Server Components. The browser only ever talks to the Next server — `api.github.com` never appears in its network stack, so a browser-side route handler would register, match nothing, and let every request through to the live API while the suite stayed green.

Instead, the Playwright `webServer` ([`playwright.config.ts`](../playwright.config.ts)) starts `next start` with `E2E_GITHUB_MOCK=1`. Next's documented instrumentation hook ([`src/instrumentation.ts`](../src/instrumentation.ts)) sees the flag at server boot and installs [`src/lib/e2e/githubApiMock.ts`](../src/lib/e2e/githubApiMock.ts), which wraps the server's `globalThis.fetch`: requests to `api.github.com` are answered from the raw REST fixtures in [`src/lib/e2e/fixtures.ts`](../src/lib/e2e/fixtures.ts), an **unmatched** `api.github.com` request gets a sentinel 500 (`E2E_MOCK_UNMATCHED`) rather than a pass-through, and every other host is delegated unchanged. The real client — status mapping, header parsing, `subscribers_count` mapping — stays in the run, which is the same reason the Vitest half mocks `fetch` and not the module.

The fixtures use sentinel values that cannot exist on real GitHub (owner `e2e-fixture`, watchers 678 against 12,345 stars), so a silently-broken interceptor fails named assertions instead of passing against live data. Outside E2E the mock is inert by construction: `register()` is a no-op unless both `NEXT_RUNTIME === "nodejs"` and `E2E_GITHUB_MOCK === "1"` hold, and only the Playwright `webServer` sets the flag — `npm run dev`, `npm run build`, and production `next start` are unaffected.

Alternatives considered and rejected for the E2E layer:

- **`page.route("https://api.github.com/**")`** — browser-side only; the server-side calls never reach the browser's network stack, so it would silently intercept nothing.
- **An env-settable GitHub base URL pointing at a local mock server** — sealed by T-01-26: a configurable base URL redirects the `Authorization` header, the app's single secret, to any host an environment variable can name. See [`docs/OPERATIONS.md`](./OPERATIONS.md) § "Confirmed against the shipped client".
- **MSW** — a new dev dependency for exactly two endpoint shapes; the ~100-line wrapper on the platform covers the need with zero dependencies.

### Why the boundary and not the module

Mocking `src/lib/github` with `vi.mock` would be easier and would test less. The point of the client is its **translation** work — status codes, headers, and JSON shapes into typed errors and typed results. Stub the module and that translation is exactly what stops being executed; the test then asserts that a fake returns what the fake was told to return.

Mocking at `fetch` keeps the real client, the real status handling, and the real parsing in the run, so a change that breaks the 403 branch fails a test instead of passing one. It also means the fixtures are recognisable GitHub payloads a reviewer can check against the API docs, rather than invented internal shapes.

A module mock is acceptable in a *component* test where the client is genuinely not the subject — but the client's own tests never mock it.

No mock-service library (MSW or similar) is installed. `fetch` stubbing in Vitest and the server-side interceptor in E2E cover the need; adding a dependency here is a decision to be made deliberately, not by habit ([`AGENTS.md`](../AGENTS.md) — "Adding dependencies is a decision, not a detail").

## Failure paths are mandatory

Every feature ships with the happy path **and** at least one failure path. That is the floor, not the target. Across the suite, all five modes below must be covered — they map directly to UX-02..UX-05 in [`.planning/REQUIREMENTS.md`](../.planning/REQUIREMENTS.md).

| Failure mode | Trigger | Must be proven |
| --- | --- | --- |
| **Rate limit** | 403 or 429 (rate-limit headers present) | **Returned** as `{ ok: false, error: { code: "RATE_LIMIT", resetAt } }` and rendered as a rate-limit message with a retry time — **never** as "no results" |
| **Not found** | 404 on `repos/{owner}/{repo}` | **Returned** as `{ ok: false, error: { code: "NOT_FOUND" } }`; the page branches on the code and calls `notFound()`, so the user gets the not-found page, not an error boundary |
| **Validation** | 422, a blank/whitespace `q`, or a page past the 1000-result ceiling | Guarded before the request where possible — assert `fetch` was never called, not merely the code — otherwise **returned** as `{ ok: false, error: { code: "INVALID_QUERY" } }` with guidance to refine the query |
| **Network error** | `fetch` rejects, the 5s timeout fires, any 5xx, or malformed JSON | **Thrown** as `GitHubRequestError` (code `NETWORK`), asserted with `rejects.toBeInstanceOf`, and rendered by `error.tsx` as a generic retry state |
| **Empty results** | 200 with `total_count: 0` | Renders an empty state that says what to do next — distinct from every error above |

Two assertions that are easy to skip and should not be:

- A rate limit rendering as an empty list is the single most misleading failure this app can produce, and it is the state a reviewer is most likely to hit by hand. Test that they are distinguishable.
- **No raw error object or stack trace ever reaches the DOM.** Assert on the user-facing copy, not just on "an error was thrown".

## Accessibility testing

Automated axe checks run against the real build, not jsdom.

- **Specs:** `e2e/*.a11y.spec.ts` — currently [`e2e/home.a11y.spec.ts`](../e2e/home.a11y.spec.ts).
- **Assertion:** `expect(results.violations).toEqual([])` — zero tolerance, and the failure message names the rule and node.
- **Tags checked:** `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.

### Why it is split from the E2E run

Both suites are Playwright, but they answer different questions and fail for different reasons, so [`playwright.config.ts`](../playwright.config.ts) partitions them with the `A11Y` environment variable:

```ts
testIgnore: process.env.A11Y === "1" ? [] : ["**/*.a11y.spec.ts"],
testMatch:  process.env.A11Y === "1" ? ["**/*.a11y.spec.ts"] : undefined,
```

- `npm run test:e2e` → a11y specs ignored.
- `npm run test:a11y` → **only** a11y specs run.

The two never run together, and CI gives each its own job. A colour-contrast regression then reads as "accessibility failed", not as a broken user journey, and neither can mask the other in a report.

Automated axe catches roughly the machine-checkable subset of WCAG. It does not replace the manual keyboard pass required by UX-06 — tab order, focus visibility, and whether the announced names actually make sense.

## Coverage

Configured in [`vitest.config.mts`](../vitest.config.mts) with the v8 provider, reporting `text` and `lcov`.

| Metric | Threshold |
| --- | --- |
| Lines | 70% |
| Functions | 70% |
| Branches | 70% |
| Statements | 70% |

**Scope:** `src/**/*.{ts,tsx}`, excluding `src/**/*.test.{ts,tsx}`, `src/app/layout.tsx` (a static shell with no logic), and `**/*.d.ts`.

**Enforcement:** thresholds fail `npm run test:coverage` — the command the CI `quality` job runs. Plain `npm test` does not check coverage, so run the coverage variant before pushing anything that adds source files.

**These numbers are still provisional, but they are no longer meaningless.** Phase 1 added the first real source files, so 70% now meets real code rather than a placeholder page. Measured at the end of Phase 1:

| File | Lines | Branches | Functions |
| --- | --- | --- | --- |
| `src/lib/github/client.ts` | 55/55 | 20/20 | 8/8 |
| `src/lib/github/errors.ts` | 34/34 | 27/27 | 7/7 |
| `src/lib/github/log.ts` | 11/11 | 9/9 | 3/3 |
| `src/lib/github/search.ts` | 21/21 | 11/11 | 3/3 |
| `src/lib/github/repo.ts` | 11/11 | 6/6 | 1/1 |
| **Total** | **133/133 (100%)** | **73/73 (100%)** | **23/23 (100%)** |

The branch column is the one that matters here: every arm of the failure mapping is executed, which is the property TEST-01 is actually about. The thresholds stay at 70 regardless — raising them is Phase 4 work under TEST-04, and the config carries the note explicitly:

```ts
// Raised as real code lands — see .planning/ROADMAP.md Phase 4 (TEST-04).
```

**One honest caveat about reading the output.** The `text` reporter currently prints an **empty per-file table** — header, rule, nothing between — while the `Coverage summary` block beneath it is correct and the thresholds gate correctly. It is not `skipFull`; that was ruled out by re-running with `--coverage.skipFull=false`. The per-file figures above come from `coverage/lcov.info`, which is complete. Tracked in `.planning/phases/01-github-api-client/deferred-items.md` for Phase 4, which has to revisit this configuration anyway — an empty table matters far more once a threshold can actually fail, because that is the run where someone needs to see *which* file fell short.

Coverage is a floor for spotting untested branches, not a goal. 100% coverage of code that never asserts a failure path is worth less than 70% that does.

## CI gate

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on pushes to `main` and `develop`, with in-progress runs cancelled per ref.

| Job | Enforces |
| --- | --- |
| `build` | `npm run build` once, uploading `.next` as an artifact for the browser jobs |
| `quality` | `npm run lint` → `npm run typecheck` → `npm run test:coverage` |
| `e2e` | `npm run test:e2e` on chromium against the shared build; uploads `playwright-report/` as an artifact (7-day retention) even on failure |
| `a11y` | `npm run test:a11y` — the axe specs, isolated |
| `audit` | `npm audit --audit-level=high`; the tree is held at zero advisories via `overrides` in `package.json` |
| `secrets` | gitleaks over full history (`fetch-depth: 0`) |
| `codeql` | CodeQL SAST, `javascript-typescript`, `security-and-quality` query pack |
| `gate` | Aggregates all of the above — fails unless every one succeeded |

The app is built **once** and shared. `e2e` and `a11y` download the artifact and set `PLAYWRIGHT_PREBUILT=1`, which tells `playwright.config.ts` to serve it rather than rebuild. Locally there is no artifact, so the same config builds first.

Every job pins Node from `.nvmrc` via `node-version-file` and installs with `npm ci`, so CI and local runs use the same Node 24.18.1 and the same locked tree.

In CI, Playwright behaves differently on purpose: `forbidOnly` rejects a stray `test.only`, failed tests retry once, traces are captured on first retry, and `reuseExistingServer` is disabled so every run serves fresh.

### Execution order and fail-fast

Jobs are staged so a failure stops the work behind it rather than burning runner minutes on a build nobody will merge:

```
quality ──▶ build ──▶ e2e
                  └─▶ a11y
audit ─┐
secrets ┼─ (independent, run in parallel)
codeql ─┘
                          all ──▶ CI Gate
```

If `quality` fails, `build`, `e2e`, and `a11y` never start — they are reported as skipped, and skipped is not success, so the gate blocks. The security jobs deliberately stay off that chain: they inspect source and dependencies rather than build output, so a leaked secret is still caught on a branch that does not compile.

Every job carries a `timeout-minutes`. GitHub's default is six hours, which means a hung process quietly consumes an entire budget instead of failing.

### Blocking merges

A workflow cannot block a pull request on its own — that requires branch protection, which is a repository setting rather than a file, and therefore cannot be committed. [`.github/setup-branch-protection.sh`](../.github/setup-branch-protection.sh) applies it in one command once a remote exists:

```bash
.github/setup-branch-protection.sh main
```

It marks **only `CI Gate`** as required. That job aggregates every other job, so jobs can be added, renamed, or removed without touching repository settings — whereas a required check that no longer reports blocks every PR indefinitely, with no failure to click into.

It also sets: `strict` (branch must be up to date with its base), `enforce_admins` (a rule you can bypass is not a rule), linear history, no force pushes, no branch deletion, and resolved review conversations.

**Honest caveat:** this workflow has **never executed**. No GitHub remote is configured for this repository yet — that is deliberate and recorded in [`AGENTS.md`](../AGENTS.md) and Phase 0 of the roadmap. Every script the workflow invokes (`lint`, `typecheck`, `test:coverage`, `test:e2e`, `test:a11y`, `audit`, `build`) has been run locally and passes. The jobs are *defined and locally verified*, not *observed green in CI*. The first push will confirm them.

## Conventions

### Naming and placement

```
src/**/*.test.tsx     component tests, colocated beside the component
src/**/*.test.ts      unit tests, colocated beside the module
e2e/*.spec.ts         Playwright end-to-end specs
e2e/*.a11y.spec.ts    axe accessibility specs
```

- Vitest only collects `src/**/*.{test,spec}.{ts,tsx}`; Playwright only collects from `e2e/`. The two suites cannot pick up each other's files, which is why the `e2e/` directory sits outside `src/`.
- Colocation is the rule: a test lives next to its subject, so a reviewer reading `RepoCard.tsx` finds `RepoCard.test.tsx` in the same directory and a deleted component takes its test with it.
- Prefer `.test.` for Vitest and `.spec.` for Playwright, so the filename alone says which runner owns it.

### How to write them

- **Query by role and accessible name.** `getByRole("button", { name: "Search" })` — not test IDs, not class names, not DOM structure. If a control cannot be found by role and name, that is an accessibility bug the test has just caught.
- **Assert observable behaviour, not implementation.** What the user sees or can do. Not internal state, not that a particular function was called, not the number of renders. Tests coupled to implementation block refactors and then get deleted.
- **No snapshot-only tests.** A snapshot proves markup changed, not that it is correct, and it is approved by pressing `u`. Snapshots may support a specific assertion; they may never be the whole test.
- **Import explicitly.** `globals: true` is enabled, but `page.test.tsx` still imports `describe`, `expect`, `it` from `vitest` — it makes the runner obvious in a file whose siblings are Playwright specs.
- **Interactions go through `user-event`**, not raw `fireEvent`, so focus, pointer, and keyboard sequences match a real user.
- **Name the behaviour, not the function.** `it("shows a rate-limit message when GitHub returns 403")` — a reviewer should understand the failure from the test name in the CI log alone.
- **One reason to fail per test.** When the rate-limit test breaks, it should be because rate-limit handling broke.
