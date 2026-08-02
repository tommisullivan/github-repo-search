import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubCallLog } from "./log";
import { logGitHubCall, logUnauthenticatedOnce } from "./log";

/** Silences stdout for the duration of a test and captures what was written. */
function captureConsoleLog() {
  return vi.spyOn(console, "log").mockImplementation(() => {});
}

let logSpy: ReturnType<typeof captureConsoleLog>;

function entry(overrides: Partial<GitHubCallLog> = {}): GitHubCallLog {
  return {
    event: "github_request",
    requestId: "req_01",
    endpoint: "search/repositories",
    status: 200,
    durationMs: 142,
    rateLimitRemaining: 9,
    rateLimitReset: 1_700_000_900,
    cacheHit: false,
    errorType: null,
    ...overrides,
  };
}

/** The single argument of the Nth console.log call, parsed. */
function loggedObject(call = 0): Record<string, unknown> {
  const args = logSpy.mock.calls[call];
  expect(args).toHaveLength(1);
  return JSON.parse(String(args?.[0])) as Record<string, unknown>;
}

beforeEach(() => {
  logSpy = captureConsoleLog();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("logGitHubCall", () => {
  it("writes one line that parses as JSON", () => {
    logGitHubCall(entry());

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(() => loggedObject()).not.toThrow();
  });

  it("carries every operational field the log line promises", () => {
    logGitHubCall(entry());

    expect(loggedObject()).toEqual({
      event: "github_request",
      requestId: "req_01",
      endpoint: "search/repositories",
      status: 200,
      durationMs: 142,
      rateLimitRemaining: 9,
      rateLimitReset: 1_700_000_900,
      cacheHit: false,
      errorType: null,
      level: "info",
    });
  });

  it("records a completed request as info", () => {
    logGitHubCall(entry({ status: 304 }));

    expect(loggedObject().level).toBe("info");
  });

  it("records a rate-limited or client-error response as warn", () => {
    logGitHubCall(entry({ status: 403, rateLimitRemaining: 0 }));
    logGitHubCall(entry({ status: 429, rateLimitRemaining: 0 }));
    logGitHubCall(entry({ status: 404 }));

    expect(loggedObject(0).level).toBe("warn");
    expect(loggedObject(1).level).toBe("warn");
    expect(loggedObject(2).level).toBe("warn");
  });

  it("records a failed, unfinished, or server-error request as error", () => {
    logGitHubCall(entry({ status: 200, errorType: "GitHubRequestError" }));
    logGitHubCall(entry({ status: null, cacheHit: null, errorType: null }));
    logGitHubCall(entry({ status: 502 }));

    expect(loggedObject(0).level).toBe("error");
    expect(loggedObject(1).level).toBe("error");
    expect(loggedObject(2).level).toBe("error");
  });

  it("never writes the token or an authorization header to stdout", async () => {
    const token = "ghp_test_token_value";
    vi.stubEnv("GITHUB_TOKEN", token);

    logGitHubCall(entry({ status: 403, errorType: "GitHubRequestError" }));
    vi.resetModules();
    const fresh = await import("./log");
    fresh.logUnauthenticatedOnce();

    const everythingWritten = logSpy.mock.calls.flat().map(String).join("\n");

    expect(everythingWritten).not.toContain(token);
    expect(everythingWritten.toLowerCase()).not.toContain("authorization");
  });
});

describe("logUnauthenticatedOnce", () => {
  it("writes the missing-token notice once however many times it is called", () => {
    logUnauthenticatedOnce();
    logUnauthenticatedOnce();
    logUnauthenticatedOnce();

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(loggedObject()).toEqual({
      event: "github_unauthenticated",
      level: "info",
      message: expect.stringContaining("GITHUB_TOKEN"),
    });
  });

  it("writes the notice again in a fresh module instance, so suppression cannot outlive a restart", async () => {
    vi.resetModules();
    const first = await import("./log");
    first.logUnauthenticatedOnce();
    first.logUnauthenticatedOnce();

    expect(logSpy).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const second = await import("./log");
    second.logUnauthenticatedOnce();

    expect(logSpy).toHaveBeenCalledTimes(2);
  });
});
