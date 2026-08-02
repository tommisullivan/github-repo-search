import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitHubRequestError } from "./errors";
import { getRepository } from "./repo";
import type { GitHubRepoDetailPayload } from "@/types/github";

/**
 * Tests for the repository capability unit.
 *
 * Mocked at the `fetch` boundary per docs/TESTING.md, so the real `githubFetch`
 * — and therefore the real status mapping and the real cache options — runs on
 * the way through.
 *
 * The path assertions parse the outgoing URL with `URL` rather than matching a
 * substring. A substring check passes happily on a URL that is still wrong:
 * `/repos/../../search/repositories` contains `/repos/` too.
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

/** The path segments after `/repos/`, from the parsed URL. */
function segmentsAfterRepos(fetchMock: FetchMock): string[] {
  const { pathname } = requestedUrl(fetchMock);
  expect(pathname.startsWith("/repos/")).toBe(true);
  return pathname.slice("/repos/".length).split("/");
}

/**
 * A repository exactly as `GET /repos/{owner}/{repo}` sends it — including
 * `watchers_count`, which GitHub really does return as a duplicate of
 * `stargazers_count`. The fixture keeps the trap present so the mapping is
 * tested against the shape it will actually meet.
 */
function detailPayload(
  overrides: Partial<GitHubRepoDetailPayload> = {}
): GitHubRepoDetailPayload {
  return {
    id: 10270250,
    name: "react",
    full_name: "facebook/react",
    html_url: "https://github.com/facebook/react",
    description: "The library for web and native user interfaces.",
    language: "JavaScript",
    stargazers_count: 4321,
    forks_count: 47600,
    open_issues_count: 981,
    subscribers_count: 7,
    watchers_count: 4321,
    owner: {
      login: "facebook",
      avatar_url: "https://avatars.githubusercontent.com/u/69631?v=4",
    },
    ...overrides,
  };
}

/** Narrows to the success branch, failing the test with the code if it is not. */
function expectOk<T>(
  result: { ok: true; data: T } | { ok: false; error: unknown }
): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

describe("getRepository — mapping a successful response", () => {
  it("exposes every field the brief requires: name, avatar, language, stars, watchers, forks and open issues", async () => {
    stubFetch(jsonResponse(detailPayload()));

    const data = expectOk(await getRepository("facebook", "react"));

    expect(data.name).toBe("react");
    expect(data.owner.avatarUrl).toBe(
      "https://avatars.githubusercontent.com/u/69631?v=4"
    );
    expect(data.language).toBe("JavaScript");
    expect(data.stars).toBe(4321);
    expect(data.watchers).toBe(7);
    expect(data.forks).toBe(47600);
    expect(data.openIssues).toBe(981);
  });

  it("carries the remaining summary fields through unchanged", async () => {
    stubFetch(jsonResponse(detailPayload()));

    const data = expectOk(await getRepository("facebook", "react"));

    expect(data.id).toBe(10270250);
    expect(data.fullName).toBe("facebook/react");
    expect(data.owner.login).toBe("facebook");
    expect(data.description).toBe(
      "The library for web and native user interfaces."
    );
    expect(data.htmlUrl).toBe("https://github.com/facebook/react");
  });

  it("maps a null language and description rather than substituting a value", async () => {
    stubFetch(
      jsonResponse(detailPayload({ language: null, description: null }))
    );

    const data = expectOk(await getRepository("facebook", "react"));

    expect(data.language).toBeNull();
    expect(data.description).toBeNull();
  });
});

describe("getRepository — the watchers trap", () => {
  // GitHub's REST `watchers_count` is a duplicate of `stargazers_count`. The
  // fixture makes them identical on purpose: a mapping that reached for the
  // obvious field would render the star count twice under two labels and read
  // as a bug. `subscribers_count` is the real watcher count.
  it("maps watchers from subscribers_count, not from the watchers_count duplicate of stars", async () => {
    stubFetch(
      jsonResponse(
        detailPayload({
          subscribers_count: 7,
          watchers_count: 4321,
          stargazers_count: 4321,
        })
      )
    );

    const data = expectOk(await getRepository("facebook", "react"));

    expect(data.watchers).toBe(7);
    expect(data.stars).toBe(4321);
    expect(data.watchers).not.toBe(data.stars);
  });

  it("puts no watchers_count anywhere in the domain object", async () => {
    stubFetch(jsonResponse(detailPayload()));

    const data = expectOk(await getRepository("facebook", "react"));

    expect("watchersCount" in data).toBe(false);
    expect("watchers_count" in data).toBe(false);
    expect(Object.keys(data).sort()).toEqual([
      "description",
      "forks",
      "fullName",
      "htmlUrl",
      "id",
      "language",
      "name",
      "openIssues",
      "owner",
      "stars",
      "watchers",
    ]);
  });
});

describe("getRepository — path construction (SEC-03, T-01-13)", () => {
  it("requests /repos/{owner}/{repo}", async () => {
    const fetchMock = stubFetch(jsonResponse(detailPayload()));

    await getRepository("facebook", "react");

    const url = requestedUrl(fetchMock);
    expect(url.origin).toBe("https://api.github.com");
    expect(url.pathname).toBe("/repos/facebook/react");
  });

  // The traversal that would otherwise reach the search endpoint. Each segment
  // is encoded separately, so the `/` inside the owner cannot become a path
  // separator and the request still addresses a repository.
  it("cannot be made to address another endpoint by a traversing owner", async () => {
    const fetchMock = stubFetch(jsonResponse(detailPayload()));

    await getRepository("../../search", "repositories");

    const url = requestedUrl(fetchMock);
    expect(url.pathname.startsWith("/repos/")).toBe(true);
    expect(segmentsAfterRepos(fetchMock)).toHaveLength(2);
    expect(url.pathname).not.toBe("/search/repositories");
    expect(url.pathname).toBe("/repos/..%2F..%2Fsearch/repositories");
  });

  it.each([
    ["a space", "owner name", "repo name"],
    ["a fragment marker", "own#er", "re#po"],
    ["a query marker", "own?er", "re?po"],
    ["Japanese characters", "日本語", "リポジトリ"],
  ])(
    "encodes %s in both segments rather than spilling out of the path",
    async (_label, owner, repo) => {
      const fetchMock = stubFetch(jsonResponse(detailPayload()));

      await getRepository(owner, repo);

      const url = requestedUrl(fetchMock);
      // Nothing escaped into a query string or a fragment.
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      expect(segmentsAfterRepos(fetchMock)).toEqual([
        encodeURIComponent(owner),
        encodeURIComponent(repo),
      ]);
    }
  );

  it("trims surrounding whitespace before encoding it into the path", async () => {
    const fetchMock = stubFetch(jsonResponse(detailPayload()));

    await getRepository("  facebook  ", "  react  ");

    expect(requestedUrl(fetchMock).pathname).toBe("/repos/facebook/react");
  });
});

describe("getRepository — the blank-argument guard", () => {
  it.each([
    ["a blank owner", "", "react"],
    ["a whitespace-only owner", "   ", "react"],
    ["a blank repo", "facebook", ""],
    ["a whitespace-only repo", "facebook", "\n\t"],
    ["both blank", "", ""],
  ])("returns NOT_FOUND for %s without making a request", async (
    _label,
    owner,
    repo
  ) => {
    const fetchMock = stubFetch(jsonResponse(detailPayload()));

    const result = await getRepository(owner, repo);

    // NOT_FOUND rather than INVALID_QUERY: a blank owner names no repository,
    // and the not-found page is what a user in that position should see.
    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getRepository — failures it returns", () => {
  // Returned, not thrown, so Phase 3's page can call notFound() itself (D-01).
  it("returns NOT_FOUND when GitHub answers 404", async () => {
    const fetchMock = stubFetch(respond("{}", { status: 404 }));

    const result = await getRepository("facebook", "nope");

    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns RATE_LIMIT with a reset time when the quota is exhausted", async () => {
    stubFetch(
      respond("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } })
    );

    expect(await getRepository("facebook", "react")).toEqual({
      ok: false,
      error: { code: "RATE_LIMIT", resetAt: 1700000900 },
    });
  });

  it("returns RATE_LIMIT on 429 as well", async () => {
    stubFetch(respond("{}", { status: 429 }));

    expect(await getRepository("facebook", "react")).toEqual({
      ok: false,
      error: { code: "RATE_LIMIT", resetAt: 1700000900 },
    });
  });
});

describe("getRepository — failures it throws (D-03, D-05a)", () => {
  it("lets a 500 propagate as a thrown GitHubRequestError rather than returning a failure", async () => {
    stubFetch(respond("{}", { status: 500 }));

    await expect(getRepository("facebook", "react")).rejects.toBeInstanceOf(
      GitHubRequestError
    );
  });

  it("lets a transport fault propagate after the client's single retry", async () => {
    const fetchMock = stubFetch(
      new TypeError("fetch failed"),
      new TypeError("fetch failed")
    );

    await expect(getRepository("facebook", "react")).rejects.toBeInstanceOf(
      GitHubRequestError
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getRepository — caching", () => {
  it("asks for the 300-second detail window (D-09)", async () => {
    const fetchMock = stubFetch(jsonResponse(detailPayload()));

    await getRepository("facebook", "react");

    expect(initOf(fetchMock).next?.revalidate).toBe(300);
  });

  // The opt-in itself belongs to `githubFetch`; asserted here only to prove the
  // unit does not undo it on the way past.
  it("does not disturb the client's cache opt-in", async () => {
    const fetchMock = stubFetch(jsonResponse(detailPayload()));

    await getRepository("facebook", "react");

    expect(initOf(fetchMock).cache).toBe("force-cache");
  });
});
