import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  // a11y specs run as their own job in CI; keep them out of the default E2E run.
  testIgnore: process.env.A11Y === "1" ? [] : ["**/*.a11y.spec.ts"],
  testMatch: process.env.A11Y === "1" ? ["**/*.a11y.spec.ts"] : undefined,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI builds once in its own job and shares `.next` as an artifact, so the test jobs
    // serve it directly. Locally there is no artifact, so build first.
    command:
      process.env.PLAYWRIGHT_PREBUILT === "1"
        ? `npx next start --port ${PORT}`
        : `npm run build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
