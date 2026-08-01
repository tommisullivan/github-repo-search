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
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      // Must cover every pattern in `include` above — a *.spec file left out here would be
      // collected as a test AND counted as covered source, inflating the number.
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/app/layout.tsx",
        "**/*.d.ts",
      ],
      // Raised as real code lands — see .planning/ROADMAP.md Phase 4 (TEST-04).
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
});
