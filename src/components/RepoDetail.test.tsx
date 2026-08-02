import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RepoDetail } from "./RepoDetail";
import type { RepoDetail as RepoDetailType } from "@/types/github";

/**
 * Tests for the detail presentation component.
 *
 * Fixture shape mirrors the mapper's output for `facebook/react` (see
 * `src/lib/github/repo.test.ts` `detailPayload()` around line 111). `watchers`
 * is 7 while `stars` is 4321 — that split is the whole point of Phase 1's
 * subscribers_count correction, and asserting the rendered values differ is
 * how the presentation layer proves it has not silently re-collapsed them.
 *
 * All queries go by role and accessible name per docs/TESTING.md — no
 * `data-testid`, no class-name assertions, no snapshots.
 */

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

describe("<RepoDetail> — the seven required fields", () => {
  it("renders the repository name as the top-level heading", () => {
    render(<RepoDetail repo={detailFixture()} backHref="/" />);

    expect(
      screen.getByRole("heading", { level: 1, name: /react/i })
    ).toBeInTheDocument();
  });

  it("renders the owner login and a Japanese avatar alt", () => {
    render(<RepoDetail repo={detailFixture()} backHref="/" />);

    // Alt is `${login} のアバター` — Japanese copy, English identifier.
    // `getByAltText` looks up by accessible name for images.
    expect(screen.getByAltText(/facebook のアバター/)).toBeInTheDocument();
  });

  it("renders the primary language when present", () => {
    render(<RepoDetail repo={detailFixture()} backHref="/" />);

    // The label is Japanese; the value carries through untranslated.
    const languageTerm = screen.getByText("主要言語");
    expect(languageTerm).toBeInTheDocument();
    expect(screen.getByText("JavaScript")).toBeInTheDocument();
  });

  it("falls back to '言語情報なし' when the primary language is null", () => {
    render(<RepoDetail repo={detailFixture({ language: null })} backHref="/" />);

    expect(screen.getByText("言語情報なし")).toBeInTheDocument();
    expect(screen.queryByText("JavaScript")).not.toBeInTheDocument();
  });

  it("renders stars, forks, and open issues with ja-JP number formatting", () => {
    render(<RepoDetail repo={detailFixture()} backHref="/" />);

    // 4321 → "4,321"; 47600 → "47,600"; 981 → "981" (thousands grouping only
    // kicks in above four digits).
    expect(screen.getByText("スター")).toBeInTheDocument();
    expect(screen.getByText("4,321")).toBeInTheDocument();

    expect(screen.getByText("フォーク")).toBeInTheDocument();
    expect(screen.getByText("47,600")).toBeInTheDocument();

    expect(screen.getByText("オープンなIssue")).toBeInTheDocument();
    expect(screen.getByText("981")).toBeInTheDocument();
  });
});

describe("<RepoDetail> — the watchers trap", () => {
  // GitHub's REST `watchers_count` duplicates `stargazers_count`. The Phase 1
  // mapper puts `subscribers_count` into `watchers`; this test proves the
  // component reads that value directly rather than aliasing back to stars.
  // If a future refactor collapses `watchers` back onto `stars`, this test
  // fails with a clear name.
  it("renders watchers from repo.watchers, distinct from stars", () => {
    render(
      <RepoDetail
        repo={detailFixture({ stars: 4321, watchers: 7 })}
        backHref="/"
      />
    );

    expect(screen.getByText("ウォッチャー")).toBeInTheDocument();
    // The `^7$` anchor is deliberate — a substring match on "7" would also
    // match "4,321" containing no 7, but would match e.g. "70" if forks were
    // 70; the anchor keeps the assertion honest.
    expect(screen.getByText(/^7$/)).toBeInTheDocument();
    // And stars is still there, unchanged.
    expect(screen.getByText("4,321")).toBeInTheDocument();
  });
});

describe("<RepoDetail> — navigation", () => {
  it("renders the back link with the accessible name '戻る' and the passed href", () => {
    render(<RepoDetail repo={detailFixture()} backHref="/?q=next&page=2" />);

    const back = screen.getByRole("link", { name: "戻る" });
    expect(back).toBeInTheDocument();
    expect(back).toHaveAttribute("href", "/?q=next&page=2");
  });

  it("renders the GitHub link with rel='noopener noreferrer' and target='_blank'", () => {
    render(<RepoDetail repo={detailFixture()} backHref="/" />);

    const github = screen.getByRole("link", { name: "GitHubで開く" });
    expect(github).toHaveAttribute("href", "https://github.com/facebook/react");
    expect(github).toHaveAttribute("target", "_blank");
    // `noreferrer` implies `noopener`; both are asserted explicitly because
    // dropping either is a common review miss.
    expect(github).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(github).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("renders the description as plain text when present", () => {
    render(<RepoDetail repo={detailFixture()} backHref="/" />);

    expect(
      screen.getByText("The library for web and native user interfaces.")
    ).toBeInTheDocument();
  });
});

describe("<RepoDetail> — accessibility structure", () => {
  it("groups the metric fields under an accessibly labelled region", () => {
    render(<RepoDetail repo={detailFixture()} backHref="/" />);

    // A single labelled region wraps the four metrics. Query by role +
    // accessible name so the assertion holds through any Tailwind change.
    const region = screen.getByRole("region", { name: "リポジトリ統計" });

    expect(within(region).getByText("スター")).toBeInTheDocument();
    expect(within(region).getByText("ウォッチャー")).toBeInTheDocument();
    expect(within(region).getByText("フォーク")).toBeInTheDocument();
    expect(within(region).getByText("オープンなIssue")).toBeInTheDocument();
  });
});
