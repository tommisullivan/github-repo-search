import { buildCsp, staticSecurityHeaders } from "./csp";

// SEC-01. The one non-negotiable, pinned by name so a future loosening fails
// a named test rather than slipping through review: script-src never contains
// 'unsafe-inline' — not in production, not in development, not under any
// style-src fallback (the D4-06 ladder is scoped to styles only; T-04-10).

/**
 * Extract a single directive from the policy string. Asserting on the
 * extracted directive rather than the whole policy matters for the
 * unsafe-inline tests: a style-src fallback may legitimately differ from
 * script-src, and a whole-string assertion would conflate the two.
 */
function directive(policy: string, name: string): string {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  if (!found) {
    throw new Error(`directive "${name}" missing from policy: ${policy}`);
  }
  return found;
}

describe("buildCsp — production", () => {
  const policy = buildCsp("abc", false);

  it("script-src carries the per-request nonce and 'strict-dynamic'", () => {
    const scriptSrc = directive(policy, "script-src");
    expect(scriptSrc).toContain("'nonce-abc'");
    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  it("the whole policy never contains 'unsafe-eval'", () => {
    // 'unsafe-eval' is the dev-only concession (React reconstructs server
    // error stacks with eval in development). Production must not carry it.
    expect(policy).not.toContain("unsafe-eval");
  });

  it("script-src never contains 'unsafe-inline'", () => {
    expect(directive(policy, "script-src")).not.toContain("unsafe-inline");
  });

  it("style-src is the nonce + scoped-hash form (D4-06 ladder rung 2)", () => {
    // Pinned exactly. Rung 1 (`'self' 'nonce-…'`) was measured against the
    // production build and blocked next/image's `style="color:transparent"`
    // attribute on the detail view ("directive=style-src-attr
    // blocked=inline"); attributes cannot carry a nonce, so the measured
    // step is 'unsafe-hashes' + the sha256 of that one declaration. Rung 3
    // ('unsafe-inline') was not needed and stays rejected.
    expect(directive(policy, "style-src")).toBe(
      "style-src 'self' 'nonce-abc' 'unsafe-hashes' 'sha256-zlqnbDt84zf1iSefLU/ImC54isoprH/MRiVZGskwexk='"
    );
  });

  it("style-src never contains 'unsafe-inline' either — the ladder stopped at rung 2", () => {
    expect(directive(policy, "style-src")).not.toContain("unsafe-inline");
  });

  it("locks down the baseline directives", () => {
    expect(directive(policy, "default-src")).toBe("default-src 'self'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'self'");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
    expect(directive(policy, "frame-ancestors")).toBe(
      "frame-ancestors 'none'"
    );
  });

  it("img-src covers self, data:, and GitHub's avatar host", () => {
    const imgSrc = directive(policy, "img-src");
    expect(imgSrc).toContain("'self'");
    expect(imgSrc).toContain("data:");
    expect(imgSrc).toContain("https://avatars.githubusercontent.com");
  });
});

describe("buildCsp — development", () => {
  const dev = buildCsp("abc", true);
  const prod = buildCsp("abc", false);

  it("script-src additionally contains 'unsafe-eval'", () => {
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
  });

  it("script-src still never contains 'unsafe-inline'", () => {
    expect(directive(dev, "script-src")).not.toContain("unsafe-inline");
  });

  it("differs from production only in the script-src directive", () => {
    const stripScriptSrc = (policy: string) =>
      policy
        .split(";")
        .map((part) => part.trim())
        .filter((part) => !part.startsWith("script-src"));
    expect(stripScriptSrc(dev)).toEqual(stripScriptSrc(prod));
  });
});

describe("buildCsp — nonce handling", () => {
  it("two calls with different nonces produce different policies", () => {
    const first = buildCsp("nonce-one", false);
    const second = buildCsp("nonce-two", false);
    expect(first).not.toBe(second);
    expect(directive(first, "script-src")).toContain("'nonce-nonce-one'");
    expect(directive(second, "script-src")).toContain("'nonce-nonce-two'");
    // The nonce is really per-call, not captured at module load: neither
    // policy may carry the other's nonce.
    expect(first).not.toContain("nonce-two");
    expect(second).not.toContain("nonce-one");
  });
});

describe("staticSecurityHeaders", () => {
  it("carries exactly the four per-deployment constants (D4-07)", () => {
    expect(staticSecurityHeaders).toEqual([
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      },
    ]);
  });

  it("does not include the CSP — that lives in the proxy (per-request nonce)", () => {
    expect(
      staticSecurityHeaders.some(
        (header) => header.key.toLowerCase() === "content-security-policy"
      )
    ).toBe(false);
  });
});
