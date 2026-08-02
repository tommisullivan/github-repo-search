import { expect, test, type Page } from "@playwright/test";

// SEC-01: prove the security headers against the production build — the same
// mocked webServer as the journey spec, so these runs measure `next start`,
// not `next dev`. That distinction is the whole point: the dev-only
// 'unsafe-eval' concession must be absent here, and docs/SECURITY.md warns
// that an undriven CSP is "a policy that looks strict but is not". Every
// assertion below is the driving.
//
// Header source split (D4-07): the CSP comes from `src/proxy.ts` (per-request
// nonce); the four static headers come from `next.config.ts` `headers()`.

const SEARCH_PATH = "/?q=fixture-alpha";
const DETAIL_PATH = "/repos/e2e-fixture/repo-alpha";

function extractDirective(policy: string, name: string): string {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  if (!found) {
    throw new Error(`directive "${name}" missing from policy: ${policy}`);
  }
  return found;
}

function extractNonce(policy: string): string {
  const match = /'nonce-([^']+)'/.exec(policy);
  if (!match) {
    throw new Error(`no nonce found in policy: ${policy}`);
  }
  return match[1];
}

/**
 * Arm a page with every CSP-violation listener a browser offers, BEFORE any
 * navigation:
 * - a `securitypolicyviolation` document listener via an init script (init
 *   scripts run through CDP, outside the page's CSP, so the collector itself
 *   cannot be blocked by the policy it observes),
 * - `pageerror` for exceptions thrown during hydration,
 * - console messages carrying Chromium's CSP report text ("Refused to …").
 *
 * Returns a drain function producing every collected report verbatim.
 */
async function armViolationCollector(
  page: Page
): Promise<() => Promise<string[]>> {
  const collected: string[] = [];
  page.on("pageerror", (error) => {
    collected.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("Content Security Policy") || text.includes("Refused to")) {
      collected.push(`console(${message.type()}): ${text}`);
    }
  });
  await page.addInitScript(() => {
    const holder = window as unknown as { __cspViolations: string[] };
    holder.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      holder.__cspViolations.push(
        `securitypolicyviolation: directive=${event.violatedDirective} blocked=${event.blockedURI} source=${event.sourceFile ?? "-"}:${event.lineNumber ?? "-"}`
      );
    });
  });
  return async () => {
    const inPage = await page.evaluate(
      () => (window as unknown as { __cspViolations: string[] }).__cspViolations
    );
    return [...collected, ...inPage];
  };
}

for (const [name, path] of [
  ["search view", SEARCH_PATH],
  ["detail view", DETAIL_PATH],
] as const) {
  test(`the ${name} response carries the CSP and the static security headers`, async ({
    page,
  }) => {
    const response = await page.goto(path);
    expect(response).not.toBeNull();
    const headers = response!.headers();

    // 1. The CSP, with a per-request nonce and 'strict-dynamic' — and never
    // 'unsafe-inline' in script-src. 'unsafe-eval' must be absent from the
    // whole policy: this is the production build, and that directive is the
    // dev-only concession.
    const policy = headers["content-security-policy"];
    expect(policy).toBeDefined();
    const scriptSrc = extractDirective(policy, "script-src");
    expect(scriptSrc).toContain("'nonce-");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");

    // 2. The static headers from next.config.ts, exact configured values.
    // HSTS is asserted present but is HTTP-meaningless locally: browsers only
    // honour Strict-Transport-Security on HTTPS responses, so on this plain-
    // HTTP localhost server the header ships inertly and binds on deployment.
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains"
    );
    expect(extractDirective(policy, "frame-ancestors")).toBe(
      "frame-ancestors 'none'"
    );
  });
}

test("the nonce is generated per request, not per deployment", async ({
  request,
}) => {
  const first = await request.get(SEARCH_PATH);
  const second = await request.get(SEARCH_PATH);
  const firstNonce = extractNonce(first.headers()["content-security-policy"]);
  const secondNonce = extractNonce(second.headers()["content-security-policy"]);
  expect(firstNonce).not.toBe(secondNonce);
});

test("the search view loads, hydrates, and responds to typing with zero CSP violations", async ({
  page,
}) => {
  const drainViolations = await armViolationCollector(page);

  await page.goto(SEARCH_PATH);
  await expect(
    page.getByRole("link", { name: "e2e-fixture/repo-alpha" })
  ).toBeVisible();

  // Interactivity proof: the debounced input drives a client-side
  // router.replace to a new query — that round trip only happens if the
  // page's JavaScript actually executed under the policy, so "zero
  // violations" cannot mean "nothing ran".
  const input = page.getByRole("searchbox", { name: "リポジトリを検索" });
  await input.fill("fixture-empty");
  await expect(page).toHaveURL(/\?q=fixture-empty&page=1/);
  await expect(
    page.getByRole("heading", { name: "該当するリポジトリが見つかりませんでした" })
  ).toBeVisible();

  expect(await drainViolations()).toEqual([]);
});

test("the detail view loads, hydrates, and navigates back with zero CSP violations", async ({
  page,
}) => {
  const drainViolations = await armViolationCollector(page);

  await page.goto(DETAIL_PATH);
  await expect(
    page.getByRole("heading", { level: 1, name: "repo-alpha" })
  ).toBeVisible();

  // Interactivity proof for this view: the back link (cold visit → "/").
  await page.getByRole("link", { name: "戻る" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("searchbox", { name: "リポジトリを検索" })
  ).toBeVisible();

  expect(await drainViolations()).toEqual([]);
});

test("the static /_not-found page renders its content under the CSP (D4-08 measurement)", async ({
  page,
}, testInfo) => {
  // D4-08: the global 404 is statically prerendered at build time, when no
  // request exists — so it cannot carry a nonce, and its inline bootstrap
  // scripts are expected to be blocked by this CSP. The disposition is
  // measure-and-record, not assume: the page must still RENDER its content
  // (it is static markup with no interactivity to lose); whether its scripts
  // are blocked is observed and recorded in the annotation below, quoted in
  // the summary and docs/SECURITY.md.
  const drainViolations = await armViolationCollector(page);

  const response = await page.goto("/no-such-top-level-route");
  expect(response!.status()).toBe(404);

  // Next's default global 404 (this app defines no root not-found.tsx —
  // unknown top-level routes are not a designed destination; the designed
  // not-found is the route-level リポジトリが見つかりません page, which lives
  // inside a dynamic route and receives a nonce normally).
  await expect(page.getByText("404")).toBeVisible();
  await expect(page.getByText("This page could not be found.")).toBeVisible();

  const violations = await drainViolations();
  testInfo.annotations.push({
    type: "d4-08-measurement",
    description:
      violations.length === 0
        ? "no CSP violations on the static /_not-found"
        : `${violations.length} report(s): ${violations.join(" || ")}`,
  });
});
