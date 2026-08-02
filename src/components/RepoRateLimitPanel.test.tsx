import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RepoRateLimitPanel } from "./RepoRateLimitPanel";

/**
 * Tests for the rate-limit state renderer.
 *
 * This state exists as a component that the *page* renders because Phase 1
 * D-01 / D-05a returns `RATE_LIMIT` in a `Result` failure rather than
 * throwing. In production, Next sanitises server errors before the client
 * error boundary receives them, so branching on error type inside `error.tsx`
 * is unreliable — see `src/lib/github/errors.ts` header. A rate limit
 * therefore cannot be routed via `error.tsx`.
 *
 * The single most misleading collapse this app can produce is rendering a
 * rate-limit state as "リポジトリが見つかりません" (not-found). The test at
 * the bottom of this file exists precisely to prevent that regression.
 */

// Fixed to 2033-01-13 07:33:20 UTC so tests don't drift over time and don't
// depend on freezing Date.now(). The component doesn't read the current time.
const FIXED_RESET_AT_SECONDS = 1_988_000_000;

// Format expectation is computed with the same formatter the component uses,
// because the exact rendered string depends on the Node runtime's Intl data
// and hardcoding it would be a false-positive waiting to happen when Node
// updates.
const EXPECTED_TIME = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(FIXED_RESET_AT_SECONDS * 1000));

describe("<RepoRateLimitPanel>", () => {
  it("renders a heading that names the state in Japanese", () => {
    render(<RepoRateLimitPanel resetAt={FIXED_RESET_AT_SECONDS} />);

    expect(
      screen.getByRole("heading", {
        name: "GitHub APIの利用制限に達しました",
      })
    ).toBeInTheDocument();
  });

  it("renders the reset time formatted in Asia/Tokyo, not as a raw number", () => {
    render(<RepoRateLimitPanel resetAt={FIXED_RESET_AT_SECONDS} />);

    // The formatted string appears somewhere in the panel.
    // getByText permits a partial match via regex — the reset time is embedded
    // in a sentence, not standalone.
    expect(
      screen.getByText(new RegExp(EXPECTED_TIME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    ).toBeInTheDocument();

    // The raw Unix seconds must not leak into the UI.
    expect(
      screen.queryByText(String(FIXED_RESET_AT_SECONDS))
    ).not.toBeInTheDocument();
  });

  it("names Tokyo time explicitly so the reader knows the timezone", () => {
    render(<RepoRateLimitPanel resetAt={FIXED_RESET_AT_SECONDS} />);

    // "日本時間" is the timezone label. A time without a timezone is not
    // actionable for a reader in a different zone.
    expect(screen.getByText(/日本時間/)).toBeInTheDocument();
  });

  it("renders a link back to /", () => {
    render(<RepoRateLimitPanel resetAt={FIXED_RESET_AT_SECONDS} />);

    const link = screen.getByRole("link", { name: "検索に戻る" });
    expect(link).toHaveAttribute("href", "/");
  });

  // The load-bearing assertion: this state must not read as not-found.
  it("is visibly distinct from the not-found state (never renders リポジトリが見つかりません)", () => {
    render(<RepoRateLimitPanel resetAt={FIXED_RESET_AT_SECONDS} />);

    expect(
      screen.queryByText(/リポジトリが見つかりません/)
    ).not.toBeInTheDocument();
  });
});
