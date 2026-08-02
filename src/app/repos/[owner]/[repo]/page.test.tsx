import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route's Server Component under test. `page.tsx` exports the async
// component as default; the test imports it directly and calls it with the
// awaited-Promise shape Next 16 uses for params/searchParams.
import RepoPage from "./page";

// The Phase 1 unit whose responses drive every branch of the page.
import { getRepository } from "@/lib/github/repo";
import { GitHubRequestError } from "@/lib/github/errors";
// The client-side `notFound` re-export so the mocked version is used inside
// the test body when asserting the call.
import { notFound } from "next/navigation";

// --------------------------------------------------------------------------
// Mocks. Per docs/TESTING.md, the component/route layer is allowed to mock
// the client at the module boundary (@/lib/github/repo) rather than at
// `fetch` — the client's translation work is Phase 1's subject, and the
// unit tests there already prove it.
//
// `notFound` is Next's magic function: it throws
// `NEXT_HTTP_ERROR_FALLBACK;404` internally so the framework can intercept
// and render `not-found.tsx`. Mocking it with a plain-Error throw lets
// `await expect(RepoPage(...)).rejects.toThrow()` assert the routing
// without pulling Next's server runtime into jsdom.
// --------------------------------------------------------------------------

vi.mock("@/lib/github/repo", () => ({
  getRepository: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));

import type { RepoDetail as RepoDetailType } from "@/types/github";

function detailFixture(
  overrides: Partial<RepoDetailType> = {}
): RepoDetailType {
  return {
    id: 10270250,
    name: "react",
    fullName: "facebook/react",
    owner: {
      login: "facebook",
      avatarUrl: "https://avatars.githubusercontent.com/u/69631?v=4",
    },
    description: "The library for web and native user interfaces.",
    language: "JavaScript",
    stars: 4321,
    forks: 47600,
    openIssues: 981,
    htmlUrl: "https://github.com/facebook/react",
    watchers: 7,
    ...overrides,
  };
}

/**
 * Convenience: build the props shape Next 16 hands to a Server Component page
 * for a `[owner]/[repo]` dynamic route. Both `params` and `searchParams` are
 * `Promise`s in Next 16 — this test asserts the page awaits them, which is
 * the DTL-04 property (a bare URL renders correctly).
 */
function pageProps(
  overrides: Partial<{
    owner: string;
    repo: string;
    from: string | string[] | undefined;
  }> = {}
) {
  const owner = overrides.owner ?? "facebook";
  const repo = overrides.repo ?? "react";
  const from = overrides.from;
  return {
    params: Promise.resolve({ owner, repo }),
    searchParams: Promise.resolve(from === undefined ? {} : { from }),
  };
}

beforeEach(() => {
  vi.mocked(getRepository).mockReset();
  vi.mocked(notFound).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<RepoPage> — the happy path (DTL-01, DTL-04)", () => {
  it("renders RepoDetail with the seven required fields when the client returns ok", async () => {
    vi.mocked(getRepository).mockResolvedValue({
      ok: true,
      data: detailFixture(),
    });

    // Await the async Server Component — this is the shape Next 16 renders on
    // a cold URL. If `page.tsx` ever forgets to await `params`, this line's
    // destructure inside the component fails before render.
    const element = await RepoPage(pageProps());
    render(element);

    expect(
      screen.getByRole("heading", { level: 1, name: /react/i })
    ).toBeInTheDocument();
    expect(screen.getByAltText(/facebook のアバター/)).toBeInTheDocument();
    expect(screen.getByText("スター")).toBeInTheDocument();
    expect(screen.getByText("4,321")).toBeInTheDocument();
    expect(screen.getByText("ウォッチャー")).toBeInTheDocument();
    // The watchers-vs-stars split reaches the DOM as two different values.
    expect(screen.getByText(/^7$/)).toBeInTheDocument();
    expect(screen.getByText("フォーク")).toBeInTheDocument();
    expect(screen.getByText("47,600")).toBeInTheDocument();
    expect(screen.getByText("オープンなIssue")).toBeInTheDocument();
    expect(screen.getByText("981")).toBeInTheDocument();
    expect(screen.getByText("主要言語")).toBeInTheDocument();
    expect(screen.getByText("JavaScript")).toBeInTheDocument();

    // The route calls the client exactly once — DTL-04 is a single read.
    expect(getRepository).toHaveBeenCalledTimes(1);
    expect(getRepository).toHaveBeenCalledWith("facebook", "react");
  });

  it("passes the resolved back target (safe ?from) through to the back link", async () => {
    vi.mocked(getRepository).mockResolvedValue({
      ok: true,
      data: detailFixture(),
    });

    const element = await RepoPage(pageProps({ from: "/?q=next&page=2" }));
    render(element);

    const back = screen.getByRole("link", { name: "戻る" });
    expect(back).toHaveAttribute("href", "/?q=next&page=2");
  });

  it("falls back to / when ?from is an open-redirect attempt", async () => {
    vi.mocked(getRepository).mockResolvedValue({
      ok: true,
      data: detailFixture(),
    });

    const element = await RepoPage(pageProps({ from: "//evil.example.com" }));
    render(element);

    const back = screen.getByRole("link", { name: "戻る" });
    expect(back).toHaveAttribute("href", "/");
  });
});

describe("<RepoPage> — failure routing (UX-05, D3-04..D3-07)", () => {
  // The framework-native path for NOT_FOUND. The page calls notFound() itself,
  // which throws NEXT_HTTP_ERROR_FALLBACK;404; Next catches that and renders
  // `not-found.tsx`. The test does not need to prove not-found.tsx renders —
  // that is Next's contract — it only needs to prove the page routes to it.
  it("calls notFound() when the client returns NOT_FOUND", async () => {
    vi.mocked(getRepository).mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND" },
    });

    await expect(RepoPage(pageProps({ owner: "facebook", repo: "nope" }))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK/
    );
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  // Defence in depth: repo.ts folds blank owner/repo into NOT_FOUND today,
  // but if that mapping ever changes, INVALID_QUERY must still route somewhere
  // deliberate. notFound() is the honest choice — an unmapped code should not
  // render as success.
  it("calls notFound() when the client returns INVALID_QUERY (defence in depth)", async () => {
    vi.mocked(getRepository).mockResolvedValue({
      ok: false,
      error: { code: "INVALID_QUERY" },
    });

    await expect(RepoPage(pageProps())).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK/);
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("renders RepoRateLimitPanel with the reset time when the client returns RATE_LIMIT", async () => {
    vi.mocked(getRepository).mockResolvedValue({
      ok: false,
      error: { code: "RATE_LIMIT", resetAt: 1_988_000_000 },
    });

    const element = await RepoPage(pageProps());
    render(element);

    // The rate-limit heading is the panel's accessible signature.
    expect(
      screen.getByRole("heading", {
        name: "GitHub APIの利用制限に達しました",
      })
    ).toBeInTheDocument();

    // And notFound was never called — a rate limit is not a not-found.
    expect(notFound).not.toHaveBeenCalled();
  });

  // D3-07 / D-03: transport faults, timeouts, 5xx, and malformed JSON reach
  // error.tsx as thrown GitHubRequestError. The page must not try/catch — a
  // caught throw would silently degrade the entire NETWORK class to whatever
  // branch the catch chose.
  it("does not catch a thrown GitHubRequestError — it propagates to error.tsx", async () => {
    const thrown = new GitHubRequestError("boom");
    vi.mocked(getRepository).mockRejectedValue(thrown);

    await expect(RepoPage(pageProps())).rejects.toBe(thrown);
    // Not routed via notFound either — a network fault is not a not-found.
    expect(notFound).not.toHaveBeenCalled();
  });
});
