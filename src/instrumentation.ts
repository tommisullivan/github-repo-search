/**
 * Next.js instrumentation hook — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`.
 *
 * `register()` runs once when a Next server instance starts, before it serves
 * requests. Its only job here is to install the E2E GitHub API mock
 * (`src/lib/e2e/githubApiMock.ts`), and only behind a double gate:
 *
 * - `NEXT_RUNTIME === "nodejs"` — the mock wraps the Node server's
 *   `globalThis.fetch`; it has no business in the edge runtime.
 * - `E2E_GITHUB_MOCK === "1"` — set exclusively by the Playwright `webServer`
 *   in `playwright.config.ts`. `npm run dev`, `npm run build`, and production
 *   `next start` never set it, so outside E2E this function is a no-op and
 *   behaviour is byte-identical to a build without this file (T-04-01).
 *
 * The import is dynamic so the mock and its fixtures are not even loaded
 * unless the flag is set.
 */
export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.E2E_GITHUB_MOCK === "1"
  ) {
    const { installGitHubApiMock } = await import("./lib/e2e/githubApiMock");
    installGitHubApiMock();
  }
}
