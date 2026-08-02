import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Providing `env` to webServer replaces the default inheritance of the whole
// process environment, so spread it back in — minus `undefined` values, which
// the `{ [key: string]: string }` type (correctly) refuses.
const inheritedEnv: { [key: string]: string } = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) {
    inheritedEnv[key] = value;
  }
}

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
    // Activates the server-side GitHub API mock (src/instrumentation.ts) at
    // `next start` time, for both the local build-and-start path and the CI
    // PLAYWRIGHT_PREBUILT path — the flag matters at runtime, not build time,
    // so the CI build job stays flag-free. No spec ever hits the live API.
    env: { ...inheritedEnv, E2E_GITHUB_MOCK: "1" },
  },
});
