/**
 * The failure vocabulary for the GitHub boundary.
 *
 * Server-side only. This is the shared error core: it owns the mapping from an
 * HTTP status to a typed outcome and nothing else. It must never import
 * `client.ts`, `search.ts`, or `repo.ts` — those depend on it, not the reverse.
 *
 * There is deliberately **no user-facing prose here**. The module speaks codes;
 * Phase 2 maps a code to Japanese copy beside the component that renders it
 * (D-05, D-06). Every `message` in this file is English operator-facing text
 * that reaches the logs and is never shown to a user.
 *
 * Returned versus thrown, which is the distinction the whole phase rests on:
 *   - `RATE_LIMIT`, `NOT_FOUND`, `INVALID_QUERY` are **returned** in a `Result`.
 *     They are normal states of a working app and each needs its own UI, which
 *     `error.tsx` cannot reliably provide — Next sanitises server errors in
 *     production, so branching on error type inside the boundary component is
 *     unreliable (D-04).
 *   - `NETWORK` is **thrown**, carried by `GitHubRequestError`. It covers
 *     transport faults and unrecognised statuses, where a generic retry message
 *     is the complete answer and no branching is required (D-03, D-05a).
 */

/** Every failure this app can name. The one error vocabulary in the phase. */
export type GitHubErrorCode =
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "INVALID_QUERY"
  | "NETWORK";

/**
 * A failure a caller returns rather than throws.
 *
 * `NOT_FOUND` and `INVALID_QUERY` deliberately carry no payload: an empty
 * member keeps an exhaustive `switch` in Phase 2 honest, and there is nothing
 * useful to add that the code does not already say.
 */
export type GitHubFailure =
  | { code: "RATE_LIMIT"; resetAt: number }
  | { code: "NOT_FOUND" }
  | { code: "INVALID_QUERY" };

/** The outcome of any boundary call that can fail in an expected way. */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: GitHubFailure };

/**
 * The one thrown type. Reaches the App Router error boundary.
 *
 * The message is built from a fixed English string and, at most, an HTTP
 * status. No response body, no header, and no environment value is ever
 * interpolated into it — an error message is logged, and OBS-03 forbids
 * logging bodies and secrets.
 */
export class GitHubRequestError extends Error {
  readonly code = "NETWORK" as const;
  readonly status?: number;

  constructor(message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "GitHubRequestError";
    this.status = options.status;
  }
}

/** Seconds to wait when GitHub gives no usable reset hint. */
const RATE_LIMIT_FALLBACK_SECONDS = 60;

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
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

/**
 * Unix seconds at which the caller may try again.
 *
 * `retry-after` wins when present — OPERATIONS.md records it as authoritative.
 * There is always a number, because the UI has to say *when* to retry (D-08)
 * and "unknown" is not a message anyone can act on.
 */
function resolveResetAt(response: Response): number {
  const retryAfter = headerInt(response, "retry-after");
  if (retryAfter !== null) {
    return nowInSeconds() + retryAfter;
  }

  const reset = headerInt(response, "x-ratelimit-reset");
  if (reset !== null) {
    return reset;
  }

  return nowInSeconds() + RATE_LIMIT_FALLBACK_SECONDS;
}

/**
 * A 403 means "forbidden" in general and "quota exhausted" only when the
 * headers say so. Treating every 403 as a rate limit would tell a user to wait
 * for a window that is not the problem.
 */
function isRateLimited(response: Response): boolean {
  if (response.status === 429) {
    return true;
  }

  if (response.status !== 403) {
    return false;
  }

  return (
    headerInt(response, "retry-after") !== null ||
    headerInt(response, "x-ratelimit-remaining") === 0
  );
}

/**
 * Maps a response to the failure a caller should return.
 *
 * `null` means "not an expected failure" and is the signal for the caller to
 * throw a `GitHubRequestError` instead.
 */
export function toFailure(response: Response): GitHubFailure | null {
  if (isRateLimited(response)) {
    return { code: "RATE_LIMIT", resetAt: resolveResetAt(response) };
  }

  if (response.status === 404) {
    return { code: "NOT_FOUND" };
  }

  if (response.status === 422) {
    return { code: "INVALID_QUERY" };
  }

  return null;
}

/**
 * Normalises anything thrown by `fetch` or by JSON parsing into the one thrown
 * type, preserving the original as `cause` so a stack survives to the logs.
 *
 * The timeout case gets its own message because that is the failure an operator
 * has to be able to recognise in stdout — a five-second deadline that fires
 * looks identical to a dropped connection otherwise.
 */
export function toRequestError(cause: unknown, status?: number): GitHubRequestError {
  if (cause instanceof DOMException && cause.name === "TimeoutError") {
    return new GitHubRequestError("GitHub request timed out", { status, cause });
  }

  const detail = status === undefined ? "" : ` with status ${status}`;
  return new GitHubRequestError(`GitHub request failed${detail}`, { status, cause });
}
