# Plan 04-04 — Summary

**Completed:** 2026-08-02
**Requirements closed:** TEST-04
**Deferred items closed:** Phase 1 D-1 (the empty per-file coverage table)

## What shipped

### `vitest.config.mts` — the per-file table fixed, with its root cause

The Phase 1 deferred defect — `npm run test:coverage` printing a table header and rule with **no rows at all** — is fixed, and the cause turned out to be environmental, not a reporter bug:

- **Root cause:** when Vitest 4 detects an AI-agent session (`std-env`'s `isAgent`, which trips on the `CLAUDECODE` environment variable that Claude Code sets in every shell), its config resolution silently injects `skipFull: true` into the `text` reporter's **per-reporter** options and appends a `text-summary` reporter. istanbul's text reporter with `skipFull` drops every row whose statements, branches, functions, and lines are all 100% — and at the end of Phase 1 that was *every* file, including the `All files` row. Hence a completely empty table, sitting above a correct summary block (which was the auto-injected `text-summary`, not the `text` reporter at all).
- **Why the Phase 1 rule-out was wrong:** re-running with `--coverage.skipFull=false` sets the *top-level* coverage option, but the provider builds each reporter's options as `{ skipFull: this.options.skipFull, …, ...reporter[1] }` — the injected per-reporter `skipFull: true` spreads last and wins. The flag genuinely had no effect, so `skipFull` was ruled out on evidence that could not detect it. Verified against the installed sources: `vitest/dist/chunks/coverage.DM_a_rWm.js` (the `isAgent` injection, commented "default to `skipFull` … on agents"), `@vitest/coverage-v8/dist/provider.js` (the spread order), `istanbul-reports/lib/text/index.js` (the `isFull` row skip), and `std-env` (`CLAUDECODE` → `isAgent: true`, confirmed live in this session).
- **Fix:** the reporter entry became `["text", { skipFull: false }]` — an explicit per-reporter option, which the agent-mode injection spreads *under* (`text[1] = { skipFull: true, ...text[1] }`) and therefore cannot override. `lcov` stays in the list unchanged; the 04-01 coverage excludes (`src/instrumentation.ts`, `src/lib/e2e/**`) and all original excludes survive byte-for-byte.

The table now prints every file for any runner, human or agent.

### `vitest.config.mts` — thresholds raised to a measured, binding floor (TEST-04)

Measured post-Phase-4 baseline (the run the decision was made from, after the reporter fix):

| Metric | Measured | All-files detail |
| --- | --- | --- |
| Statements | 96.38% | 240/249 |
| Branches | 94.11% | 128/136 |
| Functions | 92.59% | 50/54 |
| Lines | 96.34% | 237/246 |

Per-file: everything at 100% except `src/app/page.tsx` (89.65% stmts / 79.16% branch — lines 110–114), `src/app/repos/[owner]/[repo]/page.tsx` (83.33% — lines 39, 78), and the route-convention files that only execute inside Next's runtime: `src/app/repos/[owner]/[repo]/error.tsx`, `loading.tsx`, `not-found.tsx` (0% — 4 of the 54 functions), plus type-only `src/types/github.ts` (0/0, reported 0%).

**Chosen floor: 92 statements / 90 branches / 85 functions / 92 lines.**

- The D4-10 target zone (90/90/85/80) measured **more than 6 points loose on every metric** (6.38 / 9.11 / 12.59 / 6.34), which is the plan's tighten trigger.
- Statements, branches, and lines each sit ~4.1–4.6 points below actual — inside the plan's 2–6 point "meaningful but not brittle" band.
- Functions sits 7.6 points below actual **on purpose**: the denominator is 54, and one honest new route segment shipping `loading`/`error`/`not-found` adds 3–5 uncovered functions (~5–8 points). A functions floor at 88 would trip on the next legitimate route; 85 absorbs one new segment without gating nothing.
- Never lowered from any value previously in force (70 → 92/90/85/92 everywhere).

### The red-run proof — the gate observed to bind

Before the real floor was committed, one deliberate run with `lines: 97` (above the measured 96.34%):

```
ERROR: Coverage for lines (96.34%) does not meet global threshold (97%)
```

`npm run test:coverage` exited **1**. Reverted to `lines: 92` in the same task; the committed history never contains the red value. The threshold mechanism is now an observed behaviour, not a config assertion — and because CI's `quality` job already runs `npm run test:coverage`, the raise lands in CI with zero workflow change.

### `docs/TESTING.md` § Coverage rewritten

- The threshold table now shows the enforced floor **beside the measured actuals**, with the tightening reasoning and the functions caveat stated in full.
- The "provisional" framing and the stale Phase 1 per-file table are gone; the "empty table" caveat paragraph is replaced by the root-cause account above.
- The never-lower rule is restated in the doc and in the config comment (T-04-12).
- The red-run proof is recorded in the doc, error line and exit code included.
- The status paragraph up top now marks TEST-04 **done**.

## Verification

Ran in this session on Node 24.18.1 (`nvm use`):

- `npm run test:coverage` — exit 0 at the new thresholds; per-file table read: 33 rows including all 100% files, `All files` at 96.38/94.11/92.59/96.34.
- Red run (`lines: 97`) — exit 1 with the threshold ERROR quoted above, then reverted.
- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm test` — 19 files, 200/200 passed.
- `npm run build` — compiled; route table unchanged (`ƒ /`, `○ /_not-found`, `ƒ /repos/[owner]/[repo]`, proxy present).

## Decisions taken as-is vs modified

- The plan allowed "a documented replacement reporter" as a fallback; not needed — the `text` reporter itself was fine once the injected agent-mode option was overridden, so the standard command now does the job. No reporter swap, no new dependency.
- Threshold values: the plan's own adjustment rule (tighten when the zone is >6 loose on every metric) was applied rather than the zone's literal numbers; the functions exception to the 2–6 band is deliberate and recorded above and in `docs/TESTING.md`.

## Caveats

- The `skipFull` injection is re-applied by Vitest on every agent run; the per-reporter override is load-bearing. The config comment says so — removing it as "redundant" would silently re-empty the table for agent sessions while looking fine for humans, which is exactly how the defect survived Phase 1 diagnosis.
- `src/types/github.ts` reports 0% because it is type-only (0/0 across all metrics; istanbul prints empty summaries as 0). It contributes nothing to the aggregates, so it does not distort the floor.
