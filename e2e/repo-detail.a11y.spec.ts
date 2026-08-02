import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UX-06: axe over the detail view's reachable states, driven through the
// server-side GitHub mock. `/repos/e2e-fixture/repo-alpha` renders all seven
// required fields from the fixture payload; `no-such-repo` returns the mocked
// 404 and lands on the route-scoped not-found page. Each test awaits the
// state's identifying heading before running axe so a loading fallback is
// never what gets scanned. Zero tolerance, same tags as the other a11y specs.

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test("repository detail page has no detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/repos/e2e-fixture/repo-alpha");
  await expect(
    page.getByRole("heading", { level: 1, name: "repo-alpha" })
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .analyze();

  expect(results.violations).toEqual([]);
});

test("repository not-found page has no detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/repos/e2e-fixture/no-such-repo");
  await expect(
    page.getByRole("heading", { level: 1, name: "リポジトリが見つかりません" })
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .analyze();

  expect(results.violations).toEqual([]);
});
