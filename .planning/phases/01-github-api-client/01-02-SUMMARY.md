---
phase: 01-github-api-client
plan: 02
subsystem: api
tags: [nextjs-16, fetch-cache, measurement, spike, rate-limiting, observability]

requires:
  - phase: 01-github-api-client
    provides: nothing — this spike depends on no code and was run before the client existed
provides:
  - A counted, version-stamped answer to whether Next 16.2.12 caches a repeated read in this configuration
  - The exact fetch options plan 01-03 must ship, in copy-pasteable form
  - The resolution of D-11b — an AbortSignal does not opt a request out of the data cache
  - The honest limits of the cacheHit field and of a logged rate-limit headroom figure
affects: [01-03 client, 01-04 search and repo units, 01-05 docs and AI usage log]

tech-stack:
  added: []
  patterns:
    - "Framework behaviour that a design depends on is measured against a local counting server, not recalled"
    - "A caching measurement carries negative controls, or it cannot distinguish a result from a broken instrument"

key-files:
  created: []
  modified:
    - docs/OPERATIONS.md

key-decisions:
  - "githubFetch ships cache: 'force-cache' + next.revalidate + AbortSignal.timeout together — cell d measured all three caching"
  - "force-cache is kept although cell a proved it redundant: it is the documented opt-in and states intent at the call site"
  - "D-11a's premise is measured false (revalidate alone does cache) while its conclusion stands — recorded rather than quietly dropped"
  - "cacheHit stays null: a cache hit is indistinguishable from a miss to application code, and inferring it from durationMs is rejected"
  - "API-05 and OBS-02 left Pending — this plan measured and decided, plan 01-03 ships the code that delivers them"

patterns-established:
  - "Negative controls (cells e and f) are what make a positive caching result meaningful"
  - "Probe harness lives in scratch, never in the repository; the route is deleted in the same plan that creates it"

requirements-completed: []

duration: 18min
completed: 2026-08-02
---

# Phase 1 Plan 02: Fetch Cache Measurement Summary

**Next 16.2.12 caches a repeated dynamic-route read with `cache: 'force-cache'`, `next.revalidate`, and an `AbortSignal` all present — so API-05's cache and OBS-02's timeout ship together with no trade-off, and the two open questions in D-11a/D-11b are now counted rather than assumed.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-08-02T02:33Z
- **Completed:** 2026-08-02T02:51Z
- **Tasks:** 2 of 2 auto tasks complete; Task 3 is the human checkpoint

## What Was Measured

A plain-Node counting server on `127.0.0.1:4599` served six independent paths, each with its own counter and its own `x-ratelimit-*` headers. A temporary dynamic route at `src/app/cache-probe/page.tsx` awaited `searchParams` and fetched one path per cell. `api.github.com` was never contacted.

The build's route table confirmed the probe as dynamic before any cell was driven:

```
Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /cache-probe
```

`ƒ (Dynamic)` — so what follows is the persistent data cache, not build-time prerendering. The probe server was restarted after the build so every counter started at zero (the build issued no probe requests; the restart removed the possibility rather than assuming it).

### The matrix — raw counts

| Cell | `fetch` options | Sent | Upstream received | Cached? |
|---|---|---|---|---|
| a | `{ next: { revalidate: 60 } }` | 3 | **1** | yes |
| b | `{ next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) }` | 3 | **1** | yes |
| c | `{ cache: "force-cache", next: { revalidate: 60 } }` | 3 | **1** | yes |
| d | `{ cache: "force-cache", next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) }` | 3, then 6 | **1** | yes |
| e *(control)* | *none* — the `auto no cache` default | 3 | **3** | no |
| f *(control)* | `{ cache: "no-store" }` | 3 | **3** | no |

Final counter read: `{"a":1,"b":1,"c":1,"d":1,"e":3,"f":3}`

No cell returned 2, so nothing was non-deterministic. Cells a–d were measured twice (once before the controls existed, once after a `rm -rf .next/cache` and a full rebuild) and returned 1 both times. Cell d was then driven three further times and held at 1.

### Rendered output

Cells a–d rendered `serverCount=1 remaining=59` on every one of their three requests. Cells e and f rendered `serverCount=1/2/3` and `remaining=59/58/57`.

### Answers

- **Q1 — does `next: { revalidate: 60 }` alone cache? Yes (cell a = 1).** This contradicts D-11a's *premise*. A positive `next.revalidate` is itself an opt-in; the docs' "not cached by default" describes a fetch carrying **no** cache directive, which is cell e, and cell e did hit upstream every render.
- **Q2 — does `force-cache` change the answer? No (c = a = 1).** It is not required for caching here; it is the explicit spelling of it.
- **Q3 — does an AbortSignal opt out of the data cache? No (b = a, d = c).** This is the D-11b question and the one that could have forced API-05 and OBS-02 apart. It does not.
- **Q4 — rate-limit headers on a cache hit? Stale.** Every cached response replayed `remaining=59` from the first call while the upstream counter never advanced.

## The Decision Line — verbatim, for `client.ts`

```ts
fetch(url, {
  cache: "force-cache",
  next: { revalidate: revalidateSeconds }, // 60 for search, 300 for detail (D-09)
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), // 5000 (OBS-02)
});
```

This is cell **d** exactly, and cell d cached. Plan 01-05's gate greps `src/lib/github/client.ts` for `force-cache`, so the redundant-but-explicit option is also what the phase's own check expects.

## Outcome Applied

**Outcome 1 of the three the plan defined: "cell d cached."** Both API-05 and OBS-02 are satisfied with no trade-off. The `Promise.race` fallback was **not** taken and no Cancellation/Timeout amendment to the resilience table was needed — the table's existing "propagate the request's abort signal" and "via `AbortSignal.timeout()`" rows remain true of the code 01-03 will write.

## Consequences Recorded for Later Plans

- **`cacheHit` stays `null` (01-03).** On a hit the `Response` handed to application code was indistinguishable from a miss — same status, same headers, nothing added to discriminate. Inferring from `durationMs` is explicitly rejected in `docs/OPERATIONS.md`: a wrong `cacheHit` is worse than an absent one because it looks authoritative.
- **`rateLimitRemaining` is historical on a cache hit.** Log it, do not alert on it, and never present it as live headroom. This resolves the open STATE.md concern that said to confirm the behaviour before trusting the value.

## The Harness — verbatim, for plan 01-03 to recreate

Neither file exists in the repository. Both are reproduced here so the confirmation in 01-03 is a re-run, not a re-derivation.

**Probe server** — scratch only, run with `node probe-server.mjs`:

```js
/**
 * Throwaway counting server for plan 01-02's fetch-cache measurement.
 *
 * Plain node, no dependencies. Bound to 127.0.0.1 only (T-01-24) and never
 * contacts api.github.com (T-01-25).
 *
 * Four independent paths because Next's fetch cache is keyed on the URL: one
 * shared path would let one cell's cached entry answer another cell's request,
 * which looks exactly like caching that is not there.
 */
import { createServer } from "node:http";

const PORT = 4599;
const HOST = "127.0.0.1";
const LIMIT = 60;
const RESET_AT = 2000000000; // fixed future Unix second, so the value is stable

// e and f are negative controls: configurations the docs say must NOT cache.
// Without them, "everything cached" is indistinguishable from a broken harness.
const counts = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  if (url.pathname === "/counts") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(counts));
    return;
  }

  const match = /^\/probe\/([abcdef])$/.exec(url.pathname);
  if (match === null) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  const cell = match[1];
  counts[cell] += 1;
  const n = counts[cell];

  // Log every hit with a timestamp so build-time requests are distinguishable
  // from curl-driven ones after the fact.
  console.log(`${new Date().toISOString()} hit /probe/${cell} -> count=${n}`);

  res.writeHead(200, {
    "content-type": "application/json",
    "x-ratelimit-limit": String(LIMIT),
    "x-ratelimit-remaining": String(LIMIT - n),
    "x-ratelimit-reset": String(RESET_AT),
  });
  res.end(JSON.stringify({ cell, serverCount: n }));
});

server.listen(PORT, HOST, () => {
  console.log(`probe server listening on http://${HOST}:${PORT}`);
});
```

**Probe route** — `src/app/cache-probe/page.tsx`, deleted after use:

```tsx
/**
 * TEMPORARY probe route for plan 01-02. Deleted in Task 2. Do not ship.
 *
 * Reads `searchParams` deliberately: it is a Request-time API, so the route is
 * dynamic exactly as the real search page will be, and the measurement is of
 * the data cache rather than of build-time prerendering.
 */

const PROBE_ORIGIN = "http://127.0.0.1:4599";

type ProbeBody = { cell: string; serverCount: number };

// e and f are negative controls: configurations the docs say must NOT cache.
// If they also report a count of 1 the harness is measuring something other
// than the data cache and every other cell is meaningless.
type Cell = "a" | "b" | "c" | "d" | "e" | "f";

const CELLS: readonly string[] = ["a", "b", "c", "d", "e", "f"];

function isCell(value: unknown): value is Cell {
  return typeof value === "string" && CELLS.includes(value);
}

async function probe(cell: Cell): Promise<{ body: ProbeBody; remaining: string }> {
  const url = `${PROBE_ORIGIN}/probe/${cell}`;

  const response = await (async () => {
    switch (cell) {
      case "a":
        return fetch(url, { next: { revalidate: 60 } });
      case "b":
        return fetch(url, {
          next: { revalidate: 60 },
          signal: AbortSignal.timeout(5000),
        });
      case "c":
        return fetch(url, { cache: "force-cache", next: { revalidate: 60 } });
      case "d":
        return fetch(url, {
          cache: "force-cache",
          next: { revalidate: 60 },
          signal: AbortSignal.timeout(5000),
        });
      case "e":
        return fetch(url);
      case "f":
        return fetch(url, { cache: "no-store" });
    }
  })();

  const body = (await response.json()) as ProbeBody;
  return {
    body,
    remaining: response.headers.get("x-ratelimit-remaining") ?? "none",
  };
}

export default async function CacheProbePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const cell = (await searchParams).cell;

  if (!isCell(cell)) {
    return <p>cell must be one of a, b, c, d</p>;
  }

  const { body, remaining } = await probe(cell);

  return (
    <p>
      cell={body.cell} serverCount={body.serverCount} remaining={remaining}
    </p>
  );
}
```

**Driver:**

```bash
nvm use
node probe-server.mjs &
rm -rf .next/cache && npm run build      # confirm `ƒ /cache-probe`
# restart the probe server so every counter starts at zero
npx next start --port 3100
for cell in a b c d e f; do
  for i in 1 2 3; do curl -s "http://127.0.0.1:3100/cache-probe?cell=$cell"; done
done
curl -s http://127.0.0.1:4599/counts
```

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Added negative control cells e and f**

- **Found during:** Task 1, after the first run returned 1 for all four planned cells.
- **Issue:** The plan's four cells all cached, including cell a, which D-11a predicted would not. With only caching cells measured, "everything cached" is indistinguishable from a harness that never reached the server twice — a broken probe produces the identical result. Recording a finding that contradicts a recorded decision on the strength of an unvalidated instrument would have repeated exactly the failure this plan exists to prevent.
- **Fix:** Added cell e (no cache options) and cell f (`cache: "no-store"`) — configurations the docs say must not cache. Both hit upstream 3 times out of 3, proving the instrument detects an uncached request. Re-ran the full six-cell matrix from a cleared `.next/cache` and a fresh build.
- **Files modified:** scratch harness and the temporary probe route (both since deleted); the controls are recorded in `docs/OPERATIONS.md`.
- **Commit:** 2f4a52c

**2. [Rule 3 - Blocking issue] Stale `.next/types/validator.ts` broke typecheck after deleting the probe route**

- **Found during:** Task 2 verification.
- **Issue:** `npm run typecheck` failed with `TS2307: Cannot find module '../../src/app/cache-probe/page.js'`. Next's generated route validator still referenced the deleted probe route.
- **Fix:** Re-ran `npm run build` to regenerate the route types. Typecheck then passed and the route table confirmed only `/` and `/_not-found` remain. Caused directly by this task's cleanup, so in scope.
- **Files modified:** none tracked — `.next/` is generated.
- **Commit:** n/a (build artifact)

**3. [Judgement] API-05 and OBS-02 deliberately left Pending in REQUIREMENTS.md**

- **Found during:** state update.
- **Issue:** This plan's frontmatter lists `requirements: [API-05, OBS-02]`, and the standard flow marks a plan's requirements complete. But this plan measured and decided; it shipped no caching and no timeout code — `src/lib/github/client.ts` does not exist. Both requirements are also claimed by plan 01-03 (and API-05 by 01-04), which write the code that actually delivers them.
- **Fix:** Left both Pending. Marking API-05 delivered while no cached request exists is precisely the silent failure this plan's own checkpoint text names: *"Shipping an uncached client while leaving API-05 marked as delivered is precisely the silent failure D-11a exists to prevent."*
- **Commit:** n/a

**4. [Scope] AI usage log not updated here**

- Plan 01-05 Task 3 explicitly owns the phase's entry as `## Process 6` / `## 工程 6`, names this measurement as a required *why*, and gates on both files holding equal entry counts of at least 6. Adding an entry now would duplicate it and break that check. Correctly deferred, not omitted.

## Contradiction Recorded, Not Buried

D-11a in `01-CONTEXT.md` states that `revalidate` alone would not cache and that an app passing it would burn quota on every render. **Cell a measures that premise false.** D-11a's *conclusion* — pass `force-cache` — still stands, for the reasons in the decision above. This is recorded in `docs/OPERATIONS.md` in plain terms rather than smoothed over.

`01-CONTEXT.md` itself was **not** edited: this plan's `files_modified` scopes it to `docs/OPERATIONS.md`, and CONTEXT.md is a record of what was decided at discussion time rather than a live document. The correction lives in OPERATIONS.md, which is the canonical operational reference. Flagging it for the human at Task 3 in case they want D-11a annotated.

## Verification

Full gate, all run in this session and output read:

| Command | Result |
|---|---|
| `npm run lint` | pass, no output |
| `npm run typecheck` | pass |
| `npm run test:coverage` | 3 files, 21 tests passed; 100% statements/branches/functions/lines |
| `npm run build` | pass; route table shows only `○ /` and `○ /_not-found` |

Plan verification block:

| Check | Result |
|---|---|
| `grep -n "### Measured: what the fetch cache does to this signal" docs/OPERATIONS.md` | line 42 |
| `grep -c "force-cache" docs/OPERATIONS.md` | 5 |
| `git status --porcelain src/app/` | empty |
| `test ! -d src/app/cache-probe` | pass |
| `git diff --stat package.json package-lock.json` | empty — no dependency added |
| `grep -rn "127.0.0.1:4599" src/` | no matches |

## Threat Mitigations Applied

- **T-01-22** (probe left in `src/app/`) — `src/app/cache-probe/` deleted; `git status --porcelain src/app/` empty; build route table no longer lists it.
- **T-01-24** (probe reachable beyond the machine) — bound to `127.0.0.1` explicitly, never `0.0.0.0`; both servers killed at teardown.
- **T-01-25** (measuring against live GitHub) — the probe never contacted `api.github.com`; 21 upstream requests went to the local counter.
- **T-01-SC** (npm installs) — nothing installed; `package.json`/`package-lock.json` diff is empty.

## Known Stubs

None. This plan produced no application code.

## Self-Check: PASSED

- `docs/OPERATIONS.md` exists and carries the heading at line 42, with 5 occurrences of `force-cache`.
- `.planning/phases/01-github-api-client/01-02-SUMMARY.md` exists.
- Commit `2f4a52c` exists in the repository.
- `src/app/cache-probe/` is absent, the scratch probe server is deleted, and no probe or `next start` process is left running.
