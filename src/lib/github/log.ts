/**
 * Structured logging for the GitHub boundary.
 *
 * Server-side only, `console.log` + `JSON.stringify`, and **no dependency**
 * (D-17, D-18). Next already writes stdout, and a read-only app with one
 * upstream needs neither transports nor redaction machinery. D-18 records the
 * logging library that was considered and rejected; do not reach for it, or any
 * other, later in the phase — the point of the choice is that it stays small.
 *
 * Why this is a module and not an inline `console.log` at each call site:
 * `GitHubCallLog` is a **closed** object type. There is no field a caller could
 * put a header bag, a token, or a response body into, so leaking a secret to
 * stdout is a compile error rather than something a reviewer has to catch
 * (OBS-03). If you are here to "helpfully" add a `headers`, `body`, or `token`
 * field: that is the control, and adding one removes it.
 *
 * Known gap, recorded rather than papered over: OPERATIONS.md also lists
 * `requestId` as generated per *inbound* request and a `route` field. Phase 1
 * has no routes, so `requestId` is generated per GitHub call by the caller and
 * `route` is deliberately absent until Phase 2 has a route to name. Inventing a
 * value for either would make the log line look more correlated than it is.
 */

/**
 * The two endpoints this app calls, as literals so a typo fails the build
 * rather than fragmenting the logs into near-identical labels.
 */
export type GitHubEndpointLabel = "search/repositories" | "repos/{owner}/{repo}";

/**
 * One outbound GitHub call.
 *
 * The nullable fields are nullable for a reason: a request that never completed
 * has no `status`, and a response served from Next's fetch cache may expose no
 * rate-limit headers at all — plan 01-02 measures what `cacheHit` can honestly
 * report before anything reads it as a signal.
 */
export type GitHubCallLog = {
  event: "github_request";
  requestId: string;
  endpoint: GitHubEndpointLabel;
  status: number | null;
  durationMs: number;
  rateLimitRemaining: number | null;
  rateLimitReset: number | null;
  cacheHit: boolean | null;
  errorType: string | null;
};

type LogLevel = "info" | "warn" | "error";

/**
 * Level is derived, never supplied, so two call sites cannot disagree about
 * what a 403 means.
 */
function levelFor(entry: GitHubCallLog): LogLevel {
  if (entry.errorType !== null || entry.status === null || entry.status >= 500) {
    return "error";
  }

  if (entry.status >= 400) {
    return "warn";
  }

  return "info";
}

/**
 * Emits one JSON line per GitHub call.
 *
 * Always `console.log`, never the error stream: OPERATIONS.md specifies a single
 * structured stream to stdout, so the level is a field, not a stream. Splitting
 * across stdout and stderr would interleave unpredictably and break the ordering
 * that makes `rateLimitRemaining` readable as a trend.
 */
export function logGitHubCall(entry: GitHubCallLog): void {
  console.log(JSON.stringify({ ...entry, level: levelFor(entry) }));
}

/**
 * Module-scoped guard for the notice below. Module state, not global state, and
 * the distinction is observable — see the comment on `logUnauthenticatedOnce`.
 */
let unauthenticatedNoticeWritten = false;

/**
 * Notes once, server-side, that the app is running without a token (D-15).
 *
 * No user-facing notice is produced (D-16): an end user cannot act on it and it
 * leaks deployment detail into the interface. A reviewer who hits the limit
 * finds the explanation here.
 *
 * Only the *absence* of a token is logged. Whether a token is present is not
 * information anyone needs, and stating it edges toward describing the secret.
 */
export function logUnauthenticatedOnce(): void {
  if (unauthenticatedNoticeWritten) {
    return;
  }
  unauthenticatedNoticeWritten = true;

  console.log(
    JSON.stringify({
      event: "github_unauthenticated",
      level: "info",
      message:
        "No GITHUB_TOKEN is set. Running unauthenticated: GitHub search is limited to roughly 10 requests per minute.",
    })
  );
}
