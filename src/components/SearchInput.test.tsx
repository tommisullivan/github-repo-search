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
    render(<SearchInput initialQuery="react" debounceMs={300} />);

    const input = screen.getByRole("searchbox", { name: /リポジトリを検索/ });
    expect(input).toHaveValue("react");
    // Even after the initial debounce window elapses, no replace on mount.
    advance(500);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("debounces a burst of keystrokes into a single router.replace call", () => {
    render(<SearchInput initialQuery="" debounceMs={300} />);
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
    render(<SearchInput initialQuery="" debounceMs={300} />);
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
    render(<SearchInput initialQuery="react" debounceMs={300} />);
    const input = screen.getByRole("searchbox");

    change(input, "   ");
    advance(300);

    expect(replace).toHaveBeenLastCalledWith("/");
  });

  it("resets page to 1 whenever the keyword changes", () => {
    render(<SearchInput initialQuery="react" debounceMs={300} />);
    const input = screen.getByRole("searchbox");

    change(input, "vue");
    advance(300);

    // The new keyword resets to page=1, even though the URL might have been
    // /?q=react&page=5 at the moment the user started typing.
    expect(replace).toHaveBeenLastCalledWith("/?q=vue&page=1");
  });

  it("encodes the keyword so an '&' or '=' cannot introduce a new query parameter", () => {
    render(<SearchInput initialQuery="" debounceMs={300} />);
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
    render(<SearchInput initialQuery="" debounceMs={300} />);
    const input = screen.getByRole("searchbox");

    change(input, "hello");
    advance(300);

    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
  });
});
