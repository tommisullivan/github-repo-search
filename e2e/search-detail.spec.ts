import { expect, test } from "@playwright/test";

// TEST-03: the journey no lower test layer can prove — a real browser against a
// real production build, search → results → detail route → back with the search
// intact.
//
// The GitHub API is mocked **server-side**: every GitHub call in this app happens
// in Server Components, so `page.route()` would never see it. Instead the
// Playwright webServer starts `next start` with `E2E_GITHUB_MOCK=1`, and
// `src/instrumentation.ts` wraps the server's `globalThis.fetch`
// (`src/lib/e2e/githubApiMock.ts`). Every assertion below pins a sentinel value
// only the fixtures in `src/lib/e2e/fixtures.ts` can produce — owner
// `e2e-fixture`, stars 12,345, watchers 678 — so a silently-broken mock fails
// these tests instead of passing against live data. An unmatched api.github.com
// request gets a sentinel 500, so no run can quietly hit the live API.

test("search → detail → back keeps the keyword and page intact", async ({
  page,
}) => {
  // URL is state by design (SRCH-03) — arriving with `?q=` set is a legitimate
  // entry point, and the journey's real interactions are the two clicks below.
  await page.goto("/?q=fixture-alpha");

  const resultLink = page.getByRole("link", { name: "e2e-fixture/repo-alpha" });
  await expect(resultLink).toBeVisible();
  await resultLink.click();

  // The detail view is a page with its own route (DTL-01), carrying `?from=`.
  await expect(page).toHaveURL(/\/repos\/e2e-fixture\/repo-alpha\?from=/);

  await expect(
    page.getByRole("heading", { level: 1, name: "repo-alpha" })
  ).toBeVisible();

  // Avatar asserted by role and Japanese alt text, never by loaded pixels —
  // the fixture PNG is a 1×1 placeholder (D4-04).
  await expect(
    page.getByRole("img", { name: "e2e-fixture のアバター" })
  ).toBeVisible();

  // The four counters, scoped to the stats region and pinned to sentinels.
  // 678 is the value only `subscribers_count` can supply: the fixture sets
  // `watchers_count` equal to stars (12,345) — GitHub's real REST duplication —
  // so a page rendering 678 has proven the watchers-trap mapping end to end.
  const stats = page.getByRole("region", { name: "リポジトリ統計" });
  await expect(stats.getByText("12,345", { exact: true })).toBeVisible(); // stars
  await expect(stats.getByText("678", { exact: true })).toBeVisible(); // watchers
  await expect(stats.getByText("234", { exact: true })).toBeVisible(); // forks
  await expect(stats.getByText("56", { exact: true })).toBeVisible(); // open issues

  await page.getByRole("link", { name: "戻る" }).click();

  // SRCH-03/DTL-05 at the E2E layer: both the keyword AND the page number
  // round-trip through the detail view, not merely a landing on `/`.
  await expect(page).toHaveURL(/\?q=fixture-alpha&page=1/);
  await expect(resultLink).toBeVisible();
});

test("a detail URL opened cold renders and falls back to / for the back link", async ({
  page,
}) => {
  // DTL-04: no search ran first, no `?from=` — exactly one GitHub read.
  await page.goto("/repos/e2e-fixture/repo-alpha");

  await expect(
    page.getByRole("heading", { level: 1, name: "repo-alpha" })
  ).toBeVisible();

  const stats = page.getByRole("region", { name: "リポジトリ統計" });
  await expect(stats.getByText("678", { exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "戻る" })).toHaveAttribute(
    "href",
    "/"
  );
});

test("a rate limit renders as a rate-limit state, never as no results", async ({
  page,
}) => {
  await page.goto("/?q=fixture-ratelimit");

  // The fixture 403 carries x-ratelimit-remaining: 0 and a far-future reset,
  // so the panel renders its "retry later" copy deterministically. Assert the
  // state, never the minute count.
  await expect(
    page.getByRole("heading", { name: "アクセス制限中" })
  ).toBeVisible();

  // The single most misleading failure this app could produce is a rate limit
  // dressed as an empty result list — prove the empty-state copy is absent.
  await expect(
    page.getByText("該当するリポジトリが見つかりませんでした")
  ).toHaveCount(0);
});

test("an unknown repository shows the not-found page", async ({ page }) => {
  await page.goto("/repos/e2e-fixture/no-such-repo");

  await expect(
    page.getByRole("heading", { level: 1, name: "リポジトリが見つかりません" })
  ).toBeVisible();
});

test("pagination reaches page 2 of the fixture set through the mock", async ({
  page,
}) => {
  await page.goto("/?q=fixture-alpha");

  await page.getByRole("link", { name: "次へ" }).click();

  await expect(page).toHaveURL(/\?q=fixture-alpha&page=2/);

  // The fixture set is 25 results — 20 on page 1, 5 on page 2 — so page 2 is
  // the shorter tail, and its first item is a name only the fixture defines.
  await expect(
    page.getByRole("link", { name: "e2e-fixture/repo-filler-20" })
  ).toBeVisible();
  await expect(page.getByText("全 25 件中 21〜25 件")).toBeVisible();
});
