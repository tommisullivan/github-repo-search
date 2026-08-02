/**
 * `githubFetch()` — the single outbound path to `api.github.com`.
 *
 * **Server-side only. Never import this module from a Client Component.** This
 * is the one place that reads `GITHUB_TOKEN`, and keeping it out of the client
 * graph is what keeps the token out of the browser bundle by construction
 * (API-03, docs/SECURITY.md). The `server-only` package would enforce this at
 * build time; it is deliberately not added, because Phase 1 forbids new
 * production dependencies and the package is not already in the tree. The rule
 * is held by the ARCHITECTURE.md boundary table instead: only `search.ts` and
 * `repo.ts` import this, and both are server-side units.
 *
 * This is the shared HTTP core. It may depend on `errors.ts`, `log.ts`, and
 * `@/types/github`; it must never import `search.ts` or `repo.ts`, and it must
 * never contain endpoint-specific query logic. `path` arrives fully built and
 * already encoded from the calling unit — deciding *what* to ask GitHub is the
 * unit's job, deciding *how* to ask is this module's.
 */

import { GitHubRequestError, toFailure, toRequestError } from "./errors";
import type { Result } from "./errors";
import { logGitHubCall, logUnauthenticatedOnce } from "./log";
import type { GitHubEndpointLabel } from "./log";

/**
 * Hard-coded, and it stays hard-coded (T-01-26). An environment-settable base
 * URL is a one-variable token-exfiltration path: anyone who can set it
 * redirects the `Authorization` header to a host they control. Plan 01-03
 * Task 2 confirmed the cache end to end by temporarily editing this line and
 * restoring it from a backup — the same coverage with no attack surface.
 */
const GITHUB_API_BASE_URL = "https://api.github.com";

/** The ~5s deadline from the resilience table in docs/OPERATIONS.md (OBS-02). */
const REQUEST_TIMEOUT_MS = 5000;

/** Short backoff before the single transport retry. */
const TRANSPORT_RETRY_DELAY_MS = 250;

const GITHUB_API_VERSION = "2022-11-28";

/**
 * A leading single `/` followed by a character that cannot start another
 * authority. Backslash is excluded as well as slash: the WHATWG URL parser
 * treats `\` as `/` in a special scheme, so `new URL("/\\evil.example.com/x",
 * "https://api.github.com")` resolves to `https://evil.example.com/x` — the
 * same origin hijack as the protocol-relative form, one character away.
 */
const SITE_RELATIVE_PATH = /^\/[^/\\]/;

export type GitHubFetchOptions = {
  /** A fully built, already-encoded absolute path with its query string. */
  path: string;
  /** Which endpoint this is, for the log line. */
  endpoint: GitHubEndpointLabel;
  /** How stale the caller tolerates: 60s for search, 300s for detail (D-09). */
  revalidate: number;
};

/**
 * Composes the outbound URL, refusing anything that could address another
 * origin (SEC-03, T-01-05).
 *
 * The units build their paths with `URLSearchParams` and `encodeURIComponent`,
 * so this should never fire. It exists so that if some future edit ever
 * concatenates a user-supplied value into `path`, the request fails here
 * instead of carrying the `Authorization` header to whatever host that value
 * named. The rejected path is deliberately **not** interpolated into the
 * message: error messages reach the logs, and OBS-03 keeps caller-supplied
 * content out of them.
 */
function toGitHubUrl(path: string): string {
  if (!SITE_RELATIVE_PATH.test(path)) {
    throw new GitHubRequestError(
      "GitHub request path must be a site-relative path beginning with a single '/'"
    );
  }

  return new URL(path, GITHUB_API_BASE_URL).toString();
}

/**
 * Read at call time, never at module load: OPERATIONS.md requires the same
 * build artifact to run in any environment, so the token is request-time
 * configuration rather than something baked into the bundle.
 *
 * An empty or whitespace-only value is treated as absent — `Bearer ` with
 * nothing after it is a 401 with a confusing message, and a variable that was
 * set to the empty string means the operator did not supply a token.
 */
function readToken(): string | null {
  const raw = process.env.GITHUB_TOKEN;
  if (raw === undefined) {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };

  const token = readToken();
  if (token === null) {
    logUnauthenticatedOnce();
    return headers;
  }

  headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Reads an integer header, treating a missing or unparseable value as absent. */
function headerInt(response: Response, name: string): number | null {
  const raw = response.headers.get(name);
  if (raw === null) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type CompletedAttempt = { response: Response; durationMs: number };

/**
 * Makes the request, retrying **at most once** and **only** on a transport
 * fault.
 *
 * The retry rule is worth stating because the instinct is backwards. No HTTP
 * response is ever retried, whatever its status: a 403, 429, 404 or 422 is
 * deterministic, and retrying a rate limit spends quota that is already
 * exhausted, delaying the reset the user is waiting for (T-01-09). Retrying is
 * reserved for a `TypeError`, which is how `fetch` reports a dropped
 * connection or DNS failure — a fault that a second attempt genuinely can
 * clear.
 *
 * A `TimeoutError` is never retried either. The caller has already waited the
 * full deadline; a second wait doubles the time the render is blocked, which
 * is the exact harm the timeout exists to prevent (T-01-08).
 *
 * Each attempt is logged separately, so a retry is visible in stdout rather
 * than hidden inside a single line's duration.
 */
async function requestWithSingleTransportRetry(
  url: string,
  headers: Record<string, string>,
  revalidate: number,
  endpoint: GitHubEndpointLabel,
  requestId: string
): Promise<CompletedAttempt> {
  let transportFaults = 0;

  for (;;) {
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        headers,
        // ── The three options plan 01-02 measured, verbatim from the decision
        // line in docs/OPERATIONS.md § "Measured". Cell d is exactly this
        // configuration and it served three renders from one upstream request.
        //
        // `cache: "force-cache"` is REQUIRED, not redundant, and a later
        // reader will be tempted to remove it. Two things make it load-bearing:
        // it is the documented spelling of "cache this", and it survives
        // `revalidate` ever becoming `0` or conditional. Dropping it produces
        // no error, no warning and no type failure — only an app that quietly
        // spends its entire rate limit on repeat renders, green in CI and
        // visible only as rate-limit errors under real use (D-11a, T-01-27).
        // `client.test.ts` asserts this exact field for that reason.
        //
        // `cache: "no-store"` must NEVER be paired with `revalidate`: the Next
        // docs state that conflicting options are both ignored, giving neither
        // caching nor no-store — the worst of the three outcomes.
        cache: "force-cache",
        next: { revalidate },
        // Measured in plan 01-02 (Q3): an AbortSignal does not opt the request
        // out of the persistent data cache, so the OBS-02 timeout and the
        // API-05 cache coexist at no cost. It does opt out of per-render
        // memoization, which is harmless here — each endpoint is called once
        // per render.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      return { response, durationMs: Date.now() - startedAt };
    } catch (cause) {
      const error = toRequestError(cause);

      logGitHubCall({
        event: "github_request",
        requestId,
        endpoint,
        status: null,
        durationMs: Date.now() - startedAt,
        rateLimitRemaining: null,
        rateLimitReset: null,
        cacheHit: null,
        errorType: error.name,
      });

      const isTransportFault = cause instanceof TypeError;
      if (!isTransportFault || transportFaults > 0) {
        throw error;
      }

      transportFaults += 1;
      await delay(TRANSPORT_RETRY_DELAY_MS);
    }
  }
}

/**
 * Performs one GitHub request and maps it to a `Result`.
 *
 * Returned versus thrown follows D-01/D-05a: `RATE_LIMIT`, `NOT_FOUND` and
 * `INVALID_QUERY` are normal states of a working app and come back as values;
 * transport faults and unrecognised statuses throw `GitHubRequestError` and
 * reach the App Router error boundary.
 *
 * The generic is **asserted, not validated**. Checking the body against a
 * schema at runtime would need a dependency Phase 1 forbids, so the cast below
 * is the deliberate trade (T-01-11): a malformed body still throws at parse
 * time, and the cast is confined to one line so nothing downstream ever needs
 * to cast again.
 */
export async function githubFetch<T>(
  options: GitHubFetchOptions
): Promise<Result<T>> {
  const { path, endpoint, revalidate } = options;

  // Before anything else, and before any network activity.
  const url = toGitHubUrl(path);

  const requestId = crypto.randomUUID();
  const headers = buildHeaders();

  const { response, durationMs } = await requestWithSingleTransportRetry(
    url,
    headers,
    revalidate,
    endpoint,
    requestId
  );

  logGitHubCall({
    event: "github_request",
    requestId,
    endpoint,
    status: response.status,
    durationMs,
    // Historical, not live headroom: plan 01-02 measured that a cached
    // response replays the rate-limit headers it was stored with. Log it, read
    // it as "as of the last real call", never alert on it.
    rateLimitRemaining: headerInt(response, "x-ratelimit-remaining"),
    rateLimitReset: headerInt(response, "x-ratelimit-reset"),
    // Stays null by measurement, not by omission. On a cache hit the Response
    // handed to application code is indistinguishable from a miss — same
    // status, same headers. Inferring it from `durationMs` is explicitly
    // rejected in docs/OPERATIONS.md: a wrong `cacheHit` is worse than an
    // absent one, because it looks authoritative and ends an investigation in
    // the wrong place.
    cacheHit: null,
    errorType: null,
  });

  if (response.ok) {
    let payload: unknown;

    try {
      payload = await response.json();
    } catch (cause) {
      throw toRequestError(cause, response.status);
    }

    return { ok: true, data: payload as T };
  }

  const failure = toFailure(response);
  if (failure !== null) {
    return { ok: false, error: failure };
  }

  // `null` means the status is not one this app can name — a 5xx, or anything
  // unexpected. D-03: that throws rather than returning.
  throw toRequestError(undefined, response.status);
}
