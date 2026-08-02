/**
 * `resolveBackTarget()` — the inbound mirror of `client.ts`'s outbound origin
 * defence.
 *
 * The detail route reads a `?from=` query param so a user's search keyword and
 * page survive a round trip through the detail page. That param is untrusted
 * input: it reaches the DOM as the `href` of a `<Link>`, and a `//host` or a
 * `javascript:` value there would hijack the back button. This helper collapses
 * every unsafe form to the fallback `"/"`.
 *
 * The check is a strict mirror of `SITE_RELATIVE_PATH` in
 * `src/lib/github/client.ts` (measured in Node 24.18.1 during Phase 1):
 *
 *     new URL("/\\evil.example.com/x", "https://…").pathname === "/evil.example.com/x"
 *
 * The WHATWG URL parser treats `\` as `/` inside a special scheme, so the
 * "site-relative" form `/\host` resolves to `/host` and a caller who trusted
 * only the leading `/` would ship a router hijack. The regex rejects both
 * characters at the second position — one character for one character with
 * the outbound guard, deliberately.
 *
 * The raw string is checked, never the URL-decoded form. That is a
 * requirement, not an oversight: the sentinel character `\` cannot be smuggled
 * through `encodeURIComponent` unless it is double-encoded, and running the
 * check on the raw string means a `%5C` reads as literal characters, not as
 * `\`.
 */

/** Two-character site-relative form — a leading `/` followed by anything that
 *  cannot start another authority. See file header. */
const SITE_RELATIVE_PATH = /^\/[^/\\]/;

/** The safe fallback. Used for every rejected input and for the root itself. */
const FALLBACK = "/";

/**
 * Returns `from` unchanged when it is a safe site-relative path; returns `"/"`
 * for every other shape (undefined, empty, array, absolute URL, protocol- or
 * backslash-relative form, and the `javascript:` scheme).
 *
 * The input type reflects what Next hands you for a query param: a single
 * string, an array of strings, or `undefined` when the key is absent. Nothing
 * else is possible from the framework side, so nothing else is handled.
 */
export function resolveBackTarget(
  from: string | string[] | undefined
): string {
  if (from === undefined) {
    return FALLBACK;
  }

  // A repeated `?from=…&from=…` is not a legitimate back link — dropping to
  // the fallback is safer than picking either arm arbitrarily.
  if (Array.isArray(from)) {
    return FALLBACK;
  }

  if (from === "") {
    return FALLBACK;
  }

  // The root itself is safe but fails the two-character regex, which requires
  // a second character. Special-case it up front rather than weakening the
  // regex to accept a bare `/`, because a weakened regex is a security review
  // finding waiting to happen.
  if (from === "/") {
    return FALLBACK;
  }

  if (!SITE_RELATIVE_PATH.test(from)) {
    return FALLBACK;
  }

  return from;
}
