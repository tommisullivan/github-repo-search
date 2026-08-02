# Plan 04-03 — Summary

**Completed:** 2026-08-02
**Requirements closed:** SEC-01

## What shipped

### `src/lib/csp.ts` (+ `src/lib/csp.test.ts`, TDD)

The pure policy builder `buildCsp(nonce: string, isDev: boolean): string` and the `staticSecurityHeaders` list — the single source of truth for every security response header. Written test-first: the failing contract landed in its own commit before the implementation.

The exact production CSP shipped (`{nonce}` fresh per request):

```
default-src 'self'; script-src 'self' 'nonce-{nonce}' 'strict-dynamic'; style-src 'self' 'nonce-{nonce}' 'unsafe-hashes' 'sha256-zlqnbDt84zf1iSefLU/ImC54isoprH/MRiVZGskwexk='; img-src 'self' data: https://avatars.githubusercontent.com; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

Development differs in exactly one directive: `script-src` gains `'unsafe-eval'` (React reconstructs server error stacks with `eval` in dev). 17 unit tests pin the shape, including the two named non-negotiables: `script-src` never contains `'unsafe-inline'` (prod, dev, any rung), and `style-src` stopped at ladder rung 2 without `'unsafe-inline'`.

No `connect-src` for `api.github.com` was added, and measurement confirmed none is needed — all GitHub traffic is server-side.

### `src/proxy.ts` (+ `src/proxy.test.ts`)

Next 16's proxy convention (middleware, renamed — implemented from `node_modules/next/dist/docs`, not training memory). Generates the per-request nonce (`Buffer.from(crypto.randomUUID()).toString("base64")`), sets the CSP on **both** the response headers and the forwarded request headers plus `x-nonce`, and exports the documented matcher (skips `api`, `_next/static`, `_next/image`, `favicon.ico`, and prefetches).

**Proxy coverage took the direct-unit-test path, not the delegation+exclude path.** `NextRequest` constructs cleanly under Vitest/jsdom on Node 24. The test reads forwarded request headers through Next's own transport — `NextResponse.next({ request })` encodes them onto the response as `x-middleware-request-{name}` (next/dist/server/web/spec-extension/response.js) — and asserts the response CSP nonce equals the forwarded `x-nonce`, that no `unsafe-inline`/`unsafe-eval` appears outside dev, and that the nonce is fresh per call.

### `next.config.ts`

Gains `async headers()` for `/(.*)`, importing `staticSecurityHeaders` from `src/lib/csp.ts` (imported, not mirrored): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`. Comments record why the CSP is *not* here (a static header cannot carry a per-request nonce — D4-07) and that HSTS is inert on plain HTTP. `images.remotePatterns` untouched.

### `e2e/security-headers.spec.ts`

Six tests against the production build via the mocked webServer from 04-01:

- Both views: CSP present; `script-src` has `'nonce-` + `'strict-dynamic'`, no `'unsafe-inline'`; whole policy has no `'unsafe-eval'`; all four static headers with exact values.
- Nonce differs between two requests to the same URL.
- Zero-CSP-violation loads with the collector armed **before** navigation (`securitypolicyviolation` document listener via init script — init scripts run over CDP, outside the page's CSP — plus `pageerror` and CSP-text console messages), and a real interaction per view so "no violations" cannot mean "nothing executed": typing `fixture-empty` drives the debounced client-side navigation to the empty state; the detail back link navigates to `/`.
- The static `/_not-found` measurement (D4-08), disposition annotated in the test report.

### `docs/SECURITY.md`

§ Response headers rewritten from the "Phase 4" plan table to the shipped, measured policy: the exact CSP string, the proxy/`headers()` split with reasons, the measured style-src concession with the violation that forced it, the `/_not-found` disposition, and the rejected alternatives (headers()-only CSP — cannot carry a nonce, requires `unsafe-inline`; experimental SRI — experimental flag in a production-graded submission). Status line no longer says "specified for later phases". No other section touched.

## The style-src ladder landed on rung 2 — forced by this measurement

Rung 1 (`style-src 'self' 'nonce-…'`) was driven first and failed on the detail view. Verbatim, from the failing run:

```
console(error): Applying inline style violates the following Content Security Policy directive 'style-src 'self' 'nonce-M2EwYzhhMmQtMGY2My00MGIxLTg1YmQtYTY1Yzc0NGI3MGI1''. Either the 'unsafe-inline' keyword, a hash ('sha256-zlqnbDt84zf1iSefLU/ImC54isoprH/MRiVZGskwexk='), or a nonce ('nonce-...') is required to enable inline execution. Note that hashes do not apply to event handlers, style attributes and javascript: navigations unless the 'unsafe-hashes' keyword is present. The action has been blocked.
securitypolicyviolation: directive=style-src-attr blocked=inline source=http://localhost:3100/repos/e2e-fixture/repo-alpha:1
```

This is exactly the risk D4-06 named: `next/image` renders `style="color:transparent"` on the avatar (only `RepoDetail.tsx` uses `next/image` — the search view measured clean, which matches `ResultList.tsx` containing no `next/image`). A style *attribute* cannot carry a nonce, so rung 2 adds `'unsafe-hashes'` plus the sha256 of that one declaration. The hash was verified independently (`echo -n "color:transparent" | openssl dgst -sha256 -binary | base64` → `zlqnbDt84zf1iSefLU/ImC54isoprH/MRiVZGskwexk=`), matching the browser's prescription. After the step: zero violations on both views. **Rung 3 (styles-only `'unsafe-inline'`) was not needed. `script-src` was never touched (T-04-10).**

## The `/_not-found` disposition (D4-08): measured, accepted, recorded

Driving `/no-such-top-level-route` on the production server: HTTP 404, and the default static 404 content ("404 / This page could not be found.") renders completely — but, having been prerendered at build time when no nonce existed, its entire bootstrap is blocked by the CSP. The measurement (40 reports, recorded verbatim in the test's `d4-08-measurement` annotation) breaks down as:

- 8× `script-src-elem` — static chunk loads blocked (under `'strict-dynamic'`, parser-inserted scripts without a nonce are refused), plus repeats on retry
- 6× `script-src-elem blocked=inline` — the page's inline bootstrap scripts
- 1× `style-src-elem blocked=inline` + 5× `style-src-attr blocked=inline` — the default 404's own inline styles

**Disposition: accept and record.** The page is static markup with no interactivity to lose; its content renders fully. Forcing it dynamic would buy nothing user-visible. The app defines no root `not-found.tsx` because unknown top-level routes are not a designed destination — the designed not-found (リポジトリが見つかりません) lives inside the dynamic detail route, receives its nonce normally, and is proven violation-free by `e2e/search-detail.spec.ts` plus the a11y suite.

## Commits

| Commit | Subject |
|---|---|
| `585c101` | test(04-03): pin the CSP builder contract before implementation (TDD red) |
| `2a7646d` | feat(04-03): implement the nonce-based CSP builder and static header list (TDD green) |
| `f8a11ff` | feat(04-03): apply the CSP via the Next 16 proxy and ship the static security headers |
| `dd7259b` | test(04-03): measure the CSP against the production build and step style-src to the scoped hash |
| `5e73e25` | docs(04-03): record the shipped, measured security headers in SECURITY.md |

## Verification

Ran in this session on Node 24.18.1, final state:

- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm test` — 200 passed / 200 (includes the 17 csp/proxy tests).
- `npm run build` — compiled; route table shows `ƒ /`, `○ /_not-found`, `ƒ /repos/[owner]/[repo]`, and `ƒ Proxy (Middleware)`.
- `npm run test:e2e` — 17 passed / 17 (security-headers spec included).
- `npm run test:a11y` — 7 passed / 7 (existing + 04-02's per-state specs, all green under the CSP).

## Deviations from plan

None of substance. Two observations worth recording:

1. **One transient a11y failure during a mid-session `npm run test:a11y`** (2 tests in `e2e/repo-detail.a11y.spec.ts` — a file owned by plan 04-02, executing in parallel in the same tree). Re-run against the same CSP-carrying build: both pass, and the full suite passes. The failure was a race with 04-02's concurrent edits during that run's rebuild, not a CSP effect. No file owned by 04-02 was touched.
2. **`PLAYWRIGHT_PREBUILT=1` serves a stale proxy.** The proxy compiles into `.next`, so after changing `src/lib/csp.ts` the E2E run must rebuild — one intermediate run measured the old policy until rebuilt. Worth knowing for CI debugging: the CI flow builds once per pipeline, so it cannot hit this; only local reuse can.

## Caveats

- The `'sha256-…'` hash in style-src pins the exact string `color:transparent`. If a Next upgrade changes the inline declaration `next/image` emits, the E2E zero-violation test fails loudly and the hash must be re-measured — that is the designed failure mode, not an accident.
- HSTS is asserted present in E2E but is inert on plain-HTTP localhost (browsers only honour it over HTTPS); it binds on real deployment. Recorded in the spec and `docs/SECURITY.md`.
