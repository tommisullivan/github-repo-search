import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The blank-query render — one of the seven axe-checked states (UX-06). The
// per-result-state specs live in search.a11y.spec.ts / repo-detail.a11y.spec.ts.
// Await the blank state's identifying heading before running axe so a loading
// fallback is never what gets scanned.

test("home page has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "キーワードを入力してください" })
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
