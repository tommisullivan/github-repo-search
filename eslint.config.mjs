import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated test artifacts — not source.
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),

  // ---------------------------------------------------------------------------
  // Rules that were previously enforced by review only.
  //
  // `docs/SECURITY.md` banned `dangerouslySetInnerHTML` with the note "enforced
  // by review", and the boundary table in `docs/ARCHITECTURE.md` calls itself "a
  // code-review checklist, not decoration". Review does not run in CI. Each rule
  // below is proven to fire by `src/eslint-rules.test.ts`, which lints a real
  // snippet through this config — a rule whose selector matches nothing passes
  // every config-file grep while protecting nothing, which is worse than no rule
  // because it reads as covered.
  // ---------------------------------------------------------------------------

  {
    name: "project/no-dangerously-set-inner-html",
    rules: {
      // SEC-03 / T-01-18. Global on purpose: there is no directory in this app
      // where injecting raw HTML is legitimate, and the one that gets it wrong
      // will be a component nobody thought to scope a rule to.
      "no-restricted-syntax": [
        "error",
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message:
            "dangerouslySetInnerHTML is banned in this repository — see docs/SECURITY.md. GitHub descriptions and repository names are untrusted input; render them as text.",
        },
      ],
    },
  },

  {
    name: "project/search-unit-boundary",
    files: ["src/lib/github/search.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "./repo",
              message:
                "The two capability units are independent by design — see the boundary table in docs/ARCHITECTURE.md. search.ts must not know the detail endpoint's shape.",
            },
            {
              name: "@/lib/github/repo",
              message:
                "The two capability units are independent by design — see the boundary table in docs/ARCHITECTURE.md. search.ts must not know the detail endpoint's shape.",
            },
          ],
        },
      ],
    },
  },

  {
    name: "project/repo-unit-boundary",
    files: ["src/lib/github/repo.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "./search",
              message:
                "The two capability units are independent by design — see the boundary table in docs/ARCHITECTURE.md. A detail URL opened cold must work on one read, with no search behind it.",
            },
            {
              name: "@/lib/github/search",
              message:
                "The two capability units are independent by design — see the boundary table in docs/ARCHITECTURE.md. A detail URL opened cold must work on one read, with no search behind it.",
            },
          ],
        },
      ],
    },
  },

  {
    name: "project/presentation-layer-boundary",
    files: ["src/components/**", "src/app/**"],
    rules: {
      // T-01-19. Calling githubFetch from a route or component bypasses the
      // units' guards — the blank-query check, the 1000-result page ceiling, and
      // the subscribers_count correction — and spends quota on a request that
      // could only ever 422.
      //
      // `@/lib/github/errors` is deliberately NOT restricted. Phase 2 needs
      // `GitHubFailure` to render its states, and a rule that blocks legitimate
      // work does not get narrowed by whoever it blocks — it gets deleted in
      // full, taking the `client` restriction with it. A future phase that needs
      // to widen this should widen it deliberately; there is a test asserting
      // the `errors` import still passes, so removing this comment's premise
      // fails a test rather than passing silently.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/github/client",
              message:
                "Routes and components call searchRepositories() or getRepository(), never githubFetch directly — see the boundary table in docs/ARCHITECTURE.md. The units own the guards; the client owns transport.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
