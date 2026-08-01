import { expect, test } from "@playwright/test";

// Placeholder until the search flow lands (Phase 2). Its job right now is to prove the
// harness works end to end: build, serve, navigate, assert.
//
// Every spec that touches GitHub MUST intercept api.github.com — CI runners share IPs and
// are aggressively rate-limited, so a live call would make this suite flaky.
test("home page renders", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
