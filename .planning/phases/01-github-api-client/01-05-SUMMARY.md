---
phase: 01-github-api-client
plan: 05
subsystem: docs
tags: [documentation, eslint, boundary-enforcement, phase-gate, ai-usage-log, coverage]

requires:
  - phase: 01-github-api-client
    provides: "01-01..01-04 — the shipped boundary whose behaviour these documents now describe"
provides:
  - Design documents and a roadmap criterion that describe the implemented failure model rather than the superseded one
  - Boundary and dangerouslySetInnerHTML rules enforced by lint, each proven to fire by a test
  - The Phase 1 gate result — all seven commands run and read in one session
  - Process 6 in both AI usage logs, with the reasoning and the rejected alternatives
affects: [phase-2 search UI, phase-3 detail UI, phase-4 coverage and docs]

tech-stack:
  added: []
  patterns:
    - "A lint rule is proven by ESLint#lintText against the shipped config, never by grepping the config file"
    - "A rule that forbids something needs a negative control, or 'the rule fires' is indistinguishable from 'everything fails here'"
    - "Boundary greps are scoped to non-test, non-comment lines so they check the property rather than the prose"

key-files:
  created:
    - src/eslint-rules.test.ts
    - .planning/phases/01-github-api-client/deferred-items.md
  modified:
    - docs/ARCHITECTURE.md
    - docs/OPERATIONS.md
    - docs/TESTING.md
    - .planning/ROADMAP.md
    - eslint.config.mjs
    - docs/AI-USAGE.en.md
    - docs/AI-USAGE.ja.md

key-decisions:
  - "no-restricted-syntax on the JSX attribute matched, so the react/no-danger fallback was not kept — decided by the test, not by reading plugin source"
  - "@/lib/github/errors is deliberately left unrestricted from the presentation layer: a rule that blocks Phase 2 gets deleted in full, taking the client restriction with it"
  - "The empty per-file coverage table was logged for Phase 4 rather than fixed here — vitest.config.mts is not this plan's file and the defect predates the plan"
  - "docs/SECURITY.md left untouched as the plan instructed, and its now-understated 'enforced by review' line flagged rather than edited"
  - "Process 6 attributes D-01..D-18 as AI-framed-and-recommended, developer-chosen — corrected after the orchestrator supplied what actually happened"

patterns-established:
  - "A verification check that cannot express the real property is reported as such, rather than the code being weakened to satisfy it"

requirements-completed: [SEC-03, TEST-01, API-02, OBS-01]

duration: 19min
completed: 2026-08-02
---

# Phase 1 Plan 05: Documentation Reconciliation, Enforced Rules, and the Phase Gate Summary

**Four statements across three design documents and one roadmap criterion described a failure model this phase deliberately rejected; they now describe the shipped one. Two rules that were "enforced by review" are enforced by lint and proven to fire by a test rather than by their presence in a config file. All seven gate commands ran in this session and their output was read — including the one thing in it that is wrong.**

## Performance

- **Duration:** ~19 min
- **Started:** 2026-08-02T03:14:58Z
- **Completed:** 2026-08-02T03:34Z
- **Tasks:** 3 of 3 (Task 3 was the blocking human checkpoint — approved)
- **Files created:** 2 · **modified:** 7

## Task Commits

1. **Task 1: Reconcile the design documents and the roadmap** — `bbfa68c` (docs)
2. **Task 2: Boundary and security rules in lint, proven to fire** — `e1dcae1` (feat)
3. **Task 3: Gate, sweeps, and both AI usage logs** — `8556e7b` (docs), corrected by `ca8ac2d` (docs) after the checkpoint

---

## What the documents said, and what they say now

The plan named four known contradictions. All four are fixed, and three more of the same class were found while making the edits — the plan said to find them precisely rather than rewrite wholesale, and a diagram naming functions that do not exist is the same defect as a table naming errors that do not exist.

| Document | Was | Is |
|---|---|---|
| `ARCHITECTURE.md` § Typed errors | Four thrown classes (`RateLimitError` etc.) reaching `error.tsx` | The four codes with a **How it travels** column — three returned, `NETWORK` thrown — plus a subsection giving the production-sanitisation reason |
| `ARCHITECTURE.md` both sequence diagrams | Rate limit, 422 and 404 thrown to `error.tsx` | Returned as a `Result`; the detail page branches on `NOT_FOUND` and calls `notFound()` itself; only transport faults, the 5s timeout, 5xx and malformed JSON throw |
| `ARCHITECTURE.md` two diagrams | `githubFetch(path, init)` | `githubFetch({ path, endpoint, revalidate })`, with the reason in prose |
| `ARCHITECTURE.md` (found, not listed) | `toGitHubError` / `toNetworkError`, `SearchResponse`, no `log.ts`, `src/lib/github` marked Planned · P1 | `toFailure` / `toRequestError`, `SearchResult`, `log.ts` present, everything in the boundary marked **Built** |
| `OPERATIONS.md` observability table | `pino` in **both** the default and the upgrade cell | `console.log` + `JSON.stringify` with the D-17/D-18 reason; upgrade is *a log shipper → Loki*, an infrastructure change requiring no code change |
| `OPERATIONS.md` log-field table | `route` present, `requestId` per inbound request, `errorType: RateLimitError` | `route` **deferred to Phase 2**, `requestId` per GitHub call, `cacheHit` always `null` with both measured subsections linked, `errorType` the real vocabulary |
| `TESTING.md` mocking example | `rejects.toBeInstanceOf(RateLimitError)` | Asserts `ok: false` with `RATE_LIMIT` and `resetAt`, plus the transport fault as the case that rejects |
| `TESTING.md` failure table | Four error class names | Returned codes for rate limit / not found / validation; the network row stays a throw |
| `ROADMAP.md` criterion 2 | "…never a raw throw" | The returned codes **and** the thrown `GitHubRequestError`, with the one-line reason |

**`grep -i pino docs/OPERATIONS.md` returns nothing**, in either column. No superseded error class name survives in any of the three documents.

### Why `githubFetch` takes an options object — recorded because it is the interesting half

An `init` parameter would let a caller pass its own `cache`, silently undoing the caching guarantee the client exists to hold. `endpoint` and `revalidate` are not `RequestInit` members either. The window is the caller's; **the cache opt-in is the client's, and it is not reachable from outside.** The document now says so rather than showing a signature that invites the mistake.

### What was deliberately not touched

- **`docs/SECURITY.md`** — the plan said not to, and its Phase 1 content (URL construction, token handling) is what was implemented. Its `dangerouslySetInnerHTML` note still reads "enforced by review", which as of `e1dcae1` understates the truth. Flagged at the checkpoint; **the orchestrator is correcting that line in a separate commit.**
- **`01-CONTEXT.md`** — D-11a's premise was already annotated as measured-false by the orchestrator in `16652a4` before this plan reached the checkpoint. Not duplicated.

---

## The lint rules, and the proof they fire

`eslint.config.mjs` gains three named rule groups and **zero dependencies** — `eslint` and `eslint-config-next` were already devDependencies.

| Rule group | Scope | Threat |
|---|---|---|
| `no-restricted-syntax` on `JSXAttribute[name.name="dangerouslySetInnerHTML"]` | global | T-01-18 (SEC-03) |
| `no-restricted-imports` forbidding the cross-unit import, both directions | `search.ts`, `repo.ts` | T-01-17 |
| `no-restricted-imports` forbidding `@/lib/github/client` | `src/app/**`, `src/components/**` | T-01-19 |

**The selector matched, so `react/no-danger` was not kept.** The plan said the test decides that, not a reading of the plugin source, and it did.

`src/eslint-rules.test.ts` (164 lines, 7 tests) lints real snippets through the shipped config with `ESLint#lintText`. Observed rule ids and messages:

```
src/app/rule-probe.tsx    → no-restricted-syntax:  dangerouslySetInnerHTML is banned in this repository — see docs/SECURI…
src/lib/github/search.ts  → no-restricted-imports: './repo' import is restricted from being used. The two capability unit…
src/app/page.tsx          → no-restricted-imports: '@/lib/github/client' import is restricted from being used. Routes and…
```

**The RED run is the evidence that the test tests something.** Before the rules existed: **4 failed, 3 passed** — and the three that passed were the environment assertion and the two negative controls. That is the correct shape. A negative control that fails before the rule exists is not a control.

Two decisions inside the rules, both recorded in a comment beside them:

- **`@/lib/github/errors` is not restricted from the presentation layer.** Phase 2 needs `GitHubFailure` to render its states. A rule that blocks legitimate work is not narrowed by whoever it blocks — it is deleted in full, taking the `client` restriction with it. A test asserts the `errors` import still passes, so a future edit that breaks that premise fails a test.
- **The environment directive is asserted.** `// @vitest-environment node` is load-bearing, and a silently-ignored docblock would leave the suite running in jsdom without anyone noticing. One test asserts `typeof globalThis.window === "undefined"`.

---

## The Phase 1 gate — all seven, run in this session, output read

| Command | Result |
|---|---|
| `npm run lint` | clean, no output, exit 0 |
| `npm run typecheck` | clean, no output, exit 0 |
| `npm run test:coverage` | 7 files, **113 tests passed**; 133/133 statements, 73/73 branches, 23/23 functions, 133/133 lines — **100%**, thresholds (70%) met |
| `npm run build` | compiled in 1397ms; TypeScript finished in 1351ms; route table `○ /` and `○ /_not-found` |
| `npm run test:e2e` | 1 passed (6.9s) — `e2e/smoke.spec.ts` |
| `npm run test:a11y` | 1 passed (6.9s) — `e2e/home.a11y.spec.ts`, zero axe violations |
| `npm audit --audit-level=high` | **found 0 vulnerabilities** |

### Coverage of `src/lib/github/` as measured

The error branches are the point, so they are reported per file rather than as an aggregate:

| File | Lines | Branches | Functions |
|---|---|---|---|
| `client.ts` | 55/55 | 20/20 | 8/8 |
| `errors.ts` | 34/34 | 27/27 | 7/7 |
| `log.ts` | 11/11 | 9/9 | 3/3 |
| `search.ts` | 21/21 | 11/11 | 3/3 |
| `repo.ts` | 11/11 | 6/6 | 1/1 |
| **Boundary total** | **132/132** | **73/73** | **22/22** |

(The sixth counted file is `src/app/page.tsx`, 1/1 lines — the scaffold page. `src/types/github.ts` is types only, 0/0.)

**Every branch of the failure mapping is executed.** That is the property TEST-01 is about; the aggregate percentage is not.

### API-05 evidence, carried forward from plan 01-03

A passing unit suite does not prove a request was cached. The phase's evidence is a counted run against a local server, and it is repeated here because it is the only thing that satisfies API-05 and ROADMAP criterion 5:

| | Count |
|---|---|
| Requests sent to the app (`ƒ /cache-confirm`, dynamic — confirmed in the route table before driving it) | **6** (3, then 3 more) |
| Requests received by the upstream counter | **1** |
| `serverCount` rendered | `1` on all six |

**One upstream request for six renders**, through the real `githubFetch` rather than a hand-written `fetch`. The three log lines from the first burst show `rateLimitRemaining: 59` replayed identically while the upstream counter never advanced — a cached response replays historical headers — and `durationMs` falling 26 → 1 → 0, which is exactly the signal `docs/OPERATIONS.md` forbids turning into a `cacheHit` guess. The log line does not claim live headroom; OPERATIONS.md line 90 says to read it as "headroom as of the last real call, never as current".

---

## The Phase 1 sweeps — and the three that could not be run as written

The plan named this as a known defect to fix: three plans in a row wrote `<verification>` greps as if only source files match, when test files legitimately contain the same strings and comments explaining a rule match the grep forbidding it. The sweeps below are scoped to **non-test, non-comment lines**, so they check the property rather than the prose.

| Sweep | Scoped result |
|---|---|
| `api.github.com` in `src/` | **`client.ts:32` only.** Raw grep matched 8 lines: 3 test assertions and 2 comments besides |
| `process.env` in `src/` | **`client.ts:92` only** — one module reads the environment |
| `NEXT_PUBLIC` in `src/` | none |
| `127.0.0.1` in `src/` | none — 01-03's temporary edit is genuinely reverted |
| `dangerouslySetInnerHTML` in `src/ e2e/` | none in non-test source |
| `force-cache` in `client.ts` | present, line 186 (plus the explanatory comment at 174) |
| Japanese characters in `src/lib/github/*.ts`, `src/types/*.ts` (excluding tests) | 6 files checked, **none** |
| `@ts-ignore` / `@ts-expect-error` in `src/lib/github/`, `src/types/` | none |
| `git diff --stat package.json package-lock.json` | **empty** across every commit in the phase |

### The three checks that cannot pass as literally written

Reported rather than worked around, because weakening code to satisfy a check is the failure the check exists to prevent.

1. **`! grep -rn "dangerouslySetInnerHTML" src/ e2e/` — now FAILS**, matching three lines in `src/eslint-rules.test.ts`: the file this plan required, containing the snippet that proves the attribute is forbidden. **This is the defect eating its own tail** — the plan's automated chain forbids the string that its own Task 2 deliverable must contain. The test was not weakened and the comment was not reworded. Scoped to non-test lines, the property holds.

2. **`grep -rn "GITHUB_TOKEN" src/` — "matches `client.ts` only" cannot be expressed.** Even scoped to non-test, non-comment lines it also matches `log.ts:107`, which is the D-15 unauthenticated *notice text* naming the variable in operator-facing prose. That is correct code, not a leak. The property that actually matters is `process.env`, which matches one line.

3. **`grep -rn "api.github.com" src/` — "matches `client.ts` only"** holds only once test files are excluded, exactly as 01-03 predicted.

**Recommendation for Phase 2, now that it is four plans in a row:** make it a convention. A boundary grep is written against non-test, non-comment lines, or it is written as a test.

---

## Deviations from Plan

### 1. [Rule 2 — missing critical functionality] Three more document contradictions than the plan listed

- **Found during:** Task 1, while editing the diagrams the plan did name.
- **Issue:** `ARCHITECTURE.md` named `toGitHubError` / `toNetworkError` (real names: `toFailure` / `toRequestError`), a `SearchResponse` type that does not exist, and had no `log.ts` in the directory listing. Identical class of defect to the four the plan listed — a document naming functions that do not exist misleads exactly as much as one naming errors that do not exist.
- **Fix:** corrected in the same pass. The plan's instruction to edit precisely rather than rewrite wholesale was followed; no reasoning that is still correct was lost.
- **Commit:** `bbfa68c`

### 2. [Rule 1 — bug] An unused import in the new test file produced a lint warning

- **Found during:** Task 2 verification. `beforeAll` was imported and never used; `@typescript-eslint/no-unused-vars` reported it at severity 1.
- **Fix:** removed. `npm run lint` is now completely silent. Caused by this task, so in scope.
- **Commit:** `e1dcae1`

### 3. [Scope] `ARCHITECTURE.md`'s boundary paragraph was edited in Task 2's commit, not Task 1's

The sentence "The rules are a code-review checklist, not decoration … should be rejected in review" only becomes false once the lint rules exist. Editing it in Task 1 would have committed a claim that was not yet true. It landed with the rules it describes.

### 4. [Deferred, not fixed] The coverage reporter prints an empty per-file table

- **Found during:** Task 1, gathering the per-file numbers the checkpoint asks a human to read.
- **Issue:** `npm run test:coverage` prints the table header and closing rule with **no rows at all** — not even `All files` — while the summary block and the threshold gate are both correct. Ruled out `skipFull` by re-running with `--coverage.skipFull=false`; still empty.
- **Why not fixed:** `vitest.config.mts` is not in this plan's `files_modified`, the defect predates this plan (01-01..01-04 all produced the same aggregate-only output), and it is a reporter-configuration issue this phase did not introduce.
- **Logged to:** `.planning/phases/01-github-api-client/deferred-items.md`, for Phase 4 (TEST-04), which has to revisit that configuration anyway. It matters more once a threshold can actually fail, because that is the run where someone needs to see *which* file fell short.
- **Workaround used here:** per-file figures read from `coverage/lcov.info`, and the caveat recorded in `docs/TESTING.md` rather than left for the next person to rediscover.

### 5. [Correction after the checkpoint] Process 6's human-decisions attribution was wrong

- **Found during:** the human checkpoint — the orchestrator supplied what actually happened.
- **Issue:** the entry said the developer "decided" D-01..D-18. True but incomplete: the AI framed the options and labelled one *Recommended*, and the developer chose that one each time. A reviewer asking "why hybrid?" in an interview would have received reasoning the developer endorsed rather than originated, with nothing in the log saying so.
- **Fix:** both logs now state plainly that the AI framed and recommended and the developer chose, and separately name the seven decisions that were genuinely the developer's own and unprompted — rejecting MongoDB, per-process AI logging, the ask-don't-invent rule, agents never merging, free and self-hostable observability only, bilingual docs, and Japanese UI with English code. Those are the stronger evidence, because they shaped the space the options were drawn from.
- **Worth naming:** this correction *is* the ask-don't-invent rule operating. The original entry was flagged at the checkpoint as an attribution I could not verify, rather than asserted and left.
- **Commit:** `ca8ac2d`

### 6. [Judgement] Mermaid diagrams were not machine-validated

Process 4 validated all five diagrams with mermaid 11, the version GitHub renders with. That could not be repeated here: mermaid is not installed, this phase ships zero new dependencies, and downloading an unverified package to satisfy a check is not a trade worth making. Mitigation: every mermaid block was scanned for parser-hostile characters (`#`, `;`, and stray `|` outside edge-label delimiters), and one `|` inside a flowchart node label was rewritten. **Stated as unverified rather than implied as checked.** Flagged to the human at the checkpoint.

---

**Total deviations:** 6 — 2 auto-fixes under Rules 1 and 2, 1 post-checkpoint correction supplied by the human, 3 documented judgements. No scope creep, no new dependencies, no architectural change.

## Requirements

Applying the rule this phase has used since 01-02 — **a requirement is marked Complete only when no remaining plan in the phase still claims it** — this plan closes the last four.

| Requirement | Status | Why |
|---|---|---|
| SEC-03 | **Complete** | URLs built with `URLSearchParams` / `encodeURIComponent` (01-03, 01-04); `dangerouslySetInnerHTML` now banned by a lint rule proven to fire, not by a review convention |
| TEST-01 | **Complete** | Third and final instalment. 113 tests; every branch of the failure mapping covered, at 73/73 branches in the boundary |
| API-02 | **Complete** | The mapping is wired, tested, returned unmodified by both units, and now described correctly in every document that describes it |
| OBS-01 | **Complete** | One structured JSON line per call, observed in a live run; the documentation sweep this requirement was held open for is done |

**All 10 Phase 1 requirements are now Complete** (API-01..API-05, TEST-01, OBS-01..OBS-03, SEC-03).

## Phase 1 success criteria — what is observed, and what is only locally verified

Recorded in the same honest form Phase 0 used, because the distinction is the point.

| # | Criterion | Status |
|---|---|---|
| 1 | Single typed client, explicit response types, no `unknown` reaching a caller | **Observed** — 113 tests, `npm run typecheck` clean |
| 2 | Returned codes vs thrown `GitHubRequestError` (as corrected by this plan) | **Observed** — named tests for every arm |
| 3 | Empty/whitespace query rejected before any request | **Observed** — asserted by `fetch` never being called |
| 4 | `GITHUB_TOKEN` raises the limit, nothing reaches the client bundle, `.env.example` documents it | **Partly observed.** The token header, its absence, and its non-appearance in stdout are tested; that it raises the real limit is GitHub's documented behaviour, **not measured** — doing so would have spent the quota it describes |
| 5 | Repeated identical reads served from Next's fetch cache | **Observed, counted** — 6 renders → 1 upstream request through the shipped client |
| 6 | `npm test` exercises every error-mapping branch with the network mocked | **Observed** — 73/73 branches |
| 7 | One structured log line per call with status, duration, rate-limit headers; no token, header or body | **Observed** — asserted across a success, a 500 and a failed retry |
| 8 | Timeout on every request; rate-limited and 4xx never retried; one retry only on a transient fault | **Observed** — proven by `fetch` call counts, not by reading the code |
| 9 | URLs built with `URLSearchParams` / `encodeURIComponent` | **Observed** — assertions parse the outgoing URL with `URL`, never a substring |

**Defined and locally verified, not observed in CI:** every one of the above, in the sense that matters for the pipeline. No GitHub remote is configured, so `.github/workflows/ci.yml` has still never executed. Every script it invokes has been run locally in this session and passes. The gate is *defined and locally verified*, not *observed green in CI* — unchanged from Phase 0's caveat, and it will only be resolved by a first push.

**One criterion is met by a scaffold, and saying otherwise would be misleading:** `npm run test:e2e` and `npm run test:a11y` each ran one test, against the create-next-app page this phase does not touch. They are green and they say almost nothing about Phase 1's code. Real E2E coverage is TEST-03, in Phase 4.

## Threat Mitigations Applied

- **T-01-18** (future XSS) — `no-restricted-syntax` fails the build repo-wide, with `src/eslint-rules.test.ts` proving it reports an error on a real snippet. A config-file grep would have passed on a rule that never matches.
- **T-01-19** (bypassing the units) — `no-restricted-imports` on `src/app/**` and `src/components/**`, with a test proving it fires **and** a matching test proving the `errors` type import is still allowed, so the rule is not deleted wholesale by the first phase it obstructs.
- **T-01-20** (token / `NEXT_PUBLIC_` / leftover local base URL) — swept; one `process.env` read, no `NEXT_PUBLIC`, no `127.0.0.1`.
- **T-01-21** (undocumented AI involvement) — both logs updated with reasoning and rejected alternatives, entry counts compared across the two files' real heading styles, and the attribution corrected rather than left plausible.
- **T-01-28** (API-05 quietly unmet) — the counted confirmation is carried forward as the evidence, and `force-cache` is present in `client.ts`.
- **T-01-SC** (npm installs) — nothing installed; `git diff --stat package.json package-lock.json` empty across the whole phase.

## Known Stubs

None. This plan produced documentation, lint configuration, and a test.

## Threat Flags

None. No network endpoint, auth path, file access pattern, or schema was introduced. `src/eslint-rules.test.ts` executes ESLint against in-memory strings and touches no file on disk.

## Self-Check: PASSED

- `docs/ARCHITECTURE.md` — FOUND, contains `notFound()`
- `docs/TESTING.md` — FOUND, contains `ok: false`
- `docs/OPERATIONS.md` — FOUND, contains no `pino`
- `eslint.config.mjs` — FOUND, contains `no-restricted` (4 occurrences)
- `src/eslint-rules.test.ts` — FOUND, 164 lines (min 40), contains `lintText`
- `docs/AI-USAGE.ja.md` / `docs/AI-USAGE.en.md` — FOUND, 6 entries each, counts equal
- `.planning/phases/01-github-api-client/deferred-items.md` — FOUND
- Commits `bbfa68c`, `e1dcae1`, `8556e7b`, `ca8ac2d` — all present in `git log`
- No task commit deleted a tracked file

## User Setup Required

None.

## Next Phase Readiness

Phase 1 is complete: all 10 requirements closed, all nine success criteria addressed with the two honest qualifications above.

Carried into Phase 2, in priority order:

1. **Handle the throw, not only `ok: false`.** Both units return a `Result` **and** may throw `GitHubRequestError`. Four tests assert the propagation; `error.tsx` is the destination.
2. **Decide what `INVALID_QUERY` means in the UI.** It covers both a blank keyword and a page past the 1000-result ceiling, and "refine your keyword" is wrong for the second. Only reachable by hand-editing the URL — but a reviewer hand-editing the URL is exactly what happens during an interview. `SEARCH_PER_PAGE` and `SEARCH_MAX_RESULTS` are exported so a route can clamp. **Left open deliberately; it is Phase 2's decision, not this plan's.**
3. **Paginate from `hasNextPage`, not `totalCount`** — the raw total exceeds what GitHub will serve.
4. **`route` and a per-inbound-request `requestId`** are named gaps in `docs/OPERATIONS.md`, not oversights. Phase 2 has the routes that make them fillable.
5. **The README still needs the `subscribers_count` note** the brief requires (AGENTS.md § GitHub API rules). The reasoning exists at `src/lib/github/repo.ts` and on `GitHubRepoDetailPayload`; the README does not carry it yet. This plan's `files_modified` did not include `README.md`, so it was not added here — it is Phase 4's DOC-01 work, and it is a brief requirement rather than a nice-to-have.
6. **Scope boundary greps to non-test, non-comment lines, or write them as tests.** Four plans in a row have now hit this.

---
*Phase: 01-github-api-client*
*Completed: 2026-08-02*
