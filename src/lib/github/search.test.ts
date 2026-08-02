import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitHubRequestError } from "./errors";
import {
  SEARCH_MAX_RESULTS,
  SEARCH_PER_PAGE,
  searchRepositories,
} from "./search";
import type { GitHubRepoSummaryPayload } from "@/types/github";

/**
 * Tests for the search capability unit.
 *
 * Mocked at the `fetch` boundary per docs/TESTING.md — the real `githubFetch`
 * runs, so the status mapping, the cache options and the log line are all
 * exercised on the way through. Stubbing `./client` would remove the only part
 * of this path that can go wrong.
 *
 * Two assertions here are the ones that must never be dropped:
 *   1. The guard tests assert `fetch` was **never called** — API-04 is about the
 *      request not being made, not about the code that comes back.
 *   2. The zero-results test asserts `ok: true` — a rate limit rendering as "no
 *      results" is the most misleading failure this app can produce, and this is
 *      the layer where the two would become indistinguishable.
 */

/** Silences stdout for the duration of a test and captures what was written. */
function captureConsoleLog() {
  return vi.spyOn(console, "log").mockImplementation(() => {});
}

let logSpy: ReturnType<typeof captureConsoleLog>;

beforeEach(() => {
  logSpy = captureConsoleLog();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  logSpy.mockClear();
});

const RATE_LIMIT_HEADERS = {
  "x-ratelimit-limit": "60",
  "x-ratelimit-remaining": "58",
  "x-ratelimit-reset": "1700000900",
};

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

/** The outgoing URL as a parsed `URL` — never as a substring to match against. */
function requestedUrl(fetchMock: FetchMock, call = 0): URL {
  const input = fetchMock.mock.calls[call]?.[0];
  if (input === undefined) {
    throw new Error(`fetch was not called ${call + 1} time(s)`);
  }
  return new URL(String(input));
}

function initOf(fetchMock: FetchMock, call = 0): RequestInit {
  const init = fetchMock.mock.calls[call]?.[1];
  if (init === undefined) {
    throw new Error(`fetch call ${call} carried no init object`);
  }
  return init;
}

/** A repository exactly as the search endpoint sends it. */
function repoPayload(
  overrides: Partial<GitHubRepoSummaryPayload> = {}
): GitHubRepoSummaryPayload {
  return {
    id: 10270250,
    name: "react",
    full_name: "facebook/react",
    html_url: "https://github.com/facebook/react",
    description: "The library for web and native user interfaces.",
    language: "JavaScript",
    stargazers_count: 232000,
    forks_count: 47600,
    open_issues_count: 981,
    owner: {
      login: "facebook",
      avatar_url: "https://avatars.githubusercontent.com/u/69631?v=4",
    },
    ...overrides,
  };
}

function searchPayload(
  totalCount: number,
  items: GitHubRepoSummaryPayload[] = []
) {
  return { total_count: totalCount, incomplete_results: false, items };
}

/** Narrows to the success branch, failing the test with the code if it is not. */
function expectOk<T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

describe("searchRepositories — mapping a successful response", () => {
  it("maps the payload to typed summaries with stars, forks, open issues and the owner avatar", async () => {
    stubFetch(jsonResponse(searchPayload(1, [repoPayload()])));

    const data = expectOk(await searchRepositories("react"));

    expect(data.items).toEqual([
      {
        id: 10270250,
        name: "react",
        fullName: "facebook/react",
        owner: {
          login: "facebook",
          avatarUrl: "https://avatars.githubusercontent.com/u/69631?v=4",
        },
        description: "The library for web and native user interfaces.",
        language: "JavaScript",
        stars: 232000,
        forks: 47600,
        openIssues: 981,
        htmlUrl: "https://github.com/facebook/react",
      },
    ]);
    expect(data.totalCount).toBe(1);
    expect(data.page).toBe(1);
    expect(data.perPage).toBe(SEARCH_PER_PAGE);
  });

  it("carries GitHub's raw total count so pagination needs no second call", async () => {
    stubFetch(jsonResponse(searchPayload(48283, [repoPayload()])));

    expect(expectOk(await searchRepositories("react")).totalCount).toBe(48283);
  });
});

describe("searchRepositories — the empty-query guard (API-04, T-01-15)", () => {
  it.each([
    ["an empty string", ""],
    ["spaces only", "   "],
    ["a newline and a tab", "\n\t"],
  ])("refuses %s without making a request", async (_label, query) => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    const result = await searchRepositories(query);

    expect(result).toEqual({ ok: false, error: { code: "INVALID_QUERY" } });
    // The point of the guard: GitHub never sees the request, so its 422 never
    // happens and the blank-query storm costs zero quota.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("searchRepositories — URL construction (SEC-03, T-01-12)", () => {
  it("requests per_page=20 and the requested page", async () => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    await searchRepositories("react", 3);

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe("/search/repositories");
    expect(url.searchParams.get("per_page")).toBe(String(SEARCH_PER_PAGE));
    expect(url.searchParams.get("per_page")).toBe("20");
    expect(url.searchParams.get("page")).toBe("3");
  });

  it("sends a keyword containing separators and non-ASCII characters as exactly one q value", async () => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));
    const keyword = "  react hooks & state=1 #tag 日本語  ";

    await searchRepositories(keyword);

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.getAll("q")).toHaveLength(1);
    expect(url.searchParams.get("q")).toBe(keyword.trim());
  });

  it("cannot have per_page overridden by a keyword that looks like a query string", async () => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    await searchRepositories("next&per_page=100");

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.getAll("q")).toEqual(["next&per_page=100"]);
    expect(url.searchParams.getAll("per_page")).toEqual(["20"]);
  });

  it("addresses api.github.com and the search endpoint, whatever the keyword", async () => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    await searchRepositories("../../repos/facebook/react");

    const url = requestedUrl(fetchMock);
    expect(url.origin).toBe("https://api.github.com");
    expect(url.pathname).toBe("/search/repositories");
  });
});

describe("searchRepositories — sort", () => {
  it("omits sort and order entirely on the default ordering", async () => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    await searchRepositories("react");

    // GitHub has no `sort=best-match` value — relevance is the absence of the
    // parameter. Sending a literal would be a 422 waiting to happen.
    const url = requestedUrl(fetchMock);
    expect(url.searchParams.has("sort")).toBe(false);
    expect(url.searchParams.has("order")).toBe(false);
  });

  it("sends sort=stars with order=desc when sorting by stars", async () => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    await searchRepositories("react", 1, "stars");

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.get("sort")).toBe("stars");
    // `order` is meaningless without `sort`, and ascending stars would show
    // the least-starred repositories first — the opposite of the request.
    expect(url.searchParams.get("order")).toBe("desc");
  });

  it("keeps the keyword a single q value when sorting", async () => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    await searchRepositories("next&sort=forks", 1, "stars");

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.getAll("q")).toEqual(["next&sort=forks"]);
    expect(url.searchParams.getAll("sort")).toEqual(["stars"]);
  });

  it("still refuses a blank keyword when a sort is requested", async () => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    const result = await searchRepositories("   ", 1, "stars");

    expect(result).toEqual({ ok: false, error: { code: "INVALID_QUERY" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("searchRepositories — totalPages", () => {
  it("counts the pages implied by the match count when everything is reachable", async () => {
    stubFetch(jsonResponse(searchPayload(42)));

    const result = await searchRepositories("react");

    // 42 matches at 20 per page — three pages, the last one partial.
    expect(result.ok && result.data.totalPages).toBe(3);
    expect(result.ok && result.data.reachableCount).toBe(42);
  });

  it("caps at the ceiling rather than the arithmetic answer for a broad keyword", async () => {
    stubFetch(jsonResponse(searchPayload(48_283)));

    const result = await searchRepositories("react");

    // 48,283 / 20 is 2,415 pages, but GitHub refuses result 1001, so only 50
    // are reachable. Reporting 2,415 would put page numbers in the UI that
    // return an error when navigated to.
    expect(result.ok && result.data.totalPages).toBe(
      SEARCH_MAX_RESULTS / SEARCH_PER_PAGE
    );
    expect(result.ok && result.data.totalPages).toBe(50);
    // The raw count is still reported unchanged (D-14).
    expect(result.ok && result.data.totalCount).toBe(48_283);
    expect(result.ok && result.data.reachableCount).toBe(SEARCH_MAX_RESULTS);
  });

  it("never reports zero pages", async () => {
    stubFetch(jsonResponse(searchPayload(0, [])));

    const result = await searchRepositories("qwertyuiopasdfgh");

    // "1 / 0 ページ" is not a thing. Zero matches renders the empty state,
    // but the value must be coherent regardless of what the caller does.
    expect(result.ok && result.data.totalPages).toBe(1);
  });

  it("reports a single page when the matches fit exactly on one", async () => {
    stubFetch(jsonResponse(searchPayload(20)));

    const result = await searchRepositories("react");

    // The off-by-one that a naive `ceil(n/20) + 1` would produce.
    expect(result.ok && result.data.totalPages).toBe(1);
  });
});

describe("searchRepositories — empty results are a success, not a failure", () => {
  it("returns ok with zero items when nothing matched", async () => {
    stubFetch(jsonResponse(searchPayload(0, [])));

    const result = await searchRepositories("qwertyuiopasdfgh");

    expect(result.ok).toBe(true);
    const data = expectOk(result);
    expect(data.items).toEqual([]);
    expect(data.totalCount).toBe(0);
    expect(data.hasNextPage).toBe(false);
  });

  it("is structurally distinguishable from a rate limit, so no caller can conflate them", async () => {
    stubFetch(
      jsonResponse(searchPayload(0, [])),
      respond("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } })
    );

    const empty = await searchRepositories("react");
    const limited = await searchRepositories("react");

    expect(empty.ok).toBe(true);
    expect(limited.ok).toBe(false);
    expect(limited).toEqual({
      ok: false,
      error: { code: "RATE_LIMIT", resetAt: 1700000900 },
    });
  });
});

describe("searchRepositories — failures it returns", () => {
  it("returns RATE_LIMIT with a reset time when GitHub returns 403 with exhausted quota", async () => {
    stubFetch(
      respond("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } })
    );

    expect(await searchRepositories("react")).toEqual({
      ok: false,
      error: { code: "RATE_LIMIT", resetAt: 1700000900 },
    });
  });

  it("returns INVALID_QUERY unchanged when GitHub itself returns 422", async () => {
    stubFetch(respond("{}", { status: 422 }));

    expect(await searchRepositories("react")).toEqual({
      ok: false,
      error: { code: "INVALID_QUERY" },
    });
  });
});

describe("searchRepositories — failures it throws (D-03, D-05a)", () => {
  // Not caught here on purpose: `error.tsx` is the destination for a fault the
  // UI has no branch for, and catching it would convert it into a state the UI
  // would have to invent a meaning for.
  it("lets a 500 propagate as a thrown GitHubRequestError rather than returning a failure", async () => {
    stubFetch(respond("{}", { status: 500 }));

    await expect(searchRepositories("react")).rejects.toBeInstanceOf(
      GitHubRequestError
    );
  });

  it("lets a transport fault propagate after the client's single retry", async () => {
    const fetchMock = stubFetch(
      new TypeError("fetch failed"),
      new TypeError("fetch failed")
    );

    await expect(searchRepositories("react")).rejects.toBeInstanceOf(
      GitHubRequestError
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("searchRepositories — page normalisation and the 1000-result ceiling", () => {
  it.each([
    ["zero", 0],
    ["negative", -3],
    ["fractional", 1.5],
    ["NaN", Number.NaN],
  ])("normalises a %s page to 1", async (_label, page) => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    const data = expectOk(await searchRepositories("react", page));

    expect(requestedUrl(fetchMock).searchParams.get("page")).toBe("1");
    expect(data.page).toBe(1);
  });

  // Page 51 begins at result 1001, past GitHub's hard ceiling, so the request
  // could only ever come back 422. Refusing locally spends no quota (T-01-14).
  it.each([
    ["the first page past the ceiling", 51],
    ["a far page past the ceiling", 99999],
  ])("refuses %s without making a request", async (_label, page) => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    const result = await searchRepositories("react", page);

    expect(result).toEqual({ ok: false, error: { code: "INVALID_QUERY" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still serves the last page inside the ceiling", async () => {
    const fetchMock = stubFetch(
      jsonResponse(searchPayload(SEARCH_MAX_RESULTS, [repoPayload()]))
    );

    const data = expectOk(await searchRepositories("react", 50));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data.page).toBe(50);
  });
});

describe("searchRepositories — hasNextPage", () => {
  it("is true while results remain", async () => {
    stubFetch(jsonResponse(searchPayload(48283, [repoPayload()])));

    expect(expectOk(await searchRepositories("react", 1)).hasNextPage).toBe(
      true
    );
  });

  it("is false on the last page of a small result set", async () => {
    stubFetch(jsonResponse(searchPayload(45, [repoPayload()])));

    expect(expectOk(await searchRepositories("react", 3)).hasNextPage).toBe(
      false
    );
  });

  it("is true on the page before the last page of a small result set", async () => {
    stubFetch(jsonResponse(searchPayload(45, [repoPayload()])));

    expect(expectOk(await searchRepositories("react", 2)).hasNextPage).toBe(
      true
    );
  });

  // The case that matters: GitHub reports 48283 matches but will only serve
  // 1000 of them. Page 50 is the last reachable one, and a UI that trusted
  // total_count alone would render a link to a page that can only 422.
  it("is false on the 50th page even when total_count is far above the ceiling", async () => {
    stubFetch(jsonResponse(searchPayload(48283, [repoPayload()])));

    const data = expectOk(await searchRepositories("react", 50));

    expect(data.hasNextPage).toBe(false);
    expect(data.totalCount).toBe(48283);
  });
});

describe("searchRepositories — caching", () => {
  it("asks for the 60-second search window (D-09)", async () => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    await searchRepositories("react");

    expect(initOf(fetchMock).next?.revalidate).toBe(60);
  });

  // The opt-in itself belongs to `githubFetch`; asserted here only to prove the
  // unit does not undo it on the way past.
  it("does not disturb the client's cache opt-in", async () => {
    const fetchMock = stubFetch(jsonResponse(searchPayload(0)));

    await searchRepositories("react");

    expect(initOf(fetchMock).cache).toBe("force-cache");
  });
});
