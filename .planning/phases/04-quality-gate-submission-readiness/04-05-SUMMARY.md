# Plan 04-05 — Summary

**Completed:** 2026-08-02
**Requirements closed:** DOC-01, DOC-02, DOC-07, DOC-08 — the last four of the milestone; all 46 v1 requirements now Complete
**Role:** terminal plan of Phase 4 and of milestone v1.0 — the phase's Definition of Done gate ran here

One-liner: bilingual Japanese-first README with the four key decisions and the self-contained AI usage summary, OPERATIONS.md's two log-field deferrals converted to recorded decisions, Process 9 in both logs (parity 9 = 9), planning docs closed out, and the full seven-command gate run green in-session — stopped at the PR boundary.

## What shipped

### Task 1 — `README.md` (`ed58d80`)

Rewritten as a single bilingual file, Japanese section first and complete, explicit divider, English mirror second with the same content (DOC-07). Both halves carry:

- The two views (`/` search, `/repos/{owner}/{repo}` detail — a route, never a modal).
- Setup: `nvm use` (Node 24.18.1; the machine-default 18 is EOL and cannot run Next 16), `npm install`, `npm run dev`, and the full command table including `test:coverage` as the CI threshold gate.
- The optional `GITHUB_TOKEN` (DOC-01): what it changes (unauthenticated ~10 search req/min and 60 core/h → ~30/min and 5,000/h), server-side only, never `NEXT_PUBLIC_`, never committed, `.env.example` pointer.
- Key decisions with reasons: **no database / no auth** (nothing to persist; over-engineering; the security dividend), **`subscribers_count` for watchers** — the full trap explanation the STATE.md deferred DOC-01 note called for, consistent with the code comments in `src/lib/github/repo.ts` and `RepoDetail.tsx`, **no DAST** (no auth/session/datastore to attack), **zero production dependencies beyond Next/React** (platform over library), **URL as state**.
- Error handling as a feature: the five states in a table, with "a rate limit is never displayed as no results" stated in both languages.
- The self-contained AI usage summary (DOC-08): how AI was used / what the human decided / how it was verified — every human-decision claim drawn from the logs' recorded Human decisions fields, none invented — followed by links to both per-process logs (DOC-02's README half).

### Task 2 — `docs/OPERATIONS.md` (`2bd38b1`)

The two stale rows in § "What gets logged" converted from forward references to recorded decisions (D4-18), doc-only, sealed client untouched:

- `requestId`: stays per-GitHub-call by decision — one upstream, one call per user action; a retry already shares its first attempt's id, which is the only correlation the app has needed. Per-inbound-request threading would open the sealed `src/lib/github/` boundary; v2, if ever.
- `route`: stays omitted by decision — the `endpoint` literal union already identifies which of the two calls logged, and with two routes mapping 1:1 onto two endpoints a `route` field would duplicate `endpoint` under another name. Revisit trigger recorded (if the 1:1 mapping ever breaks).

`grep -n "Phase 2" docs/OPERATIONS.md` now returns nothing — no stale forward reference to a completed phase remains in the file.

### Task 3 — Process 9, planning closeout, the gate (`4454c62`)

- **Process 9 / 工程 9** appended to both logs, identical content, format per Process 8: the D4-01 E2E-mock ladder and the D4-05/06 CSP ladder with every rejected alternative and its reason; the coverage root cause (Vitest 4's agent-mode `skipFull` injection); the real human decisions of this phase (GSD workflow direction overriding the AGENTS.md agent roster, the GSD Pi install-and-replace and `@opengsd/gsd-pi` choices, the human merging every PR and directing PR #13's conflict resolution, LICENSE flagged not decided, the model-name confirmation); the verbatim gate results; and the honest taken-as-is-vs-modified record. Entry-count parity: **9 = 9**.
- **`.planning/REQUIREMENTS.md`**: UX-06, UX-07, TEST-03, TEST-04, SEC-01, DOC-01, DOC-02, DOC-07, DOC-08 checked Complete; traceability rows updated; zero unchecked v1 boxes remain; Last-updated line reflects the phase close.
- **`.planning/ROADMAP.md`**: Phase 4 marked complete with a Status block in the established honest form (caveats below); progress table 5/5.
- **`.planning/STATE.md`**: position at milestone complete; absorbed todos struck with Done notes (`subscribers_count` README note → 04-05, `description: null` test → 04-02, OPERATIONS gaps → 04-05, log numbering → resolved, E2E scaffold-only → 04-01/04-02); the stale "No GitHub remote is configured" blocker struck with the correction (origin exists, PRs #10/#13/#14 merged through it, CI observed green on `develop` for each); LICENSE elevated to a **flagged human decision** (D4-21).

## The Definition of Done gate — run in this session, output read

All on Node 24.18.1, after every file edit of the phase (the README/OPERATIONS commits preceded the run; the log/planning/summary edits after it are documentation-only and touch no code path the gate exercises):

| # | Command | Result (verbatim) |
|---|---|---|
| 1 | `npm run lint` | clean, exit 0 |
| 2 | `npm run typecheck` | clean, exit 0 |
| 3 | `npm run test:coverage` | `Test Files 19 passed (19)`, `Tests 200 passed (200)`; `Statements : 96.38% ( 240/249 )`, `Branches : 94.11% ( 128/136 )`, `Functions : 92.59% ( 50/54 )`, `Lines : 96.34% ( 237/246 )`; per-file table printed in full; thresholds 92/90/85/92 met, exit 0 |
| 4 | `npm run build` | compiled; route table `ƒ /`, `○ /_not-found`, `ƒ /repos/[owner]/[repo]`, `ƒ Proxy (Middleware)` |
| 5 | `npm run test:e2e` | `17 passed (9.2s)` |
| 6 | `npm run test:a11y` | `7 passed (8.0s)` — zero violations in every state |
| 7 | `npm audit --audit-level=high` | `found 0 vulnerabilities` |

## Phase-wide sweeps — run and read

| Sweep | Result |
|---|---|
| `git diff --stat develop..HEAD -- package.json package-lock.json` | **empty** — zero dependency changes across the entire phase (`vitest.config.mts` changed; the package files did not) |
| `grep -rn "dangerouslySetInnerHTML" src/ e2e/` | only `src/eslint-rules.test.ts` (lines 73/77/86 — the Phase 1 lint-proof test; the legitimate hit) |
| `grep -rn "NEXT_PUBLIC_" src/` | no matches |
| `grep -c '^## Process' docs/AI-USAGE.en.md` vs `grep -c '^## 工程' docs/AI-USAGE.ja.md` | 9 = 9 |

## Caveats carried into ROADMAP's Phase 4 status block

- **`style-src` is at ladder rung 2, a measured, scoped concession**: `'unsafe-hashes'` + the sha256 of `next/image`'s `color:transparent` style attribute, forced by a recorded violation and verified with `openssl`. `script-src` never contains `'unsafe-inline'` anywhere — the SEC-01 line held.
- **The static `/_not-found` renders under the CSP with its bootstrap blocked** — measured (40 reports), accepted: full content, no interactivity to lose.
- **The old "never observed green in CI" caveat is resolved by observed history**: CI ran green on `develop` for the Phase 1–3 merges (PRs #10, #13, #14). This phase's own PR gets its verdict at PR-open.

## Explicitly with the human

- **The merge.** The PR from `feature/phase-4-quality-gate` into `develop` is opened and reported; no merge was performed or attempted, no auto-merge enabled (D4-20; `gh pr merge` is deny-listed in `.claude/settings.json`).
- **The LICENSE decision** (D4-21). No LICENSE file exists; choosing one for a selection-task submission is the owner's call. Flagged here, in STATE.md's blockers, and in the PR description.

## Deviations from plan

None of substance. One sequencing note: the plan's task 3 asks for the gate results verbatim in Process 9's Review field and for the gate to run after every file edit — circular if read literally, resolved the way every prior phase did: all code-affecting edits (Tasks 1–2) committed first, gate run on that tree, then the results recorded in the documentation-only log/planning/summary commits. No code changed after the gate run.

## Known stubs

None.

## Threat flags

None — this plan writes documentation only; no new network endpoints, auth paths, file access, or schema changes.

## Commits

| Hash | Subject |
|---|---|
| `ed58d80` | Rewrite the README bilingual Japanese-first with decisions and the AI usage summary |
| `2bd38b1` | Record the requestId and route log fields as v1 decisions, not deferrals |
| `4454c62` | Record Process 9 in both AI usage logs and close out Phase 4 planning docs |

**Duration:** ~25 min (started 06:33 UTC)

## Self-Check: PASSED

All five artifact files exist with their required content markers (`subscribers_count` in README.md ≥120 lines, `Process 9` / `工程 9` in the logs, `requestId` in OPERATIONS.md); all three commits present in the branch history; entry-count parity 9 = 9.
