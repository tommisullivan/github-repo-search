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

  // Stop 2: exactly one Tab from the input reaches the first result link —
  // no intermediate stops between the input and the results.
  await page.keyboard.press("Tab");
  await expect(resultLink).toBeFocused();

  // Enter follows the link to the detail route, carrying ?from=.
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/repos\/e2e-fixture\/repo-alpha\?from=/);
  await expect(
    page.getByRole("heading", { level: 1, name: "repo-alpha" })
  ).toBeVisible();

  // Stop 3: on the detail page the first Tab reaches the 戻る link — the
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
