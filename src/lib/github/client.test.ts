import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the one outbound path to GitHub.
 *
 * Mocked at the `fetch` boundary per docs/TESTING.md — never `vi.mock` of the
 * module under test, because the translation work (status → typed outcome,
 * headers → log fields) is the whole subject.
 *
 * The modules are imported *dynamically* after `vi.resetModules()` so each test
 * gets a fresh `log.ts` instance: `logUnauthenticatedOnce` is once-per-module,
 * and a shared instance would make "the notice fires" depend on test order.
 * `errors.ts` is loaded from the same fresh graph so `toBeInstanceOf` compares
 * against the class `client.ts` actually threw.
 */

const TOKEN = "ghp_client_test_token_value";
const SEARCH_PATH = "/search/repositories?q=next&per_page=20";

const RATE_LIMIT_HEADERS = {
  "x-ratelimit-limit": "60",
  "x-ratelimit-remaining": "58",
  "x-ratelimit-reset": "1700000900",
};

/** Silences stdout for the duration of a test and captures what was written. */
function captureConsoleLog() {
  return vi.spyOn(console, "log").mockImplementation(() => {});
}

let logSpy: ReturnType<typeof captureConsoleLog>;
let githubFetch: typeof import("./client").githubFetch;
let GitHubRequestError: typeof import("./errors").GitHubRequestError;

beforeEach(async () => {
  vi.resetModules();
  logSpy = captureConsoleLog();
  vi.stubEnv("GITHUB_TOKEN", TOKEN);

  const [client, errors] = await Promise.all([
    import("./client"),
    import("./errors"),
  ]);
  githubFetch = client.githubFetch;
  GitHubRequestError = errors.GitHubRequestError;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A real `Response`, built the way GitHub would send it. */
function respond(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...RATE_LIMIT_HEADERS,
      ...init.headers,
    },
  });
}

function jsonResponse(
  value: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return respond(JSON.stringify(value), init);
}

/** Queues one outcome per attempt, in order. */
function stubFetch(...outcomes: readonly (Response | unknown)[]) {
  const fetchMock = vi.fn<typeof fetch>();

  for (const outcome of outcomes) {
    if (outcome instanceof Response) {
      fetchMock.mockResolvedValueOnce(outcome);
    } else {
      fetchMock.mockRejectedValueOnce(outcome);
    }
  }

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type FetchMock = ReturnType<typeof stubFetch>;

function urlOf(fetchMock: FetchMock, call = 0): string {
  const input = fetchMock.mock.calls[call]?.[0];
  if (input === undefined) {
    throw new Error(`fetch was not called ${call + 1} time(s)`);
  }
  return String(input);
}

function initOf(fetchMock: FetchMock, call = 0): RequestInit {
  const init = fetchMock.mock.calls[call]?.[1];
  if (init === undefined) {
    throw new Error(`fetch call ${call} carried no init object`);
  }
  return init;
}

function headerOf(fetchMock: FetchMock, name: string, call = 0): string | null {
  return new Headers(initOf(fetchMock, call).headers).get(name);
}

function loggedObjects(): Record<string, unknown>[] {
  return logSpy.mock.calls.map(
    (args) => JSON.parse(String(args[0])) as Record<string, unknown>
  );
}

function requestLogs(): Record<string, unknown>[] {
  return loggedObjects().filter((entry) => entry.event === "github_request");
}

function unauthenticatedLogs(): Record<string, unknown>[] {
  return loggedObjects().filter(
    (entry) => entry.event === "github_unauthenticated"
  );
}

const SEARCH_CALL = {
  path: SEARCH_PATH,
  endpoint: "search/repositories",
  revalidate: 60,
} as const;

describe("githubFetch — the outgoing request", () => {
  // THE test this plan exists for (API-05, D-11a, T-01-27). `next.revalidate`
  // alone happens to cache in Next 16.2.12, but dropping the explicit opt-in
  // produces no error, no warning and no type failure — only an app that
  // spends its whole rate limit on repeat renders. This assertion is the one
  // thing standing between the repository and that silent regression.
  it("sends cache: force-cache with the caller's revalidate window", async () => {
    const fetchMock = stubFetch(jsonResponse({ total_count: 0, items: [] }));

    await githubFetch({ ...SEARCH_CALL, revalidate: 60 });

    const init = initOf(fetchMock);
    expect(init.cache).toBe("force-cache");
    expect(init.next?.revalidate).toBe(60);
  });

  it("passes the caller's revalidate through unchanged for the detail window", async () => {
    const fetchMock = stubFetch(jsonResponse({ id: 1 }));

    await githubFetch({
      path: "/repos/vercel/next.js",
      endpoint: "repos/{owner}/{repo}",
      revalidate: 300,
    });

    expect(initOf(fetchMock).next?.revalidate).toBe(300);
  });

  // The Next docs state that conflicting options such as
  // `{ revalidate, cache: 'no-store' }` are BOTH ignored — the result is
  // neither caching nor no-store, which is worse than either.
  it("never pairs no-store with a revalidate window", async () => {
    const fetchMock = stubFetch(jsonResponse({ total_count: 0, items: [] }));

    await githubFetch(SEARCH_CALL);

    expect(initOf(fetchMock).cache).not.toBe("no-store");
  });

  it("addresses api.github.com and nothing else", async () => {
    const fetchMock = stubFetch(jsonResponse({ total_count: 0, items: [] }));

    await githubFetch(SEARCH_CALL);

    expect(urlOf(fetchMock)).toBe(`https://api.github.com${SEARCH_PATH}`);
    expect(urlOf(fetchMock).startsWith("https://api.github.com/")).toBe(true);
  });

  it("sends the GitHub media type and API version on every request", async () => {
    const fetchMock = stubFetch(jsonResponse({ total_count: 0, items: [] }));

    await githubFetch(SEARCH_CALL);

    expect(headerOf(fetchMock, "accept")).toBe("application/vnd.github+json");
    expect(headerOf(fetchMock, "x-github-api-version")).toBe("2022-11-28");
  });

  it("carries an abort signal so a stalled response cannot hold the render open", async () => {
    const fetchMock = stubFetch(jsonResponse({ total_count: 0, items: [] }));

    await githubFetch(SEARCH_CALL);

    expect(initOf(fetchMock).signal).toBeInstanceOf(AbortSignal);
  });
});

describe("githubFetch — the token", () => {
  it("sends a bearer token when GITHUB_TOKEN is set, and no unauthenticated notice", async () => {
    const fetchMock = stubFetch(jsonResponse({ total_count: 0, items: [] }));

    await githubFetch(SEARCH_CALL);

    expect(headerOf(fetchMock, "authorization")).toBe(`Bearer ${TOKEN}`);
    expect(unauthenticatedLogs()).toHaveLength(0);
  });

  it("sends no authorization header and notes the reduced limit when GITHUB_TOKEN is unset", async () => {
    vi.stubEnv("GITHUB_TOKEN", undefined);
    const fetchMock = stubFetch(jsonResponse({ total_count: 0, items: [] }));

    await githubFetch(SEARCH_CALL);

    expect(headerOf(fetchMock, "authorization")).toBeNull();
    expect(unauthenticatedLogs()).toHaveLength(1);
  });

  it("treats a whitespace-only GITHUB_TOKEN as absent rather than sending an empty bearer", async () => {
    vi.stubEnv("GITHUB_TOKEN", "   ");
    const fetchMock = stubFetch(jsonResponse({ total_count: 0, items: [] }));

    await githubFetch(SEARCH_CALL);

    expect(headerOf(fetchMock, "authorization")).toBeNull();
    expect(unauthenticatedLogs()).toHaveLength(1);
  });

  it("writes the token to nothing on stdout, on success or on failure", async () => {
    stubFetch(
      jsonResponse({ total_count: 0, items: [] }),
      respond("{}", { status: 500 }),
      new TypeError("fetch failed"),
      new TypeError("fetch failed")
    );

    await githubFetch(SEARCH_CALL);
    await expect(githubFetch(SEARCH_CALL)).rejects.toThrow();
    await expect(githubFetch(SEARCH_CALL)).rejects.toThrow();

    const everythingWritten = logSpy.mock.calls.flat().map(String).join("\n");

    expect(everythingWritten).not.toContain(TOKEN);
    expect(everythingWritten.toLowerCase()).not.toContain("authorization");
  });
});

describe("githubFetch — path guard (SEC-03, T-01-05)", () => {
  it.each([
    ["protocol-relative", "//evil.example.com/x"],
    ["absolute", "https://evil.example.com/x"],
    ["backslash protocol-relative", "/\\evil.example.com/x"],
    ["relative", "search/repositories?q=next"],
    ["empty", ""],
    ["bare slash", "/"],
  ])("rejects a %s path before any request is made", async (_label, path) => {
    const fetchMock = stubFetch(jsonResponse({ total_count: 0, items: [] }));

    await expect(githubFetch({ ...SEARCH_CALL, path })).rejects.toBeInstanceOf(
      GitHubRequestError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not echo the rejected path back into the error message", async () => {
    stubFetch();

    // Asserted with a substring check rather than a regex. The intent is
    // "the host must not appear anywhere in the message", which an unanchored
    // regex expresses correctly — but CodeQL's missing-regexp-anchor rule reads
    // any unanchored regex tested against a URL as a bypassable security
    // control, and it is right to do so in the general case. Using
    // `toContain` states the same assertion with no regex to misread.
    const error = await githubFetch({
      ...SEARCH_CALL,
      path: "https://evil.example.com/x",
    }).then(
      () => {
        throw new Error("expected githubFetch to reject the absolute path");
      },
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("evil.example.com");
  });
});

describe("githubFetch — response mapping", () => {
  it("returns the parsed body on 200, with exactly one request", async () => {
    const payload = { total_count: 1, items: [{ id: 42 }] };
    const fetchMock = stubFetch(jsonResponse(payload));

    const result = await githubFetch<typeof payload>(SEARCH_CALL);

    expect(result).toEqual({ ok: true, data: payload });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns RATE_LIMIT with a reset time on 403 with exhausted quota, and never retries", async () => {
    const fetchMock = stubFetch(
      respond("{}", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      })
    );

    const result = await githubFetch(SEARCH_CALL);

    expect(result).toEqual({
      ok: false,
      error: { code: "RATE_LIMIT", resetAt: 1700000900 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns RATE_LIMIT on 429, and never retries", async () => {
    const fetchMock = stubFetch(respond("{}", { status: 429 }));

    const result = await githubFetch(SEARCH_CALL);

    expect(result).toEqual({
      ok: false,
      error: { code: "RATE_LIMIT", resetAt: 1700000900 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns NOT_FOUND on 404, and never retries", async () => {
    const fetchMock = stubFetch(respond("{}", { status: 404 }));

    const result = await githubFetch({
      path: "/repos/vercel/nope",
      endpoint: "repos/{owner}/{repo}",
      revalidate: 300,
    });

    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns INVALID_QUERY on 422, and never retries", async () => {
    const fetchMock = stubFetch(respond("{}", { status: 422 }));

    const result = await githubFetch(SEARCH_CALL);

    expect(result).toEqual({ ok: false, error: { code: "INVALID_QUERY" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws with the status on 500 — a response is not a transport fault, so it is not retried", async () => {
    const fetchMock = stubFetch(respond("{}", { status: 500 }));

    await expect(githubFetch(SEARCH_CALL)).rejects.toMatchObject({
      code: "NETWORK",
      status: 500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when a 200 body is not valid JSON", async () => {
    const fetchMock = stubFetch(respond("<!doctype html>not json"));

    await expect(githubFetch(SEARCH_CALL)).rejects.toBeInstanceOf(
      GitHubRequestError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("githubFetch — retry policy (OBS-02, T-01-09)", () => {
  it("retries a transport fault exactly once and returns the retry's result", async () => {
    const payload = { total_count: 3, items: [] };
    const fetchMock = stubFetch(
      new TypeError("fetch failed"),
      jsonResponse(payload)
    );

    const result = await githubFetch<typeof payload>(SEARCH_CALL);

    expect(result).toEqual({ ok: true, data: payload });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the single retry with a NETWORK error", async () => {
    const fetchMock = stubFetch(
      new TypeError("fetch failed"),
      new TypeError("fetch failed")
    );

    await expect(githubFetch(SEARCH_CALL)).rejects.toMatchObject({
      code: "NETWORK",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries a timeout — the caller has already waited the full deadline", async () => {
    const fetchMock = stubFetch(
      new DOMException("The operation timed out.", "TimeoutError")
    );

    await expect(githubFetch(SEARCH_CALL)).rejects.toThrow(/timed out/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("githubFetch — the log line (OBS-01, OBS-03)", () => {
  it("emits exactly one line per completed call carrying status and both rate-limit headers", async () => {
    stubFetch(jsonResponse({ total_count: 0, items: [] }));

    await githubFetch(SEARCH_CALL);

    expect(requestLogs()).toHaveLength(1);
    expect(requestLogs()[0]).toMatchObject({
      event: "github_request",
      endpoint: "search/repositories",
      status: 200,
      rateLimitRemaining: 58,
      rateLimitReset: 1700000900,
      errorType: null,
      level: "info",
    });
    expect(typeof requestLogs()[0]?.requestId).toBe("string");
  });

  it("reports a duration measured across the real call", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return jsonResponse({ total_count: 0, items: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await githubFetch(SEARCH_CALL);

    expect(requestLogs()[0]?.durationMs).toBeGreaterThan(0);
  });

  it("emits a line with a null status and a named errorType when the request never completes", async () => {
    stubFetch(new DOMException("The operation timed out.", "TimeoutError"));

    await expect(githubFetch(SEARCH_CALL)).rejects.toThrow();

    expect(requestLogs()).toHaveLength(1);
    expect(requestLogs()[0]).toMatchObject({
      status: null,
      errorType: "GitHubRequestError",
      rateLimitRemaining: null,
      rateLimitReset: null,
      level: "error",
    });
  });

  it("logs each attempt separately so a retry is visible in stdout", async () => {
    stubFetch(new TypeError("fetch failed"), jsonResponse({ total_count: 0 }));

    await githubFetch(SEARCH_CALL);

    expect(requestLogs()).toHaveLength(2);
    expect(requestLogs()[0]).toMatchObject({ status: null });
    expect(requestLogs()[1]).toMatchObject({ status: 200 });
    // Same correlation id: one logical call, two attempts.
    expect(requestLogs()[0]?.requestId).toBe(requestLogs()[1]?.requestId);
  });

  it("reports null headroom rather than a guess when the headers are absent or unreadable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ total_count: 0 }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            // Present but not a number, and no `x-ratelimit-reset` at all —
            // both are shapes a proxy or a cached response can produce.
            "x-ratelimit-remaining": "unknown",
          },
        })
      )
    );

    await githubFetch(SEARCH_CALL);

    expect(requestLogs()[0]).toMatchObject({
      rateLimitRemaining: null,
      rateLimitReset: null,
    });
  });

  // Plan 01-02 measured that a cached response is indistinguishable from a
  // miss to application code, and that its rate-limit headers are stale.
  // Reporting a guess here would end an investigation in the wrong place.
  it("never claims to know whether a response came from the cache", async () => {
    stubFetch(jsonResponse({ total_count: 0, items: [] }));

    await githubFetch(SEARCH_CALL);

    expect(requestLogs()[0]?.cacheHit).toBeNull();
  });
});
