import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Error from "./error";

describe("Error boundary", () => {
  beforeEach(() => {
    // Silence the diagnostic console.error the boundary emits so the test
    // output stays readable. The behavior under test is what reaches the DOM.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders the Japanese heading, explanation, and retry button", () => {
    const error = new globalThis.Error("boom");
    render(<Error error={error} reset={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /エラーが発生しました/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("alert")
    ).toHaveTextContent(/ネットワーク|再度お試しください/);
    expect(
      screen.getByRole("button", { name: /再試行/ })
    ).toBeInTheDocument();
  });

  it("never renders the error message in the DOM, however distinctive", () => {
    const marker = "SECRET_MESSAGE_MARKER_XYZ";
    const error = new globalThis.Error(marker);
    render(<Error error={error} reset={vi.fn()} />);

    expect(screen.queryByText(new RegExp(marker))).toBeNull();
    // Also assert the stack does not appear (the message is inside the stack).
    expect(screen.queryByText(/at Object/)).toBeNull();
  });

  it("calls reset exactly once when the retry button is clicked", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<Error error={new globalThis.Error("boom")} reset={reset} />);

    await user.click(screen.getByRole("button", { name: /再試行/ }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
