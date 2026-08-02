/**
 * `installGitHubApiMock()` — the server-side GitHub API mock for E2E runs.
 *
 * Wraps `globalThis.fetch` in the Next server process so that every request to
 * `api.github.com` is answered from the fixtures in `./fixtures.ts` and **no
 * E2E request ever reaches the live GitHub API** — the one non-negotiable rule
 * in `docs/TESTING.md`. Installed only by `src/instrumentation.ts`, and only
 * when `E2E_GITHUB_MOCK=1` (set solely by the Playwright `webServer`).
 *
 * Why here and not elsewhere — the rejected alternatives (D4-01):
 * - `page.route("https://api.github.com/**")`: browser-side only; every GitHub
 *   call in this app is server-side (Server Components), so it would never fire.
 * - An env-settable base URL pointing at a mock server: sealed by T-01-26 —
 *   a configurable base URL redirects the `Authorization` header (the app's
 *   single secret) to any host an environment variable can name.
 * - MSW: a new dev dependency for exactly two endpoint shapes; this ~100-line
 *   wrapper on the platform covers the need with zero dependencies.
 *
 * Ordering with Next's own fetch patching is tolerated in either direction:
 * whatever `globalThis.fetch` currently is gets wrapped. If Next patches after
 * us, its cache wrapper calls this wrapper; if before, this wrapper wraps
 * Next's. Both orders intercept — the only variable is whether a fixture
 * response is additionally cached, which is harmless in E2E.
 *
 * Unmatched `api.github.com` requests get a loud sentinel 500
 * (`E2E_MOCK_UNMATCHED`), never a pass-through: a spec that triggers one has a
 * bug, and it must fail visibly, not silently hit the live API (T-04-03).
 */

import {
  RATE_LIMIT_RESET,
  REPO_ALPHA_DETAIL,
  SEARCH_EMPTY,
  SEARCH_PAGE_1,
  SEARCH_PAGE_2,
} from "./fixtures";

/** Guards double-installation if register() ever runs twice in one process. */
let installed = false;

/**
 * Plausible headroom on successful responses — the client logs
 * `x-ratelimit-remaining` on every call, so the mock supplies it.
 */
const HEALTHY_RATE_LIMIT_HEADERS = {
  "x-ratelimit-remaining": "30",
  "x-ratelimit-reset": String(RATE_LIMIT_RESET),
};

/** A 1×1 transparent PNG, so the image optimizer needs no network (D4-04). */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...HEALTHY_RATE_LIMIT_HEADERS,
    },
  });
}

function rateLimitedResponse(): Response {
  return new Response(
    JSON.stringify({ message: "API rate limit exceeded (e2e fixture)" }),
    {
      status: 403,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(RATE_LIMIT_RESET),
      },
    }
  );
}

function unmatchedResponse(pathname: string): Response {
  // Pathname only — never the full URL — to keep query values out of stdout.
  console.error(
    `[e2e-github-mock] UNMATCHED api.github.com request: ${pathname} — returning sentinel 500`
  );
  return new Response("E2E_MOCK_UNMATCHED", { status: 500 });
}

function routeSearch(url: URL): Response {
  const q = url.searchParams.get("q") ?? "";
  const page = url.searchParams.get("page") ?? "1";

  // `q` *contains* the keyword — the client may add qualifiers — so match with
  // `includes`, not equality (see how searchRepositories builds its params).
  if (q.includes("fixture-ratelimit")) {
    return rateLimitedResponse();
  }
  if (q.includes("fixture-empty")) {
    return jsonResponse(SEARCH_EMPTY);
  }
  if (q.includes("fixture-alpha")) {
    if (page === "1") {
      return jsonResponse(SEARCH_PAGE_1);
    }
    if (page === "2") {
      return jsonResponse(SEARCH_PAGE_2);
    }
    // A page the scenario table does not define is a spec bug — fail loudly.
    return unmatchedResponse(url.pathname);
  }

  return unmatchedResponse(url.pathname);
}

function routeGitHub(url: URL): Response {
  if (url.pathname === "/search/repositories") {
    return routeSearch(url);
  }
  if (url.pathname === "/repos/e2e-fixture/repo-alpha") {
    return jsonResponse(REPO_ALPHA_DETAIL);
  }
  if (url.pathname === "/repos/e2e-fixture/no-such-repo") {
    return jsonResponse({ message: "Not Found" }, 404);
  }

  return unmatchedResponse(url.pathname);
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === "string") {
      return new URL(input);
    }
    if (input instanceof URL) {
      return input;
    }
    return new URL(input.url);
  } catch {
    // Relative URLs cannot address api.github.com — let the real fetch decide.
    return null;
  }
}

/**
 * Replaces `globalThis.fetch` with a router: `api.github.com` → fixtures,
 * `avatars.githubusercontent.com` → a tiny valid PNG (best-effort, D4-04),
 * every other host → the captured previous fetch, unchanged.
 */
export function installGitHubApiMock(): void {
  if (installed) {
    return;
  }
  installed = true;

  const passThroughFetch = globalThis.fetch;

  const mockedFetch: typeof fetch = async (input, init) => {
    const url = requestUrl(input);

    if (url === null) {
      return passThroughFetch(input, init);
    }

    if (url.hostname === "api.github.com") {
      return routeGitHub(url);
    }

    if (url.hostname === "avatars.githubusercontent.com") {
      return new Response(new Uint8Array(TRANSPARENT_PNG), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }

    return passThroughFetch(input, init);
  };

  globalThis.fetch = mockedFetch;

  // Loud on purpose (T-04-01): accidental activation must be visible in the
  // server log instantly, not discovered through subtly wrong data.
  console.info(
    "[e2e-github-mock] installed — api.github.com requests are served from fixtures"
  );
}
