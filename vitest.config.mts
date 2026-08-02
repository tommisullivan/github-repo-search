import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // `skipFull: false` must be set as a PER-REPORTER option, not top-level.
      // Root cause of the "empty per-file table" defect (Phase 1 deferred item D-1):
      // when run under an AI agent (std-env's isAgent — Claude Code sets CLAUDECODE=1),
      // Vitest 4 silently injects `skipFull: true` into the text reporter's per-reporter
      // options ("default to skipFull ... on agents" in vitest's config resolution) and
      // appends a text-summary reporter. istanbul's text reporter then drops every row
      // with 100% stmts/branch/funcs/lines — in Phase 1 that was ALL files, hence a
      // fully empty table. The top-level `--coverage.skipFull=false` flag cannot fix it
      // because per-reporter options spread last in the provider and win; an explicit
      // per-reporter option spreads over the injected default and restores the rows.
      reporter: [["text", { skipFull: false }], "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      // Must cover every pattern in `include` above — a *.spec file left out here would be
      // collected as a test AND counted as covered source, inflating the number.
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/app/layout.tsx",
        "**/*.d.ts",
        // The E2E GitHub API mock and the instrumentation hook that installs it
        // are exercised by Playwright against the running server, not by Vitest.
        // Counting them as uncovered source would distort the TEST-04 thresholds,
        // and jsdom unit tests for a Playwright-only fixture server would be
        // coverage theatre (D4-03).
        "src/instrumentation.ts",
        "src/lib/e2e/**",
      ],
      // Raised as real code lands — see .planning/ROADMAP.md Phase 4 (TEST-04).
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
});
