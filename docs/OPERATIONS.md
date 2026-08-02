# Operations

How this app would be observed and how it behaves when GitHub misbehaves. Reasoning and policy — the code lands in the phases named against each item.

> **Status:** the logging, timeout, retry and caching policy below is **implemented** in `src/lib/github/` as of Phase 1. This document fixed the policy *before* the code was written — because "we'll add logging later" is how apps reach production unobservable — and has since been reconciled against what actually shipped. Where a measurement contradicted the policy's premise, the measurement is recorded rather than smoothed over.

## Governing constraint: free, local, and optional

Two rules bound every choice below.

1. **No paid services.** Everything named here is open source and self-hostable. No vendor account is needed to develop, test, or review this app.
2. **The app must keep running with zero services.** `npm install && npm run dev` stays the whole setup. Observability that *requires* a collector, a database, or a container to be up would break that, so the default path writes to stdout and nothing else. Anything heavier is opt-in and never a prerequisite.

| Concern | Default (zero infrastructure) | Optional local upgrade | Licence |
|---|---|---|---|
| Logging | **`console.log` with `JSON.stringify`** — one structured JSON line per event, no dependency (D-17, D-18) | A log shipper (Promtail, Vector, or the platform's own) tails stdout → Loki, viewed in Grafana. **No application change** | — / AGPL |
| Error tracking | Errors logged with a correlation id at the App Router boundaries | Self-hosted GlitchTip (Sentry-SDK compatible) | AGPL |
| Tracing | Off | OpenTelemetry via `@vercel/otel` → local Jaeger | Apache 2.0 |
| Metrics | Derived from logs | Prometheus + Grafana | Apache 2.0 / AGPL |

**Why `console.log` and not a logging library.** `AGENTS.md` requires preferring the platform over a library, and this is the case where that rule pays. A read-only app with one upstream needs no levels beyond a derived string, no transports, and no redaction machinery — the log entry type is closed, so there is no field a token or a header bag *could* be written into, which is a stronger guarantee than a redaction rule anyone can forget to configure. Next already writes stdout. A logging dependency would buy nothing and cost a supply-chain surface, a version to keep current, and an `npm audit` line item.

**The upgrade path does not require adopting one either**, which is the part worth stating plainly: stdout JSON is already shippable. Moving to Loki is an infrastructure change — point a shipper at the process's stdout — not a code change. So the "optional upgrade" column costs zero refactoring, which is a better property than the alternative it replaced.

The optional column exists to show the path is real, not to be run day to day. If added, it belongs in a `docker-compose.observability.yml` that is **not** referenced by `npm run dev`.

Deliberately excluded: Sentry SaaS, Datadog, New Relic, Vercel Analytics. All are paid or account-bound, and none can run offline.

## The signal that actually matters: rate-limit headroom

This app has one dominant failure mode, and it is not a bug in the code. **Unauthenticated GitHub search allows roughly 10 requests per minute.** Exhausting that is the single most likely reason a user sees something go wrong.

Every GitHub response carries the answer in its headers:

| Header | Meaning |
|---|---|
| `x-ratelimit-limit` | Ceiling for this window |
| `x-ratelimit-remaining` | Requests left — **the number to watch** |
| `x-ratelimit-reset` | Unix seconds until the window resets |
| `retry-after` | Present on some 403/429 responses; authoritative when it is |

Policy, and as of Phase 1 the implementation: `githubFetch()` reads these on every response and includes them in its log line. Remaining headroom is therefore visible in normal operation, not just at the moment of failure — the difference between "we were rate limited at 14:03" and "we were one request from the limit for six minutes beforehand."

If a threshold alert were ever wired up, this is the one worth having. Nothing else in the app degrades gradually.

### Measured: what the fetch cache does to this signal

**Measured 2026-08-02 against Next.js 16.2.12** (Turbopack, App Router, `cacheComponents` **not** enabled — so the "caching without Cache Components" model applies). Cache behaviour changed between Next 14 and 15 and will change again; re-run this before trusting it on a different version.

Everything below is counted, not reasoned. A local Node HTTP server on `127.0.0.1:4599` served six independent paths, each with its own request counter and its own `x-ratelimit-*` headers. GitHub was never contacted — a twelve-request measurement against a ~10/minute unauthenticated quota would have measured GitHub's throttling instead of Next's cache. A temporary dynamic route awaited `searchParams` and fetched one path per cell; the build's route table confirmed it as `ƒ (Dynamic)`, so what follows is the persistent data cache and not build-time prerendering.

#### Commands

```bash
nvm use                                  # Node 24.18.1
node probe-server.mjs &                  # counting server on 127.0.0.1:4599
rm -rf .next/cache && npm run build      # confirm route table shows `ƒ /cache-probe`
# restart the probe server here so every counter starts at zero
npx next start --port 3100               # production build only: dev mode has an HMR fetch cache
for cell in a b c d e f; do
  for i in 1 2 3; do curl -s "http://127.0.0.1:3100/cache-probe?cell=$cell"; done
done
curl -s http://127.0.0.1:4599/counts     # the answer
```

`curl`, not a browser: a browser hard refresh sends `cache-control: no-cache`, which makes `options.cache` and `options.next.*` ignored entirely.

#### The matrix

| Cell | `fetch` options | Requests sent | Upstream received | Cached? |
|---|---|---|---|---|
| a | `{ next: { revalidate: 60 } }` | 3 | **1** | yes |
| b | `{ next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) }` | 3 | **1** | yes |
| c | `{ cache: "force-cache", next: { revalidate: 60 } }` | 3 | **1** | yes |
| d | `{ cache: "force-cache", next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) }` | 3 (then 6) | **1** | yes |
| e *(control)* | *none* — the `auto no cache` default | 3 | **3** | no |
| f *(control)* | `{ cache: "no-store" }` | 3 | **3** | no |

Cells **e** and **f** are negative controls and are the reason the other four rows mean anything. Without them "everything cached" is indistinguishable from a broken harness that never reached the server twice. They hit the server on all three requests and their rendered `x-ratelimit-remaining` decremented 59 → 58 → 57, so the instrument demonstrably detects an uncached request. Cell **d** was then driven three further times and held at 1 upstream request across all six.

#### What the counts answer

- **Q1 — does `next: { revalidate: 60 }` alone cache? Yes.** This contradicts the premise of D-11a, which held that `revalidate` alone would not cache and that quota would burn on every render. Measured: a *positive* `next.revalidate` is itself an opt-in to the data cache. The docs' "by default, `fetch` requests are not cached" is about a request carrying **no** cache directive at all — that is cell **e**, which did burn a request every render. D-11a's premise is wrong; **its conclusion still stands**, for the reason in the decision below.
- **Q2 — does `cache: 'force-cache'` change the answer? No.** Cell c matched cell a exactly. `force-cache` is not *required* for caching here; it is the explicit, documented spelling of it.
- **Q3 — does an `AbortSignal` opt the request out of the data cache? No.** Cell b matched a, and cell d matched c. This was the open question in D-11b and the one that could have forced a choice between API-05 and OBS-02. It does not: **the timeout and the cache coexist with no trade-off.** The documented opt-out of *memoization* (the per-render dedupe) is unaffected by this finding and remains harmless here, since each endpoint is called once per render.
- **Q4 — what do the rate-limit headers say on a cache hit? They are stale.** Every cached response rendered `x-ratelimit-remaining=59` — the value captured on the first call — while the upstream counter never advanced past 1. A cached response replays the headers from when it was stored.

#### Consequences for the log line

- **`rateLimitRemaining` from a cached response is historical, not live headroom.** This app's one leading indicator can therefore lie by omission: it goes quiet at the value it was cached with while real headroom is untouched (because no request was made) — or, after a revalidation, jumps. Read it as "headroom as of the last real call", never as current. It is still the right thing to log; it is not the right thing to alert on without knowing whether the call was served from cache.
- **`cacheHit` stays `null`.** The measurement found no reliable in-process signal: on a cache hit the `Response` handed to application code was indistinguishable from a miss — same status, same headers, nothing added by the framework to discriminate. Inferring it from `durationMs` is **explicitly rejected**: a duration threshold silently misreports under load, and a wrong `cacheHit` is worse than an absent one because it looks authoritative. An absent field invites a question; a confidently wrong one ends the investigation in the wrong place.

#### The decision — the fetch options Phase 1's `githubFetch` ships

```ts
fetch(url, {
  cache: "force-cache",
  next: { revalidate: revalidateSeconds }, // 60 for search, 300 for detail (D-09)
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), // 5000 (OBS-02)
});
```

All three options ship together, and cell **d** is exactly that configuration measured caching.

`cache: "force-cache"` is kept even though cell a proves it is redundant, and the redundancy is the point. It is the spelling the Next docs name as *the* way to cache a request, it states the intent at the call site rather than requiring the reader to know that a positive `revalidate` implies caching, and it keeps the opt-in explicit if the `revalidate` value is ever changed to `0` or made conditional. The cost is one property; the failure it prevents is the silent, CI-passing, quota-burning uncached client that D-11a exists to prevent.

No amendment to the resilience table below is needed: the timeout is still `AbortSignal.timeout()` and the abort signal is still propagated, because Q3 showed keeping both costs nothing.

#### Confirmed against the shipped client

**Confirmed 2026-08-02.** Everything above measured a hand-written `fetch` in a probe route. This confirms the same behaviour of the **shipped `githubFetch()`**, which is a different claim: the options can be right and the function still not cache. Only this counted run satisfies API-05.

A local Node counting server on `127.0.0.1:4599` served `/probe/confirm`. A temporary dynamic route awaited `searchParams` and called the real `githubFetch({ path: "/probe/confirm", endpoint: "search/repositories", revalidate: 60 })`. The build's route table confirmed `ƒ /cache-confirm` before anything was driven, and the probe server was restarted after the build so the counter started at zero — the build issued no probe requests either way.

| | Count |
|---|---|
| Requests sent to the app | 6 (3, then 3 more) |
| Requests received upstream | **1** |
| `serverCount` rendered | `1` on all six |

**One upstream request for six renders: the shipped client caches.** The three log lines from the first burst also show the Q4 finding as an operational fact rather than a prediction — `rateLimitRemaining: 59` was replayed identically on all three while the upstream counter never advanced past 1, and `durationMs` fell 26 → 1 → 0, which is exactly the signal that must **not** be turned into a `cacheHit` guess.

The base URL was pointed at the probe by a **temporary one-line edit** to the `GITHUB_API_BASE_URL` constant in `src/lib/github/client.ts`, restored from a backup and verified byte-identical by `diff` at the end of the task.

**It was deliberately not made configurable** — not by environment variable, not by a constructor argument, not by a test-only export (T-01-26). An env-settable base URL is a one-variable token-exfiltration path: anyone who can set an environment variable redirects the `Authorization` header, and the app's single secret, to a host they control. A reverted source edit buys identical test coverage and adds no attack surface, so the trade is not close. The next person who proposes the environment variable should find this paragraph before they ship it.

## What gets logged

Structured JSON, one object per event, written to stdout. Server-side only — Server Components already run on the server, so there is no client logging path to build.

**Every outbound GitHub call — as shipped in Phase 1 (`src/lib/github/log.ts`):**

| Field | Example | Note |
|---|---|---|
| `requestId` | `56476d64-…` | Generated **per GitHub call** with `crypto.randomUUID()` — and that is the shipped v1 behaviour, by decision. A retry shares the id of the call that produced it, so both attempts correlate — and with one upstream and one GitHub call per user action, per-call correlation is the only correlation this app has needed. Threading a per-*inbound*-request id through would require opening the sealed `src/lib/github/` boundary; that is v2 work, if ever |
| `route` | — | **Omitted, by decision.** The `endpoint` literal union already identifies which of the two calls logged, and with exactly two routes mapping 1:1 onto two endpoints, a `route` field would duplicate `endpoint` under another name. If a route ever serves more than one endpoint — or an endpoint more than one route — that 1:1 mapping breaks and this decision should be revisited |
| `endpoint` | `search/repositories` or `repos/{owner}/{repo}` | A literal union — a typo fails the build |
| `status` | `200`, `403`, `404`, `422`, or `null` | `null` when the request never completed |
| `durationMs` | `142` — and legitimately `0` on a cache hit | Reported as measured, never floored to a positive number |
| `rateLimitRemaining` / `rateLimitReset` | `59` / `2000000000`, or `null` | From the headers above; `null` when absent or unparseable. **Historical on a cache hit**, per [§ Measured](#measured-what-the-fetch-cache-does-to-this-signal) Q4 |
| `cacheHit` | Always `null` | Deliberate, and the reason is counted rather than asserted: [§ Measured](#measured-what-the-fetch-cache-does-to-this-signal) found no in-process signal that discriminates a hit from a miss, and [§ Confirmed against the shipped client](#confirmed-against-the-shipped-client) observed `durationMs` falling 26 → 1 → 0 across cached renders — exactly the signal that must not be turned into a guess |
| `errorType` | `"GitHubRequestError"`, or the timeout classification `toRequestError` produces | On failure only. The vocabulary is the four codes (`RATE_LIMIT`, `NOT_FOUND`, `INVALID_QUERY`, `NETWORK`) and the one thrown class — there are no per-status error classes |

**Levels:** `error` for unexpected failures, a null status, and 5xx; `warn` for 403/429/404; `info` for completed requests. The level is **derived inside `logGitHubCall`**, never passed in, so two call sites cannot disagree about what a 403 means. There is no `debug` level and no cache-decision line: [§ Measured](#measured-what-the-fetch-cache-does-to-this-signal) established that a cache decision is not observable to application code, so a "cache decisions" log line could only have been invented.

One ordering consequence worth knowing when reading stdout: a malformed-JSON 200 logs at `level: "info"` **before** it throws. The order is deliberate — read headers, log, then branch — so the line is guaranteed even when a later step fails. An `info` line can therefore be immediately followed by a boundary error.

### What is deliberately not logged

- **The token.** Never the value, never a prefix, never the `Authorization` header. Logging is header-selective — the whole header bag is never dumped.
- **Personal data.** There is none. No accounts, no sessions, no cookies, no analytics, no IP retention. This is a property of the architecture, not a policy to enforce: the app has no user identity to leak. See [SECURITY.md](./SECURITY.md).
- **Full response bodies.** Status, timing, and headers are enough to debug; bodies are large and add nothing.

Search keywords *are* logged, since they are public search terms with no user attached. If this app ever gained accounts, that decision would need revisiting.

## Resilience policy

The problem this policy exists for: a bare `fetch()` has **no timeout** and will wait indefinitely if GitHub stalls. In a Server Component that holds the render open and the user sees nothing.

Shipped in Phase 1 (`src/lib/github/client.ts`), and every row is proven by asserting `fetch` call counts rather than by reading the code:

| Concern | Decision | Reason |
|---|---|---|
| **Timeout** | 5s per GitHub request via `AbortSignal.timeout(5000)` | A slow response is a failed response from the user's point of view. Better a fast, honest error state than an indefinite hang. A timeout is **never** retried, so the worst case is one deadline |
| **Retry on rate limit (403/429)** | **Never** | Retrying consumes the quota that is already exhausted and makes recovery slower. Respect `x-ratelimit-reset` and tell the user when to try again |
| **Retry on 4xx** | Never | 404 and 422 are deterministic. Repeating them cannot change the answer |
| **Retry on 5xx** | Never | No HTTP response is retried at all. A 5xx throws `GitHubRequestError` on the first attempt |
| **Retry on transient network faults** | At most one, after 250ms | Covers a dropped connection without amplifying an outage. A `TypeError` from `fetch` is the only thing that retries |
| **Cancellation** | Propagate the request's abort signal | If the user navigates away, the in-flight GitHub call should not outlive the render |
| **Circuit breaking** | Not implemented | Meaningful for high-volume services with a failing dependency. Here, GitHub's own rate-limit headers already tell us when to stop, and traffic is one request per user action |

The retry rule is the one worth stating explicitly, because the instinct is backwards: the failure most likely to tempt a retry is exactly the one where retrying is harmful.

## Error tracking

App Router error boundaries (`error.tsx`, `not-found.tsx`) render the user-facing state; the underlying error is logged with its `requestId` so a report can be tied to a specific request. Users never see a stack trace — that rule is already in `AGENTS.md`.

If self-hosted error tracking is added later, GlitchTip is the choice: it speaks the Sentry SDK protocol, so instrumentation is not vendor-specific and can be pointed at Sentry SaaS instead without touching application code. That reversibility is the reason for choosing it over a bespoke handler.

## If this were deployed

Deployment is not in the brief and no target is configured, so nothing here is set up. Recording the reasoning anyway, since "production-minded" invites the question:

- **Runtime configuration.** The only variable is `GITHUB_TOKEN`, server-side, injected by the platform rather than baked into the build. It is read at request time, not build time, so the same artifact runs in every environment.
- **Health check.** A liveness endpoint would be needed for any orchestrator. It does not exist, because adding a route handler to an app whose pages are all Server Components would be the only such route in the codebase — worth it when there is something to orchestrate, not before.
- **Rollback.** Immutable build artifacts, redeploy the previous one. There is no database, no migration, and no persisted state, so rollback is genuinely just "serve the old bundle" — one of the concrete dividends of the no-database decision.
- **Scaling.** Stateless by construction; instances share nothing. The binding constraint is GitHub's rate limit, not compute — so the effective scaling lever is caching and a token, not more instances.

## Deliberately out of scope

| Not doing | Why |
|---|---|
| SLOs and error budgets | No production traffic, no users, no operator to hold to a target |
| On-call and paging | No one is on call for a selection task |
| Incident runbook | Needs an incident history and a team; the rate-limit handling above is the one procedure worth having and it is automated, not manual |
| Real User Monitoring | Requires shipping a client-side agent and collecting visitor data — cost without a question it would answer |
| Distributed tracing (by default) | One service and one upstream. A trace would show what the log line already says |

---

*Requirements: OBS-01, OBS-02 in `.planning/REQUIREMENTS.md`. Delivered in Phase 1 with the GitHub client.*
