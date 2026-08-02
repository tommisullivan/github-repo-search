import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UX-06: axe over every reachable state of the search view, driven through the
// server-side GitHub mock (src/instrumentation.ts + src/lib/e2e/, active because
// the Playwright webServer sets E2E_GITHUB_MOCK=1). State selection follows the
// D4-02a fixture-keyword contract: `fixture-alpha` → results, `fixture-empty` →
// zero results, `fixture-ratelimit` → 403 panel; an out-of-range page is guarded
// before any request. Each test awaits the state's identifying copy before
// running axe so a loading fallback is never what gets scanned.
//
// Zero tolerance: same tags as e2e/home.a11y.spec.ts, `violations` must equal
// the empty array. A violation is fixed in the components, never excluded here.

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test("search results state has no detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/?q=fixture-alpha");
  await expect(
    page.getByRole("link", { name: "e2e-fixture/repo-alpha" })
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .analyze();

  expect(results.violations).toEqual([]);
});

test("search empty state has no detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/?q=fixture-empty");
  await expect(
    page.getByRole("heading", {
      name: "該当するリポジトリが見つかりませんでした",
    })
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .analyze();

  expect(results.violations).toEqual([]);
});

test("search rate-limit state has no detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/?q=fixture-ratelimit");
  await expect(
    page.getByRole("heading", { name: "アクセス制限中" })
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .analyze();

  expect(results.violations).toEqual([]);
});

test("search invalid-query (out-of-range page) state has no detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/?q=fixture-alpha&page=99999");
  await expect(
    page.getByRole("heading", { name: "検索できるページを超えています" })
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .analyze();

  expect(results.violations).toEqual([]);
});
