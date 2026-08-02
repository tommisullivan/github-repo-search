import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultList } from "./ResultList";
import type { RepoSummary } from "@/types/github";

const makeRepo = (overrides: Partial<RepoSummary> = {}): RepoSummary => ({
  id: 1,
  name: "react",
  fullName: "facebook/react",
  owner: { login: "facebook", avatarUrl: "https://avatars.example/1" },
  description: null,
  language: "JavaScript",
  stars: 200_000,
  forks: 40_000,
  openIssues: 900,
  htmlUrl: "https://github.com/facebook/react",
  ...overrides,
});

describe("ResultList", () => {
  it("renders one accessible row per repository with the four required fields", () => {
    const items = [
      makeRepo({ id: 1, name: "react", fullName: "facebook/react" }),
      makeRepo({
        id: 2,
        name: "vue",
        fullName: "vuejs/vue",
        owner: { login: "vuejs", avatarUrl: "" },
        language: "TypeScript",
        stars: 210_000,
      }),
    ];
    render(<ResultList items={items} currentSearchUrl="/?q=js" />);

    const list = screen.getByRole("list", { name: "検索結果" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    const first = within(rows[0]);
    expect(first.getByRole("link", { name: /facebook\/react/ })).toBeInTheDocument();
    // The row text should contain the four required fields.
    expect(first.getByText(/所有者:/)).toHaveTextContent(/facebook/);
    expect(first.getByText(/言語:/)).toHaveTextContent(/JavaScript/);
    expect(first.getByText(/スター:/)).toHaveTextContent(/200,000/);

    const second = within(rows[1]);
    expect(second.getByRole("link", { name: /vuejs\/vue/ })).toBeInTheDocument();
    expect(second.getByText(/所有者:/)).toHaveTextContent(/vuejs/);
    expect(second.getByText(/言語:/)).toHaveTextContent(/TypeScript/);
    expect(second.getByText(/スター:/)).toHaveTextContent(/210,000/);
  });

  it("renders `-` when language is null, not 'null' and not empty", () => {
    render(
      <ResultList
        items={[makeRepo({ language: null })]}
        currentSearchUrl="/"
      />
    );

    // Language label is present and shows the dash.
    const list = screen.getByRole("list");
    expect(list).toHaveTextContent(/言語:\s*-/);
    expect(list).not.toHaveTextContent(/null/);
  });

  it("links each row to the detail route with an encoded ?from carrying the current search URL", () => {
    render(
      <ResultList
        items={[
          makeRepo({
            owner: { login: "facebook", avatarUrl: "" },
            name: "react",
          }),
        ]}
        currentSearchUrl="/?q=react&page=2"
      />
    );

    const link = screen.getByRole("link", { name: /facebook\/react/ });
    const href = link.getAttribute("href") ?? "";
    const url = new URL(href, "http://example.test");

    expect(url.pathname).toBe("/repos/facebook/react");
    expect(url.searchParams.get("from")).toBe("/?q=react&page=2");
  });

  it("encodes owner and repo path segments so an unsafe character cannot escape /repos/", () => {
    render(
      <ResultList
        items={[
          makeRepo({
            id: 99,
            fullName: "danger/../etc/spa ce#hash",
            owner: { login: "danger/../etc", avatarUrl: "" },
            name: "spa ce#hash",
          }),
        ]}
        currentSearchUrl="/"
      />
    );

    const link = screen.getByRole("link");
    const href = link.getAttribute("href") ?? "";
    const url = new URL(href, "http://example.test");

    // Pathname must still be a two-segment path under /repos/.
    expect(url.pathname.startsWith("/repos/")).toBe(true);
    const segments = url.pathname.replace(/^\/repos\//, "").split("/");
    expect(segments).toHaveLength(2);
    // The slashes and unsafe characters were percent-encoded, not raw.
    // A raw '/' inside a segment would appear as an extra segment above; the
    // segment-count check is the real security invariant. Also assert the
    // fragment marker '#' cannot escape into the URL structure.
    expect(url.pathname).not.toContain("#");
    // A raw slash between owner and repo is fine (that IS the separator),
    // but no segment should be able to contain a raw slash. Verified by
    // segment count above. Additionally, the encoded form of '/' should be
    // present within one segment as %2F, proving the encoding happened.
    expect(url.pathname).toMatch(/%2F/i);
  });

  it("renders an empty list (no rows) when items is empty", () => {
    render(<ResultList items={[]} currentSearchUrl="/" />);

    const list = screen.getByRole("list", { name: "検索結果" });
    expect(within(list).queryAllByRole("listitem")).toHaveLength(0);
  });
});
