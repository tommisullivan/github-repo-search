import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pagination } from "./Pagination";

function hrefOf(link: HTMLElement): URL {
  return new URL(link.getAttribute("href") ?? "", "http://example.test");
}

describe("Pagination", () => {
  it("renders active previous and next links on a middle page", () => {
    render(<Pagination q="react" page={3} hasNextPage={true} />);

    const nav = screen.getByRole("navigation", { name: /ページ移動/ });
    const prev = within(nav).getByRole("link", { name: /前へ/ });
    const next = within(nav).getByRole("link", { name: /次へ/ });

    expect(prev).not.toHaveAttribute("aria-disabled", "true");
    expect(next).not.toHaveAttribute("aria-disabled", "true");
    expect(hrefOf(prev).searchParams.get("page")).toBe("2");
    expect(hrefOf(next).searchParams.get("page")).toBe("4");
    expect(nav).toHaveTextContent("3 ページ目");
  });

  it("disables previous on page 1 while keeping it in the DOM", () => {
    render(<Pagination q="react" page={1} hasNextPage={true} />);

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
    render(<Pagination q="react" page={50} hasNextPage={false} />);

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
    render(<Pagination q="react" page={1} hasNextPage={false} />);

    const prev = screen.getByRole("link", { name: /前へ/ });
    const next = screen.getByRole("link", { name: /次へ/ });
    expect(prev).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAttribute("aria-disabled", "true");
  });

  it("encodes the keyword in the previous and next hrefs so an '&' cannot introduce a new query parameter", () => {
    render(<Pagination q="next & react" page={2} hasNextPage={true} />);

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
    render(<Pagination q="react" page={2} hasNextPage={true} />);

    const nav = screen.getByRole("navigation", { name: /ページ移動/ });
    expect(nav).toBeInTheDocument();
  });
});
