import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

// The proxy is the application shell around the tested policy builder
// (src/lib/csp.ts). What is worth testing here is the wiring the builder
// cannot see: that one request yields one nonce, present in BOTH the response
// CSP header (browser-enforced) and the forwarded request headers (what
// Next's renderer reads to stamp its scripts), and that the nonce really
// varies per request.
//
// Reading forwarded request headers: `NextResponse.next({ request })` encodes
// them onto the response as `x-middleware-override-headers` plus one
// `x-middleware-request-{name}` entry each (next/dist/server/web/
// spec-extension/response.js) — that is Next's own transport for "make these
// headers available upstream", so the test reads the proxy's real output
// rather than a mock's.

function extractNonce(policy: string): string {
  const match = /'nonce-([^']+)'/.exec(policy);
  if (!match) {
    throw new Error(`no nonce found in policy: ${policy}`);
  }
  return match[1];
}

describe("proxy", () => {
  it("sets a nonce-based CSP on the response, matching the forwarded x-nonce", () => {
    const response = proxy(new NextRequest("http://localhost:3100/"));

    const policy = response.headers.get("Content-Security-Policy");
    expect(policy).not.toBeNull();

    const nonce = extractNonce(policy as string);
    expect(policy).toContain(`'nonce-${nonce}'`);
    expect(policy).toContain("'strict-dynamic'");

    // The renderer-facing side of the contract: the same nonce is forwarded
    // as `x-nonce`, and the same policy is forwarded so Next can parse the
    // nonce out of it during rendering.
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(
      response.headers.get("x-middleware-request-content-security-policy")
    ).toBe(policy);
  });

  it("never emits 'unsafe-inline' in script-src, and no 'unsafe-eval' outside development", () => {
    // NODE_ENV is "test" under Vitest — not "development" — so this asserts
    // the production-shaped branch of the NODE_ENV switch.
    const response = proxy(new NextRequest("http://localhost:3100/"));
    const policy = response.headers.get("Content-Security-Policy") as string;

    const scriptSrc = policy
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("generates a fresh nonce per request", () => {
    const first = proxy(new NextRequest("http://localhost:3100/"));
    const second = proxy(new NextRequest("http://localhost:3100/"));

    const firstNonce = extractNonce(
      first.headers.get("Content-Security-Policy") as string
    );
    const secondNonce = extractNonce(
      second.headers.get("Content-Security-Policy") as string
    );
    expect(firstNonce).not.toBe(secondNonce);
  });
});

describe("proxy matcher config", () => {
  it("skips static assets, the image optimizer, and prefetches", () => {
    expect(config.matcher).toHaveLength(1);
    const [rule] = config.matcher;
    for (const excluded of ["_next/static", "_next/image", "favicon.ico"]) {
      expect(rule.source).toContain(excluded);
    }
    expect(rule.missing).toContainEqual({
      type: "header",
      key: "purpose",
      value: "prefetch",
    });
  });
});
