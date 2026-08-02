import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock next/navigation so we can observe router.replace calls and assert
// that router.push is never called. The router object is a stable singleton
// so `[debouncedQuery, router]` in the effect deps only fires when the
// keyword changes — Next's real App Router keeps the router methods stable
// across renders, and matching that here avoids a spurious effect run per
// render.
const replace = vi.fn();
const push = vi.fn();
const stableRouter = { replace, push };
vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
}));

import { SearchInput } from "./SearchInput";

/**
 * Fires a change event with the given value. Wrapped in `act` so React's
 * effect scheduling completes synchronously before we advance timers — the
 * combination that lets us test debouncing with `vi.useFakeTimers()` reliably.
 *
 * `fireEvent.change` (rather than `userEvent.type`) is deliberate here: the
 * behaviour under test is the debounce, not the keystroke-by-keystroke path
 * through the input. `user.type` awaits each character with real timers even
 * when `delay: null` is set, which deadlocks against fake timers in RTL v16.
 */
function change(input: HTMLElement, value: string) {
  act(() => {
    fireEvent.change(input, { target: { value } });
  });
}

/** Advance fake timers by ms, wrapped in `act` so effects flush. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("SearchInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockClear();
    push.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders with the initial query and does not call router.replace on mount", () => {
    render(<SearchInput initialQuery="react" sort="best-match" debounceMs={300} />);

    const input = screen.getByRole("searchbox", { name: /リポジトリを検索/ });
    expect(input).toHaveValue("react");
    // Even after the initial debounce window elapses, no replace on mount.
    advance(500);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("debounces a burst of keystrokes into a single router.replace call", () => {
    render(<SearchInput initialQuery="" sort="best-match" debounceMs={300} />);
    const input = screen.getByRole("searchbox");

    change(input, "a");
    change(input, "ab");
    change(input, "abc");

    // Before the debounce window elapses, no replace.
    expect(replace).not.toHaveBeenCalled();

    advance(300);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith("/?q=abc&page=1");
  });

  it("resets the timer across a slow burst so only the final value triggers replace", () => {
    render(<SearchInput initialQuery="" sort="best-match" debounceMs={300} />);
    const input = screen.getByRole("searchbox");

    change(input, "a");
    advance(100);
    change(input, "ab");
    advance(100);
    change(input, "abc");
    advance(300);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith("/?q=abc&page=1");
  });

  it("goes to the canonical '/' URL when the input is cleared or whitespace-only", () => {
    render(<SearchInput initialQuery="react" sort="best-match" debounceMs={300} />);
    const input = screen.getByRole("searchbox");

    change(input, "   ");
    advance(300);

    expect(replace).toHaveBeenLastCalledWith("/");
  });

  it("resets page to 1 whenever the keyword changes", () => {
    render(<SearchInput initialQuery="react" sort="best-match" debounceMs={300} />);
    const input = screen.getByRole("searchbox");

    change(input, "vue");
    advance(300);

    // The new keyword resets to page=1, even though the URL might have been
    // /?q=react&page=5 at the moment the user started typing.
    expect(replace).toHaveBeenLastCalledWith("/?q=vue&page=1");
  });

  it("encodes the keyword so an '&' or '=' cannot introduce a new query parameter", () => {
    render(<SearchInput initialQuery="" sort="best-match" debounceMs={300} />);
    const input = screen.getByRole("searchbox");

    change(input, "next & react");
    advance(300);

    const [[target]] = replace.mock.calls;
    // Parse the target with URL to assert structure, not substring.
    const parsed = new URL(target as string, "http://example.test");
    expect(parsed.pathname).toBe("/");
    expect(parsed.searchParams.get("q")).toBe("next & react");
    // Exactly two query params: q and page.
    expect(Array.from(parsed.searchParams.keys()).sort()).toEqual([
      "page",
      "q",
    ]);
    expect(parsed.searchParams.get("page")).toBe("1");
  });

  it("never calls router.push — replace is the only navigation", () => {
    render(<SearchInput initialQuery="" sort="best-match" debounceMs={300} />);
    const input = screen.getByRole("searchbox");

    change(input, "hello");
    advance(300);

    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
  });

  describe("submit", () => {
    it("navigates on the 検索 button without waiting out the debounce", () => {
      render(<SearchInput initialQuery="" sort="best-match" debounceMs={300} />);
      const input = screen.getByRole("searchbox");

      change(input, "react");
      // Deliberately no advance(): the whole point of the button is that the
      // user does not wait for a timer they cannot see.
      expect(replace).not.toHaveBeenCalled();

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "検索" }));
      });

      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenLastCalledWith("/?q=react&page=1");
    });

    it("navigates on form submit — the path Enter takes via implicit submission", () => {
      const { container } = render(
        <SearchInput initialQuery="" sort="best-match" debounceMs={300} />
      );
      const input = screen.getByRole("searchbox");
      const form = container.querySelector("form");
      expect(form).not.toBeNull();

      change(input, "vue");
      act(() => {
        fireEvent.submit(form as HTMLFormElement);
      });

      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenLastCalledWith("/?q=vue&page=1");
      // A real submit would reload the page and lose the App Router; the
      // handler must preventDefault. jsdom logs "Not implemented: submit"
      // if it does not, so assert the intent directly.
      expect(push).not.toHaveBeenCalled();
    });

    it("still resolves to the same URL when the pending debounce fires after a submit", () => {
      render(<SearchInput initialQuery="" sort="best-match" debounceMs={300} />);
      const input = screen.getByRole("searchbox");

      change(input, "react");
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "検索" }));
      });
      // The debounce timer was never cancelled, so it fires afterwards. That
      // is acceptable precisely because it lands on the identical URL — this
      // test is what stops the two paths silently diverging.
      advance(300);

      expect(replace).toHaveBeenCalledTimes(2);
      for (const [target] of replace.mock.calls) {
        expect(target).toBe("/?q=react&page=1");
      }
    });

    it("encodes the keyword on submit, same as the debounced path", () => {
      render(<SearchInput initialQuery="" sort="best-match" debounceMs={300} />);

      change(screen.getByRole("searchbox"), "next & react");
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "検索" }));
      });

      const [[target]] = replace.mock.calls;
      const parsed = new URL(target as string, "http://example.test");
      expect(parsed.searchParams.get("q")).toBe("next & react");
      expect(Array.from(parsed.searchParams.keys()).sort()).toEqual([
        "page",
        "q",
      ]);
    });

    it("goes to the canonical '/' when submitted with a whitespace-only keyword", () => {
      render(<SearchInput initialQuery="react" sort="best-match" debounceMs={300} />);

      change(screen.getByRole("searchbox"), "   ");
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "検索" }));
      });

      expect(replace).toHaveBeenLastCalledWith("/");
    });

    it("exposes the control as a search landmark with a labelled input", () => {
      render(<SearchInput initialQuery="" sort="best-match" debounceMs={300} />);

      expect(screen.getByRole("search")).toBeInTheDocument();
      // The visible 「キーワード」 label is wired by htmlFor/id now that a
      // <form> sits where the wrapping <label> used to be.
      expect(screen.getByText("キーワード")).toHaveAttribute(
        "for",
        screen.getByRole("searchbox").id
      );
      expect(screen.getByRole("searchbox").id).not.toBe("");
    });
  });

  describe("sort control", () => {
    const sortBox = () =>
      screen.getByRole("combobox", { name: "並び替え" });

    it("reflects the sort from the URL rather than local state", () => {
      const { rerender } = render(
        <SearchInput initialQuery="react" sort="stars" debounceMs={300} />
      );
      expect(sortBox()).toHaveValue("stars");

      // Simulates Back to a differently-sorted URL: the server re-renders with
      // a new prop and the control must follow it. A local useState would not.
      rerender(
        <SearchInput initialQuery="react" sort="best-match" debounceMs={300} />
      );
      expect(sortBox()).toHaveValue("best-match");
    });

    it("navigates immediately on change, without a second click on 検索", () => {
      render(
        <SearchInput initialQuery="react" sort="best-match" debounceMs={300} />
      );

      act(() => {
        fireEvent.change(sortBox(), { target: { value: "stars" } });
      });

      expect(replace).toHaveBeenCalledTimes(1);
      const parsed = new URL(
        replace.mock.calls[0][0] as string,
        "http://example.test"
      );
      expect(parsed.searchParams.get("sort")).toBe("stars");
      expect(parsed.searchParams.get("q")).toBe("react");
    });

    it("resets to page 1 when the ordering changes", () => {
      render(
        <SearchInput initialQuery="react" sort="best-match" debounceMs={300} />
      );

      act(() => {
        fireEvent.change(sortBox(), { target: { value: "stars" } });
      });

      // Page 7 of a relevance-ranked list is not page 7 of a star-ranked one.
      expect(
        new URL(
          replace.mock.calls[0][0] as string,
          "http://example.test"
        ).searchParams.get("page")
      ).toBe("1");
    });

    it("keeps the keyword the user can currently see, not the debounced one", () => {
      render(<SearchInput initialQuery="" sort="best-match" debounceMs={300} />);

      // Type without letting the debounce settle, then re-sort.
      change(screen.getByRole("searchbox"), "vue");
      act(() => {
        fireEvent.change(sortBox(), { target: { value: "stars" } });
      });

      expect(
        new URL(
          replace.mock.calls[0][0] as string,
          "http://example.test"
        ).searchParams.get("q")
      ).toBe("vue");
    });

    it("offers exactly the supported orderings, in Japanese", () => {
      render(<SearchInput initialQuery="" sort="best-match" debounceMs={300} />);

      expect(
        Array.from(sortBox().querySelectorAll("option")).map((o) => o.textContent)
      ).toEqual(["関連度順", "スター数順"]);
    });
  });
});
