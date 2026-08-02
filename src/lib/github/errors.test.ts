import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError, toFailure, toRequestError } from "./errors";

/** Fixed clock so every `resetAt` assertion is an exact number, never a range. */
const NOW_MS = 1_700_000_000_000;
const NOW_SECONDS = 1_700_000_000;

function response(status: number, headers: Record<string, string> = {}): Response {
  // The real Response and Headers, not a hand-rolled fake: header lookup is
  // case-insensitive at runtime and the test must exercise that, not bypass it.
  return new Response("{}", { status, headers });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("toFailure", () => {
  it("maps 403 with an exhausted rate limit to RATE_LIMIT carrying the reset time", () => {
    const failure = toFailure(
      response(403, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1700000900",
      })
    );

    expect(failure).toEqual({ code: "RATE_LIMIT", resetAt: 1_700_000_900 });
  });

  it("maps 429 to RATE_LIMIT carrying the reset time", () => {
    const failure = toFailure(
      response(429, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1700000900",
      })
    );

    expect(failure).toEqual({ code: "RATE_LIMIT", resetAt: 1_700_000_900 });
  });

  it("prefers retry-after over x-ratelimit-reset when both are present", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    const failure = toFailure(
      response(429, {
        "retry-after": "30",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1700009999",
      })
    );

    expect(failure).toEqual({ code: "RATE_LIMIT", resetAt: NOW_SECONDS + 30 });
  });

  it("falls back to a minute from now when no rate-limit header is usable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    const failure = toFailure(
      response(429, { "x-ratelimit-reset": "not-a-number" })
    );

    expect(failure).toEqual({ code: "RATE_LIMIT", resetAt: NOW_SECONDS + 60 });
  });

  it("treats a 403 that is not rate-limit exhaustion as unexpected", () => {
    expect(toFailure(response(403))).toBeNull();
    expect(toFailure(response(403, { "x-ratelimit-remaining": "5" }))).toBeNull();
  });

  it("maps 404 to NOT_FOUND", () => {
    expect(toFailure(response(404))).toEqual({ code: "NOT_FOUND" });
  });

  it("maps 422 to INVALID_QUERY", () => {
    expect(toFailure(response(422))).toEqual({ code: "INVALID_QUERY" });
  });

  it("treats server errors and unrecognised statuses as unexpected", () => {
    expect(toFailure(response(500))).toBeNull();
    expect(toFailure(response(502))).toBeNull();
    expect(toFailure(response(418))).toBeNull();
  });
});

describe("toRequestError", () => {
  it("normalises a transport fault into a NETWORK error that keeps the original cause", () => {
    const cause = new TypeError("fetch failed");

    const error = toRequestError(cause);

    expect(error).toBeInstanceOf(GitHubRequestError);
    expect(error.code).toBe("NETWORK");
    expect(error.status).toBeUndefined();
    expect(error.cause).toBe(cause);
  });

  it("names the timeout when the request was aborted by its own deadline", () => {
    const cause = new DOMException("The operation was aborted.", "TimeoutError");

    const error = toRequestError(cause);

    expect(error.code).toBe("NETWORK");
    expect(error.message).toMatch(/timed out/i);
  });

  it("carries the HTTP status when an unrecognised status caused the error", () => {
    const error = toRequestError(new Error("unexpected status"), 500);

    expect(error.status).toBe(500);
    expect(error.name).toBe("GitHubRequestError");
  });

  it("never exposes a token value in the error it produces", () => {
    const token = "ghp_test_token_value";
    vi.stubEnv("GITHUB_TOKEN", token);

    const error = toRequestError(new Error("boom"), 500);
    const exposed = JSON.stringify({
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status,
      stringified: String(error),
      own: Object.getOwnPropertyNames(error).map((key) => key),
    });

    expect(exposed).not.toContain(token);
    expect(exposed.toLowerCase()).not.toContain("authorization");
  });
});
