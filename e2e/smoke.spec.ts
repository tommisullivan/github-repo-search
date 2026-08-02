import { expect, test } from "@playwright/test";

// The one-assertion harness check: build, serve, navigate, assert. The real user
// journey lives in search-detail.spec.ts.
//
// No spec ever reaches the live GitHub API — every call is server-side, so it is
// mocked in the Next server itself (src/instrumentation.ts installs
// src/lib/e2e/githubApiMock.ts when the Playwright webServer sets
// E2E_GITHUB_MOCK=1). CI runners share IPs and are aggressively rate-limited, so
// a live call would make this suite flaky; unmatched api.github.com requests get
// a sentinel 500, never a pass-through.
test("home page renders", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
