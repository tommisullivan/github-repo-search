<!-- generated-by: gsd-doc-writer -->
# Testing

How this repository is tested, what each layer is responsible for, and the rules a change must satisfy before it is considered done.

The app is a **stateless read-through client for the GitHub REST API** ([`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)) — no database, no auth, no session. That shape decides the test strategy: almost everything worth testing is *how the app behaves when GitHub responds*, including when GitHub responds badly.

## Status of this harness

Two things are true at once, and conflating them would be dishonest:

- **The harness exists and passes.** Vitest, React Testing Library, Playwright, axe, and the coverage gate are configured and green locally.
- **The feature-level tests do not exist yet**, because the features do not. `src/app/page.test.tsx` and `e2e/smoke.spec.ts` are deliberate placeholders whose only job is to prove the pipeline runs end to end.

The tests described under [Test layers](#test-layers) land with their features, per the phase mapping in [`.planning/ROADMAP.md`](../.planning/ROADMAP.md): client tests in Phase 1 (TEST-01), component tests in Phase 3 (TEST-02), E2E search → detail in Phase 4 (TEST-03), and the raised coverage threshold in Phase 4 (TEST-04).

## The one non-negotiable rule

**No test ever touches the live GitHub API.**

Unauthenticated GitHub search allows roughly **10 requests per minute** (core REST is 60/hour). CI runners share outbound IPs with every other project on the platform and are rate-limited aggressively, so a single live call turns the suite into a coin flip. A flaky pipeline is worse than no pipeline — it trains everyone to re-run red builds instead of reading them.

So: unit and component tests mock at the `fetch` boundary; Playwright specs intercept `https://api.github.com/**` before the page can reach it.

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

**Owns:** `src/lib/github/` — the fetch wrapper, query guarding, response typing, and above all the status-to-typed-error mapping described in [ARCHITECTURE.md](./ARCHITECTURE.md#typed-errors-distinct-ui). Every branch of that mapping gets a test: `RateLimitError`, `NotFoundError`, `ValidationError`, `NetworkError`, plus the whitespace-only query that must be rejected *before* a request is made.

This is where the error matrix is nailed down, once, because every other layer renders that result rather than re-deriving it.

**Does not own:** anything visual. No rendering, no routing, no markup assertions.

### Component — search and detail views (TEST-02, Phase 3)

**Owns:** what a user actually sees for a given input, for both the happy path and the failure paths. Rendering of result cards, the seven required detail fields, the empty state, the rate-limit message, the error state, and keyboard/label correctness at the component level. The client module is not exercised here — its responses (and its typed errors) are supplied as fixtures.

**Does not own:** whether the routes wire together, whether navigation preserves the query string, or whether the production build works. Those are E2E's.

### E2E — the journey (TEST-03, Phase 4)

**Owns:** one thing that no lower layer can prove — a real browser against a real production build, entering a keyword, seeing results, clicking through to the detail route, and coming back with the search intact. Plus the fact that a detail URL opened cold renders correctly.

**Does not own:** the error matrix. Reproducing all five failure modes through the browser would be slow and duplicative; the interception layer covers the one or two that change navigation (notably not-found). E2E runs chromium only — cross-browser matrices are not in the brief and would cost CI time for no reviewed benefit.

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

afterEach(() => vi.unstubAllGlobals());

it("maps 403 with a rate-limit header to RateLimitError", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      })
    )
  );

  await expect(searchRepositories("next")).rejects.toBeInstanceOf(RateLimitError);
});
```

In Playwright, intercept before navigating:

```ts
await page.route("https://api.github.com/**", (route) =>
  route.fulfill({ status: 200, json: searchFixture })
);
```

### Why the boundary and not the module

Mocking `src/lib/github` with `vi.mock` would be easier and would test less. The point of the client is its **translation** work — status codes, headers, and JSON shapes into typed errors and typed results. Stub the module and that translation is exactly what stops being executed; the test then asserts that a fake returns what the fake was told to return.

Mocking at `fetch` keeps the real client, the real status handling, and the real parsing in the run, so a change that breaks the 403 branch fails a test instead of passing one. It also means the fixtures are recognisable GitHub payloads a reviewer can check against the API docs, rather than invented internal shapes.

A module mock is acceptable in a *component* test where the client is genuinely not the subject — but the client's own tests never mock it.

No mock-service library (MSW or similar) is installed. `fetch` stubbing and `page.route` cover the current need; adding a dependency here is a decision to be made deliberately, not by habit ([`AGENTS.md`](../AGENTS.md) — "Adding dependencies is a decision, not a detail").

## Failure paths are mandatory

Every feature ships with the happy path **and** at least one failure path. That is the floor, not the target. Across the suite, all five modes below must be covered — they map directly to UX-02..UX-05 in [`.planning/REQUIREMENTS.md`](../.planning/REQUIREMENTS.md).

| Failure mode | Trigger | Must be proven |
| --- | --- | --- |
| **Rate limit** | 403 or 429 (rate-limit headers present) | Surfaces as `RateLimitError` and renders a rate-limit message — **never** as "no results" |
| **Not found** | 404 on `repos/{owner}/{repo}` | Surfaces as `NotFoundError` and renders the not-found page, not an error boundary |
| **Validation** | 422 (empty/malformed `q`) | Guarded before the request where possible; otherwise `ValidationError` with guidance to refine the query |
| **Network error** | `fetch` rejects | Surfaces as `NetworkError` and renders a generic retry state |
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

**These numbers are provisional.** With only a placeholder page in `src/`, 70% is trivially met and proves nothing. The config carries the note explicitly:

```ts
// Raised as real code lands — see .planning/ROADMAP.md Phase 4 (TEST-04).
```

The mechanism is in place from Phase 0; setting a threshold that means something — high on `src/lib/github/`, where the error branches live — is Phase 4 work under TEST-04.

Coverage is a floor for spotting untested branches, not a goal. 100% coverage of code that never asserts a failure path is worth less than 70% that does.

## CI gate

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every pull request and on pushes to `main` and `develop`, with in-progress runs cancelled per ref.

| Job | Enforces |
| --- | --- |
| `quality` | `npm run lint` → `npm run typecheck` → `npm run test:coverage` → `npm run build`, in that order |
| `e2e` | `npm run test:e2e` on chromium against a production build; uploads `playwright-report/` as an artifact (7-day retention) even on failure |
| `a11y` | `npm run test:a11y` — the axe specs, isolated |
| `audit` | `npm audit --audit-level=high`; the tree is held at zero advisories via `overrides` in `package.json` |
| `secrets` | gitleaks over full history (`fetch-depth: 0`) |
| `codeql` | CodeQL SAST, `javascript-typescript`, `security-and-quality` query pack |

Every job pins Node from `.nvmrc` via `node-version-file` and installs with `npm ci`, so CI and local runs use the same Node 24.18.1 and the same locked tree.

In CI, Playwright behaves differently on purpose: `forbidOnly` rejects a stray `test.only`, failed tests retry once, traces are captured on first retry, and `reuseExistingServer` is disabled so every run builds and serves fresh.

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
