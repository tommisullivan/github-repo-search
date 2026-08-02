# Deferred items — Phase 1

Out-of-scope discoveries found during execution. Logged, not fixed, per the executor's
scope boundary: none was caused by this phase's changes.

## D-1 · The `text` coverage reporter prints an empty per-file table

**Found:** plan 01-05, Task 1, while gathering the per-file numbers the phase gate asks to read.

**Symptom:** `npm run test:coverage` prints the table header and the closing rule with **no rows
at all** — not even the usual `All files` summary row — while the `Coverage summary` block below
it is correct (`133/133` statements, `73/73` branches, `23/23` functions, `133/133` lines) and the
thresholds are enforced correctly.

```
 % Coverage report from v8
------------|---------|----------|---------|---------|-------------------
File        | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
------------|---------|----------|---------|---------|-------------------
------------|---------|----------|---------|---------|-------------------
```

**Ruled out:** `skipFull`. Re-run with `--coverage.skipFull=false` explicitly and the table is
still empty, so it is not the "hide fully-covered files" behaviour.

**Impact:** cosmetic but not harmless — the per-file view is exactly what a reviewer would use to
check *which* module is uncovered, and an empty table invites the conclusion that nothing was
measured. Coverage itself is correct and gating: `coverage/lcov.info` carries complete per-file
records, and the threshold check fails the run when it should.

**Why not fixed here:** `vitest.config.mts` is not in plan 01-05's `files_modified`, the defect
predates this plan (01-01 through 01-04 all reported the same aggregate-only output), and it is a
reporter-configuration issue rather than anything this phase introduced.

**Suggested owner:** Phase 4 (TEST-04), which already has to revisit the coverage configuration to
raise the thresholds. The per-file table should be working *before* a meaningful threshold is set,
because that is the run where someone will need to read which file fell short.

**Workaround in the meantime** — per-file numbers from the lcov report:

```bash
npm run test:coverage
node -e "const t=require('fs').readFileSync('coverage/lcov.info','utf8');let c=null;for(const l of t.split('\n')){if(l.startsWith('SF:'))c={f:l.slice(3),LH:0,LF:0,BH:0,BF:0};else if(l.startsWith('LH:'))c.LH=+l.slice(3);else if(l.startsWith('LF:'))c.LF=+l.slice(3);else if(l.startsWith('BRH:'))c.BH=+l.slice(4);else if(l.startsWith('BRF:'))c.BF=+l.slice(4);else if(l.trim()==='end_of_record')console.log(c.f,c.LH+'/'+c.LF,'lines',c.BH+'/'+c.BF,'branches');}"
```
