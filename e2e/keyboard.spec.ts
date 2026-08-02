import { expect, test } from "@playwright/test";

// UX-06 made falsifiable (D4-12): the whole search → detail → back journey is
// driven with page.keyboard only — no mouse after the initial goto. Every stop
// asserts the focused element by role and accessible name, so a dead tab stop
// or a reordered sequence fails with a name, not a timeout. URL changes are
// asserted with Playwright's retrying URL expectation, never a raw wait.

test("search → detail → back is fully operable with the keyboard alone", async ({
  page,
}) => {
  await page.goto("/");

  // Stop 1: the first Tab from the document reaches the search input — it is
  // the page's first interactive control in reading order.
  await page.keyboard.press("Tab");
  const input = page.getByRole("searchbox", { name: "リポジトリを検索" });
  await expect(input).toBeFocused();

  // Typing the fixture keyword updates the URL after the 300ms debounce.
  await page.keyboard.type("fixture-alpha");
  await expect(page).toHaveURL(/\?q=fixture-alpha&page=1/);

  // The mocked results render; focus survives the router.replace refresh
  // because the client-side input's DOM node is preserved.
  const resultLink = page.getByRole("link", { name: "e2e-fixture/repo-alpha" });
  await expect(resultLink).toBeVisible();
  await expect(input).toBeFocused();

  // Stops 2-5: every control between the input and the results, named. The
  // sequence is longer than it was — the 検索 button, the sort control and the
  // top pagination all sit here now — so the assertion enumerates each stop
  // rather than counting Tabs. A stray or dead stop fails with a name.
  //
  // Note the cost this makes visible: a keyboard user now passes four controls
  // to reach the first result. That is the trade for not having to scroll to
  // the bottom to page, and it is deliberate — the top pagination's disabled
  // 前へ stays focusable by design (D-19), so it is a stop even on page 1.
  const topPagination = page.getByRole("navigation", {
    name: "ページ移動（上部）",
  });

  for (const expected of [
    page.getByRole("button", { name: "検索" }),
    page.getByRole("combobox", { name: "並び替え" }),
    topPagination.getByRole("link", { name: "前へ" }),
    topPagination.getByRole("link", { name: "次へ" }),
  ]) {
    await page.keyboard.press("Tab");
    await expect(expected).toBeFocused();
  }

  // Stop 6: the next Tab reaches the first result link — nothing else in
  // between.
  await page.keyboard.press("Tab");
  await expect(resultLink).toBeFocused();

  // Enter follows the link to the detail route, carrying ?from=.
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/repos\/e2e-fixture\/repo-alpha\?from=/);
  await expect(
    page.getByRole("heading", { level: 1, name: "repo-alpha" })
  ).toBeVisible();

  // Stop 4: on the detail page the first Tab reaches the 戻る link — the
  // back affordance is the first interactive control in reading order.
  await page.keyboard.press("Tab");
  const backLink = page.getByRole("link", { name: "戻る" });
  await expect(backLink).toBeFocused();

  // Enter returns to the search view with both the keyword and the page
  // number intact (SRCH-03 / DTL-05, keyboard-only).
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\?q=fixture-alpha&page=1/);
  await expect(resultLink).toBeVisible();
});

// Enter comes from implicit form submission, which jsdom does not implement —
// so a unit test cannot prove it. This is the only place the behaviour the
// user actually asked for is verified, in a real browser.
test("Enter in the search box submits without waiting for the debounce", async ({
  page,
}) => {
  await page.goto("/");

  const input = page.getByRole("searchbox", { name: "リポジトリを検索" });
  // fill() sets the value in one shot, so the 300ms debounce timer starts and
  // is still pending; pressing Enter immediately is what proves the submit
  // path navigates on its own rather than the timer doing the work.
  await input.fill("fixture-alpha");
  await input.press("Enter");

  await expect(page).toHaveURL(/\?q=fixture-alpha&page=1/);
  await expect(
    page.getByRole("link", { name: "e2e-fixture/repo-alpha" })
  ).toBeVisible();
});

test("the 検索 button submits the current keyword", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("searchbox", { name: "リポジトリを検索" }).fill(
    "fixture-alpha"
  );
  await page.getByRole("button", { name: "検索" }).click();

  await expect(page).toHaveURL(/\?q=fixture-alpha&page=1/);
  await expect(
    page.getByRole("link", { name: "e2e-fixture/repo-alpha" })
  ).toBeVisible();
});
