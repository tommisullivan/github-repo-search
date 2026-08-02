import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pagination } from "./Pagination";

function hrefOf(link: HTMLElement): URL {
  return new URL(link.getAttribute("href") ?? "", "http://example.test");
}

describe("Pagination", () => {
  it("renders active previous and next links on a middle page", () => {
    render(<Pagination q="react" page={3} hasNextPage={true} totalPages={10} sort="best-match" position="bottom" />);

    const nav = screen.getByRole("navigation", { name: /ページ移動/ });
    const prev = within(nav).getByRole("link", { name: /前へ/ });
    const next = within(nav).getByRole("link", { name: /次へ/ });

    expect(prev).not.toHaveAttribute("aria-disabled", "true");
    expect(next).not.toHaveAttribute("aria-disabled", "true");
    expect(hrefOf(prev).searchParams.get("page")).toBe("2");
    expect(hrefOf(next).searchParams.get("page")).toBe("4");
    expect(nav).toHaveTextContent("3 / 10 ページ");
  });

  it("disables previous on page 1 while keeping it in the DOM", () => {
    render(<Pagination q="react" page={1} hasNextPage={true} totalPages={10} sort="best-match" position="bottom" />);

    // The disabled prev is a span with role="link" and aria-disabled="true".
    const disabledPrev = screen
      .getAllByRole("link", { name: /前へ/ })
      .find((el) => el.getAttribute("aria-disabled") === "true");
    expect(disabledPrev).toBeInTheDocument();

    // Next is still an active anchor link.
    const nextAnchors = screen.getAllByRole("link", { name: /次へ/ });
    const activeNext = nextAnchors.find(
      (el) => el.tagName === "A" || el.hasAttribute("href")
    );
    expect(activeNext).toBeDefined();
    if (activeNext) {
      expect(hrefOf(activeNext).searchParams.get("page")).toBe("2");
    }
  });

  it("disables next on the last reachable page while keeping it in the DOM", () => {
    render(<Pagination q="react" page={50} hasNextPage={false} totalPages={50} sort="best-match" position="bottom" />);

    const disabledNext = screen
      .getAllByRole("link", { name: /次へ/ })
      .find((el) => el.getAttribute("aria-disabled") === "true");
    expect(disabledNext).toBeInTheDocument();

    const prevAnchors = screen.getAllByRole("link", { name: /前へ/ });
    const activePrev = prevAnchors.find(
      (el) => el.tagName === "A" || el.hasAttribute("href")
    );
    expect(activePrev).toBeDefined();
    if (activePrev) {
      expect(hrefOf(activePrev).searchParams.get("page")).toBe("49");
    }
  });

  it("disables both previous and next on a single-page result", () => {
    render(<Pagination q="react" page={1} hasNextPage={false} totalPages={1} sort="best-match" position="bottom" />);

    const prev = screen.getByRole("link", { name: /前へ/ });
    const next = screen.getByRole("link", { name: /次へ/ });
    expect(prev).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAttribute("aria-disabled", "true");
  });

  it("encodes the keyword in the previous and next hrefs so an '&' cannot introduce a new query parameter", () => {
    render(<Pagination q="next & react" page={2} hasNextPage={true} totalPages={5} sort="best-match" position="bottom" />);

    const nav = screen.getByRole("navigation");
    const prev = within(nav).getByRole("link", { name: /前へ/ });
    const next = within(nav).getByRole("link", { name: /次へ/ });

    for (const link of [prev, next]) {
      const parsed = hrefOf(link);
      expect(parsed.pathname).toBe("/");
      expect(parsed.searchParams.get("q")).toBe("next & react");
      expect(Array.from(parsed.searchParams.keys()).sort()).toEqual([
        "page",
        "q",
      ]);
    }
  });

  it("exposes the pagination as a labelled navigation region", () => {
    render(<Pagination q="react" page={2} hasNextPage={true} totalPages={7} sort="best-match" position="bottom" />);

    const nav = screen.getByRole("navigation", { name: /ページ移動/ });
    expect(nav).toBeInTheDocument();
  });

  describe("rendered twice per page", () => {
    it("gives the two copies distinct landmark names so they are not duplicates", () => {
      render(
        <>
          <Pagination
            q="react"
            page={2}
            hasNextPage={true}
            totalPages={7}
            sort="best-match"
            position="top"
          />
          <Pagination
            q="react"
            page={2}
            hasNextPage={true}
            totalPages={7}
            sort="best-match"
            position="bottom"
          />
        </>
      );

      // Two navigation landmarks with the same accessible name is an axe
      // `landmark-unique` violation, so the names must differ.
      expect(
        screen.getByRole("navigation", { name: "ページ移動（上部）" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("navigation", { name: "ページ移動（下部）" })
      ).toBeInTheDocument();
    });

    it("announces the page change once, from the top copy only", () => {
      const { container } = render(
        <>
          <Pagination
            q="react"
            page={2}
            hasNextPage={true}
            totalPages={7}
            sort="best-match"
            position="top"
          />
          <Pagination
            q="react"
            page={2}
            hasNextPage={true}
            totalPages={7}
            sort="best-match"
            position="bottom"
          />
        </>
      );

      // Two live regions with identical text would say "2 / 7 ページ" twice
      // on every navigation.
      const live = container.querySelectorAll("[aria-live]");
      expect(live).toHaveLength(1);
      expect(live[0]).toHaveTextContent("2 / 7 ページ");

      // Both copies still *show* the indicator — only one announces it.
      expect(screen.getAllByText(/2 \/ 7 ページ/)).toHaveLength(2);
    });
  });

  describe("sort", () => {
    it("carries the active sort into both hrefs so paging does not silently reset it", () => {
      render(
        <Pagination
          q="react"
          page={3}
          hasNextPage={true}
          totalPages={10}
          sort="stars"
          position="bottom"
        />
      );

      const nav = screen.getByRole("navigation", { name: /ページ移動/ });
      const prev = within(nav).getByRole("link", { name: /前へ/ });
      const next = within(nav).getByRole("link", { name: /次へ/ });

      for (const [link, expectedPage] of [
        [prev, "2"],
        [next, "4"],
      ] as const) {
        const parsed = hrefOf(link);
        expect(parsed.searchParams.get("sort")).toBe("stars");
        expect(parsed.searchParams.get("page")).toBe(expectedPage);
        expect(parsed.searchParams.get("q")).toBe("react");
      }
    });

    it("omits sort from the hrefs on the default ordering", () => {
      render(
        <Pagination
          q="react"
          page={3}
          hasNextPage={true}
          totalPages={10}
          sort="best-match"
          position="bottom"
        />
      );

      const next = within(
        screen.getByRole("navigation", { name: /ページ移動/ })
      ).getByRole("link", { name: /次へ/ });

      // There is no `sort=best-match` in GitHub's API and no reason to put one
      // in the URL — the short shape stays the default.
      expect(hrefOf(next).searchParams.has("sort")).toBe(false);
    });
  });

  it("shows the current page out of the total", () => {
    render(
      <Pagination
        q="react"
        page={4}
        hasNextPage={true}
        totalPages={50}
        sort="best-match"
        position="bottom"
      />
    );

    expect(
      screen.getByRole("navigation", { name: /ページ移動/ })
    ).toHaveTextContent("4 / 50 ページ");
  });
});
