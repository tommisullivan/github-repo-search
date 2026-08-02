import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RateLimitPanel } from "./RateLimitPanel";

describe("RateLimitPanel", () => {
  it("renders an alert with a positive minute figure when resetAt is in the future", () => {
    const now = 1_700_000_000;
    render(<RateLimitPanel resetAt={now + 300} now={now} />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    // 300 seconds = 5 minutes.
    expect(alert).toHaveTextContent(/5\s*分/);
  });

  it("renders a retry-now message when resetAt is in the past", () => {
    const now = 1_700_000_000;
    render(<RateLimitPanel resetAt={now - 60} now={now} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/現在リトライ可能/);
    // No negative or zero-minute number should ever surface to the user.
    expect(screen.queryByText(/-\d/)).toBeNull();
    expect(screen.queryByText(/0\s*分/)).toBeNull();
  });

  it("renders retry-now (not zero minutes) when resetAt equals now", () => {
    const now = 1_700_000_000;
    render(<RateLimitPanel resetAt={now} now={now} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/現在リトライ可能/);
    expect(screen.queryByText(/0\s*分/)).toBeNull();
  });
});
