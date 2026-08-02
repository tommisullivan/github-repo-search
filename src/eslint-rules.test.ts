// @vitest-environment node

/**
 * Proof that the repository's own lint rules fire on the code they forbid — and
 * stay silent on the code they must permit.
 *
 * **Why this file lives here rather than beside its subject.** Colocation is the
 * rule everywhere else in this repository: a test sits next to the module it
 * tests. This test's subject is `eslint.config.mjs` at the repository root, and
 * Vitest's `include` is scoped to `src/**`, so there is no location that is both
 * beside the subject and collected by the runner. `src/` root is the closest
 * honest home, and the alternative — moving the config or widening `include` —
 * would change production configuration to suit a test.
 *
 * **Why a test at all, rather than grepping the config.** `grep -c
 * "no-restricted" eslint.config.mjs` was the previous check and it is worthless:
 * it passes on a rule whose selector matches nothing, which is exactly how a
 * lint rule fails in practice. A rule that never fires is *worse* than no rule,
 * because it reads as covered. The only assertion worth making is that ESLint,
 * running the config that actually ships, reports an error on the forbidden
 * snippet.
 *
 * **Why the negative cases are not padding.** Two tests assert the *absence* of
 * an error: a clean JSX snippet at the same path, and the `errors` type import
 * that Phase 2 needs. Without them a misconfigured `files` glob — one that
 * errors on everything, or one that matches nothing it should — would look
 * exactly like success.
 *
 * The config is the one that ships: `new ESLint()` resolves `eslint.config.mjs`
 * from the working directory. No fixture config, because a fixture would test a
 * file no build ever reads.
 */

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * One instance, reused. Constructing an ESLint instance loads and validates the
 * whole config; doing it per test would multiply that cost by the number of
 * assertions for no added coverage.
 */
const eslint = new ESLint();

/** Severity 2 is an error; 1 is a warning and does not fail `npm run lint`. */
const ERROR = 2;

/**
 * `filePath` need not exist on disk. It is only what ESLint matches config
 * entries' `files` globs against — which is precisely the mechanism under test,
 * since every boundary rule here is scoped by path.
 */
async function errorsFor(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.severity === ERROR);
}

function ruleIds(messages: Awaited<ReturnType<typeof errorsFor>>) {
  return messages.map((message) => message.ruleId ?? "(no rule id)");
}

describe("the environment this file asserts in", () => {
  /**
   * The `@vitest-environment node` docblock at the top of this file is
   * load-bearing: the ESLint Node API wants plain Node, and jsdom buys nothing
   * here. Asserting it makes a silently-ignored directive fail loudly instead of
   * leaving this suite quietly running in the wrong environment.
   */
  it("is node, not jsdom", () => {
    expect(typeof globalThis.window).toBe("undefined");
  });
});

describe("dangerouslySetInnerHTML is banned repo-wide (SEC-03, T-01-18)", () => {
  const DANGER_RULES = ["no-restricted-syntax", "react/no-danger"];

  const DANGEROUS = `export default function Probe() {
  return <p dangerouslySetInnerHTML={{ __html: "x" }} />;
}
`;

  const CLEAN = `export default function Probe() {
  return <p>ok</p>;
}
`;

  it("reports an error on a component using dangerouslySetInnerHTML", async () => {
    const errors = await errorsFor(DANGEROUS, "src/app/rule-probe.tsx");

    expect(
      errors.some(
        (message) =>
          message.ruleId !== null && DANGER_RULES.includes(message.ruleId)
      ),
      `expected one of ${DANGER_RULES.join(" / ")}, got ${ruleIds(errors).join(", ") || "no errors"}`
    ).toBe(true);
  });

  it("reports nothing on the same component without it", async () => {
    // The control. Without this, a rule that errors on every .tsx file at this
    // path would pass the test above and look like working protection.
    const errors = await errorsFor(CLEAN, "src/app/rule-probe.tsx");

    expect(ruleIds(errors)).toEqual([]);
  });
});

describe("the two capability units may not import each other (T-01-17)", () => {
  function isRestrictedImport(ruleId: string | null): boolean {
    // Core `no-restricted-imports` and its `@typescript-eslint/` variant are
    // both acceptable; the assertion is about the rule firing, not about which
    // plugin owns it.
    return ruleId !== null && ruleId.endsWith("no-restricted-imports");
  }

  it("reports an error when search.ts imports repo.ts", async () => {
    const errors = await errorsFor(
      `import { getRepository } from "./repo";\n`,
      "src/lib/github/search.ts"
    );

    expect(
      errors.some((message) => isRestrictedImport(message.ruleId)),
      `expected no-restricted-imports, got ${ruleIds(errors).join(", ") || "no errors"}`
    ).toBe(true);
  });

  it("reports an error when repo.ts imports search.ts", async () => {
    const errors = await errorsFor(
      `import { searchRepositories } from "./search";\n`,
      "src/lib/github/repo.ts"
    );

    expect(
      errors.some((message) => isRestrictedImport(message.ruleId)),
      `expected no-restricted-imports, got ${ruleIds(errors).join(", ") || "no errors"}`
    ).toBe(true);
  });

  it("reports an error when a route imports the client directly", async () => {
    // T-01-19: a component reaching past the units to githubFetch bypasses the
    // query guard, the page ceiling, and the subscribers_count correction.
    const errors = await errorsFor(
      `import { githubFetch } from "@/lib/github/client";\n`,
      "src/app/page.tsx"
    );

    expect(
      errors.some((message) => isRestrictedImport(message.ruleId)),
      `expected no-restricted-imports, got ${ruleIds(errors).join(", ") || "no errors"}`
    ).toBe(true);
  });

  it("permits a route importing the failure types", async () => {
    // The control that keeps the rule alive. Phase 2 needs `GitHubFailure` to
    // render its states; a rule that blocked it would be met as an obstacle and
    // deleted wholesale, taking the `client` restriction with it.
    const errors = await errorsFor(
      `import type { GitHubFailure } from "@/lib/github/errors";\n`,
      "src/app/page.tsx"
    );

    expect(ruleIds(errors)).toEqual([]);
  });
});
