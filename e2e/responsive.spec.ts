import { expect, test, type Locator } from "@playwright/test";

// UX-07 made falsifiable (D4-13): at a mobile and a desktop viewport, neither
// view scrolls horizontally and the key controls sit inside the viewport
// width. The fixture repo-alpha description deliberately carries one long
// unbroken URL token, so the 375px run exercises real wrapping rather than
// passing on conveniently short copy.

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 1280, height: 800 },
] as const;

/** Asserts the element has a layout box that fits inside the viewport width. */
async function expectToFitHorizontally(
  locator: Locator,
  viewportWidth: number
): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return; // unreachable — narrow for the compiler, no `!`
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth);
}

/** No horizontal overflow: the document is no wider than its viewport. */
async function expectNoHorizontalOverflow(page: {
  evaluate: <T>(fn: () => T) => Promise<T>;
}): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("search view has no horizontal overflow and its key controls fit", async ({
      page,
    }) => {
      await page.goto("/?q=fixture-alpha");

      const resultLink = page.getByRole("link", {
        name: "e2e-fixture/repo-alpha",
      });
      await expect(resultLink).toBeVisible();

      await expectNoHorizontalOverflow(page);

      const input = page.getByRole("searchbox", { name: "リポジトリを検索" });
      await expect(input).toBeVisible();
      await expectToFitHorizontally(input, viewport.width);
      await expectToFitHorizontally(resultLink, viewport.width);
    });

    test("detail view has no horizontal overflow and its key controls fit", async ({
      page,
    }) => {
      await page.goto("/repos/e2e-fixture/repo-alpha");

      await expect(
        page.getByRole("heading", { level: 1, name: "repo-alpha" })
      ).toBeVisible();

      await expectNoHorizontalOverflow(page);

      const backLink = page.getByRole("link", { name: "戻る" });
      await expect(backLink).toBeVisible();
      await expectToFitHorizontally(backLink, viewport.width);

      const stats = page.getByRole("region", { name: "リポジトリ統計" });
      await expect(stats).toBeVisible();
      await expectToFitHorizontally(stats, viewport.width);
    });
  });
}
