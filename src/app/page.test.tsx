import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "@/lib/github/errors";
import { GitHubRequestError } from "@/lib/github/errors";
import type { RepoSummary, SearchResult } from "@/types/github";

// Mock the capability unit at the module boundary. Tests never touch fetch
// or the real GitHub API (TESTING.md: mock at @/lib/github/*).
const mockSearch = vi.fn();
vi.mock("@/lib/github/search", () => ({
  searchRepositories: (...args: [string, number?]) => mockSearch(...args),
  SEARCH_PER_PAGE: 20,
  SEARCH_MAX_RESULTS: 1000,
}));

// Import AFTER the mock so the page picks up the mocked module.
import Home from "./page";

const makeRepo = (overrides: Partial<RepoSummary> = {}): RepoSummary => ({
  id: 1,
  name: "react",
  fullName: "facebook/react",
  owner: { login: "facebook", avatarUrl: "" },
  description: null,
  language: "JavaScript",
  stars: 200_000,
  forks: 40_000,
  openIssues: 900,
  htmlUrl: "https://github.com/facebook/react",
  ...overrides,
});

const okResult = (
  items: RepoSummary[],
  overrides: Partial<SearchResult> = {}
): Result<SearchResult> => ({
  ok: true,
  data: {
    items,
    totalCount: items.length,
    page: 1,
    perPage: 20,
    hasNextPage: false,
    ...overrides,
  },
});

async function renderPage(params: Record<string, string | string[]>) {
  const element = await Home({ searchParams: Promise.resolve(params) });
  return render(element);
}

describe("Home (search page)", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("happy path: renders each row for a keyword and passes q, page=1 to the client", async () => {
    mockSearch.mockResolvedValue(
      okResult(
        [
          makeRepo({ id: 1, name: "react", fullName: "facebook/react" }),
          makeRepo({ id: 2, name: "vue", fullName: "vuejs/vue" }),
        ],
        { totalCount: 42, hasNextPage: true }
      )
    );

    await renderPage({ q: "react" });

    expect(mockSearch).toHaveBeenCalledWith("react", 1);
    const list = screen.getByRole("list", { name: "検索結果" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    // The results header shows the raw total.
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it("passes a non-default page through to the client and computes the correct range header", async () => {
    mockSearch.mockResolvedValue(
      okResult([makeRepo({ id: 41, name: "r41" })], {
        totalCount: 100,
        page: 3,
        hasNextPage: true,
      })
    );

    await renderPage({ q: "react", page: "3" });

    expect(mockSearch).toHaveBeenCalledWith("react", 3);
    // Page 3, per_page=20 -> starts at item 41.
    const rangeText = screen.getByText(/件中/);
    expect(rangeText.textContent).toMatch(/41/);
  });

  it("empty results render the EmptyState, not a rate-limit panel", async () => {
    mockSearch.mockResolvedValue(okResult([], { totalCount: 0 }));

    await renderPage({ q: "somenonsensequeryxyzzy" });

    // EmptyState uses role="status".
    expect(
      screen.getByRole("status", { name: /(該当|見つかりませんでした)/i })
    ).toBeInTheDocument();
    // Not confusable with a rate limit: no alert.
    expect(screen.queryByRole("alert")).toBeNull();
    // Not confusable with a results list: no listitem.
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("rate limit renders its own alert panel, never as 'no results'", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockSearch.mockResolvedValue({
      ok: false,
      error: { code: "RATE_LIMIT", resetAt: now + 180 },
    });

    await renderPage({ q: "react" });

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    // Message names a positive minute count.
    expect(alert).toHaveTextContent(/\d+\s*分/);
    // Not confusable with an empty state.
    expect(screen.queryByText(/該当するリポジトリが見つかりませんでした/)).toBeNull();
    // Not confusable with a result list.
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("blank keyword renders the 'キーワードを入力してください' notice without a request", async () => {
    await renderPage({ q: "   " });

    expect(
      screen.getByRole("heading", { name: /キーワードを入力してください/ })
    ).toBeInTheDocument();
    // The guard prevents any network call at all.
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("out-of-range page renders the '検索できるページを超えています' notice without a request — distinct copy from blank", async () => {
    await renderPage({ q: "react", page: "99999" });

    expect(
      screen.getByRole("heading", { name: /検索できるページを超えています/ })
    ).toBeInTheDocument();
    // Distinct from the blank message.
    expect(
      screen.queryByRole("heading", { name: /キーワードを入力してください/ })
    ).toBeNull();
    // No request was made — the guard prevented it.
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("INVALID_QUERY returned by the client (a defensive branch) still renders a notice, never crashes", async () => {
    mockSearch.mockResolvedValue({
      ok: false,
      error: { code: "INVALID_QUERY" },
    });

    await renderPage({ q: "react" });

    // Falls back to the blank-keyword copy — see comment in page.tsx.
    expect(
      screen.getByRole("heading", { name: /キーワードを入力してください/ })
    ).toBeInTheDocument();
  });

  it("does NOT catch a thrown GitHubRequestError — the throw reaches error.tsx", async () => {
    mockSearch.mockRejectedValue(
      new GitHubRequestError("upstream 500", { status: 500 })
    );

    await expect(renderPage({ q: "react" })).rejects.toBeInstanceOf(
      GitHubRequestError
    );
  });
});
