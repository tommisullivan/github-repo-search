# Operations

How this app would be observed and how it behaves when GitHub misbehaves. Reasoning and policy — the code lands in the phases named against each item.

> **Status:** nothing here is implemented yet. `src/lib/github/` does not exist. This document fixes the policy before the code is written, because "we'll add logging later" is how apps reach production unobservable.

## Governing constraint: free, local, and optional

Two rules bound every choice below.

1. **No paid services.** Everything named here is open source and self-hostable. No vendor account is needed to develop, test, or review this app.
2. **The app must keep running with zero services.** `npm install && npm run dev` stays the whole setup. Observability that *requires* a collector, a database, or a container to be up would break that, so the default path writes to stdout and nothing else. Anything heavier is opt-in and never a prerequisite.

| Concern | Default (zero infrastructure) | Optional local upgrade | Licence |
|---|---|---|---|
| Logging | Structured JSON to stdout via `pino` | `pino` → Loki, viewed in Grafana | MIT / AGPL |
| Error tracking | Errors logged with a correlation id at the App Router boundaries | Self-hosted GlitchTip (Sentry-SDK compatible) | AGPL |
| Tracing | Off | OpenTelemetry via `@vercel/otel` → local Jaeger | Apache 2.0 |
| Metrics | Derived from logs | Prometheus + Grafana | Apache 2.0 / AGPL |

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

Policy: `githubFetch()` reads these on every response and includes them in its log line (Phase 1). Remaining headroom is therefore visible in normal operation, not just at the moment of failure — the difference between "we were rate limited at 14:03" and "we were one request from the limit for six minutes beforehand."

If a threshold alert were ever wired up, this is the one worth having. Nothing else in the app degrades gradually.

## What gets logged

Structured JSON, one object per event, written to stdout. Server-side only — Server Components already run on the server, so there is no client logging path to build.

**Every outbound GitHub call (Phase 1):**

| Field | Example |
|---|---|
| `requestId` | Correlation id, generated per inbound request |
| `route` | `/` or `/repos/[owner]/[repo]` |
| `endpoint` | `search/repositories` or `repos/{owner}/{repo}` |
| `status` | `200`, `403`, `404`, `422` |
| `durationMs` | `142` |
| `rateLimitRemaining` / `rateLimitReset` | From the headers above |
| `cacheHit` | Whether Next's fetch cache served it |
| `errorType` | `RateLimitError` etc., on failure only |

**Levels:** `error` for unexpected failures and network faults; `warn` for rate limiting and 4xx that indicate a real problem; `info` for completed requests; `debug` for cache decisions.

### What is deliberately not logged

- **The token.** Never the value, never a prefix, never the `Authorization` header. Logging is header-selective — the whole header bag is never dumped.
- **Personal data.** There is none. No accounts, no sessions, no cookies, no analytics, no IP retention. This is a property of the architecture, not a policy to enforce: the app has no user identity to leak. See [SECURITY.md](./SECURITY.md).
- **Full response bodies.** Status, timing, and headers are enough to debug; bodies are large and add nothing.

Search keywords *are* logged, since they are public search terms with no user attached. If this app ever gained accounts, that decision would need revisiting.

## Resilience policy

Currently unspecified in code, which is itself the problem: a bare `fetch()` has **no timeout** and will wait indefinitely if GitHub stalls. In a Server Component that holds the render open and the user sees nothing.

Policy for Phase 1:

| Concern | Decision | Reason |
|---|---|---|
| **Timeout** | ~5s per GitHub request via `AbortSignal.timeout()` | A slow response is a failed response from the user's point of view. Better a fast, honest error state than an indefinite hang |
| **Retry on rate limit (403/429)** | **Never** | Retrying consumes the quota that is already exhausted and makes recovery slower. Respect `x-ratelimit-reset` and tell the user when to try again |
| **Retry on 4xx** | Never | 404 and 422 are deterministic. Repeating them cannot change the answer |
| **Retry on transient network faults** | At most one, short backoff | Covers a dropped connection without amplifying an outage |
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
