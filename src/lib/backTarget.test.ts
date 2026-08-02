import { describe, expect, it } from "vitest";

import { resolveBackTarget } from "./backTarget";

/**
 * Tests for the back-target guard used by the detail route.
 *
 * The guard mirrors `SITE_RELATIVE_PATH` in `src/lib/github/client.ts`:
 * a URL is accepted only when it begins with a single `/` and its second
 * character is neither `/` nor `\`. Both characters must be rejected —
 * the WHATWG URL parser normalises `\` to `/` inside a special scheme,
 * so `/\evil.example.com/x` resolves to `/evil.example.com/x`. That trap
 * lives in `client.ts` for outbound URLs; it lives here for inbound query
 * params for the same reason.
 *
 * Each row of the table below names the case in English so a CI log alone
 * tells a reader which form regressed.
 */
describe("resolveBackTarget", () => {
  it.each([
    ["undefined", undefined, "/"],
    ["empty string", "", "/"],
    ["an array (query params can be either)", ["/x", "/y"], "/"],
    ["a single-element array", ["/only"], "/"],
    ["the root path itself", "/", "/"],
    // The primary success case. Phase 2 links back with `?q=foo&page=2`.
    ["a site-relative path with query", "/?q=next&page=2", "/?q=next&page=2"],
    ["a nested internal path", "/repos/foo/bar", "/repos/foo/bar"],
    // Origin hijacks — each rejected form matters. `//host` is the classic
    // protocol-relative attack; `/\host` is the WHATWG-URL-parser trap.
    ["a protocol-relative URL", "//evil.example.com", "/"],
    ["a backslash-then-host trap", "/\\evil.example.com", "/"],
    // Leading backslash — not site-relative at all.
    ["a leading backslash", "\\host", "/"],
    // Absolute URLs of any scheme.
    ["an absolute https URL", "https://evil.example.com", "/"],
    ["an absolute http URL", "http://evil.example.com", "/"],
    // A javascript: URL used with an anchor's href would be an XSS if rendered.
    ["a javascript: URL", "javascript:alert(1)", "/"],
    // Fragments/queries that do not start with `/` are not internal paths.
    ["a bare fragment", "#top", "/"],
    ["a bare query string", "?q=x", "/"],
  ])(
    "returns %s for %s",
    (_label, input: string | string[] | undefined, expected: string) => {
      expect(resolveBackTarget(input)).toBe(expected);
    }
  );
});
