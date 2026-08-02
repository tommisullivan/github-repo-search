# Security

The threat model for this app and the decisions that follow from it. Reasoning and policy; the code lands in the phases named against each item.

> **Status:** built. Dependency scanning, secret handling, CI gates, the image host allowlist, and the response headers are all shipped; the response headers are additionally measured against the production build by `e2e/security-headers.spec.ts`, not assumed from configuration.

## What there is to protect

Being honest about the attack surface is the first step, and here it is unusually small:

| Asset | Present? | Consequence if compromised |
|---|---|---|
| User accounts, passwords, sessions | **None** | — |
| Personal data | **None** | — |
| Database, persisted state | **None** | — |
| Payment or financial data | **None** | — |
| `GITHUB_TOKEN` (optional) | Yes, server-side only | A leaked read-only token allows API calls against someone's quota. Revocable, low blast radius, but must not leak |
| Source code and CI configuration | Yes | Supply-chain tampering, or exfiltration of CI secrets |

**This is the direct security dividend of the no-auth, no-database decisions.** They were made for scope reasons (see `docs/ARCHITECTURE.md`), but the security consequence is real and worth stating: with no sessions there is no session fixation, no CSRF surface, and no account takeover; with no datastore there is no injection target, no backup to leak, and no data at rest to encrypt. The most effective security control in this app is the code that was never written.

## Attack surface

| Surface | Exposure | Control | Status |
|---|---|---|---|
| Search keyword → GitHub query string | User-controlled text sent upstream | Encode with `URLSearchParams`; never string-concatenate into a URL. Guard empty/whitespace before the request. Not a SQL/command context — the risk is a malformed request, not code execution | Phase 1 |
| `owner` / `repo` route params | User-controlled path segments | `encodeURIComponent` per segment so a crafted value cannot escape the path and address a different endpoint | Phase 1 |
| Rendered GitHub content (names, descriptions) | Third-party text in the DOM | React escapes by default. **`dangerouslySetInnerHTML` is banned in this repo** — there is no legitimate use for it here | **Enforced by lint** (Phase 1) — `no-restricted-syntax` in `eslint.config.mjs`, proven to fire by `src/eslint-rules.test.ts` rather than by the rule's presence in a config file |
| Owner avatar images | Remote images from GitHub | `next/image` requires an explicit `images.remotePatterns` allowlist. Scope it to GitHub's avatar host — not a wildcard | Phase 3 |
| Optional `GITHUB_TOKEN` | Secret in the server environment | See below | Built |
| Dependencies | Transitive supply chain | See below | Built |
| CI workflow | Runs on PRs, holds `GITHUB_TOKEN` | Least-privilege `permissions`, pinned action majors | Built |

## Token handling

The app works fully unauthenticated. A token only raises rate limits.

Rules, already recorded in `AGENTS.md` and enforced by construction:

- **Server-side only.** Read in Server Components and the GitHub client, never in a Client Component. It cannot reach the browser bundle because nothing on the client path reads it.
- **Never `NEXT_PUBLIC_`.** That prefix is what inlines a value into client JavaScript. Using it here would publish the token to every visitor.
- **Never committed.** `.env*` is gitignored; `.env.example` is committed with an empty value and an explanatory comment.
- **Never logged.** Not the value, not a prefix, not the `Authorization` header. Logging is header-selective — see [OPERATIONS.md](./OPERATIONS.md).
- **Least privilege.** A token for this app needs no scopes at all; public repository search and read work with an unscoped token. Do not issue one with `repo` or write access.

Detection, not just discipline: **gitleaks runs in CI** on full history, so a committed secret fails the build rather than sitting in the repo.

### Keeping the real values out of AI tooling

`.env.local` holds the only real secret this project can have, and no AI assistant working in this repository needs to read it — the code reads `process.env.GITHUB_TOKEN`, and whether that variable is set can be verified without seeing its value.

[`.claude/settings.json`](../.claude/settings.json) enforces that rather than relying on good intent:

- **Deny rules** block the file-read tool on `.env`, `.env.local`, `.env.*.local`, and the environment-specific variants. `.env.example` stays readable, since it is a committed template with no values.
- **A pre-execution hook** blocks any shell command referencing those files, closing the obvious hole — a deny rule on reading does nothing about `cat .env`.

Verified against both directions: `cat .env`, `head -5 .env`, `grep TOKEN .env.local`, and a Python one-liner opening `.env` are all blocked; `cat .env.example` and ordinary commands are unaffected.

This is a guardrail, not a security boundary — a determined process could still obfuscate its way around a regex. It is committed to the repository so it applies to anyone working here, not just one machine.

## Response headers

Shipped (Phase 4). Every HTML response carries a nonce-based Content-Security-Policy; every response carries the four static headers below. The headers live in two places, deliberately:

- **The CSP is set per request by [`src/proxy.ts`](../src/proxy.ts)** — Next 16's proxy convention (middleware, renamed). It embeds a fresh nonce on every request, which a static header cannot do; Next parses the nonce out of the CSP header and stamps it onto its framework scripts, bundles, and inline scripts automatically. Policy construction is delegated to the pure builder in [`src/lib/csp.ts`](../src/lib/csp.ts), whose unit tests pin the shape — above all that **`script-src` never contains `'unsafe-inline'`**, so any future loosening fails a named test rather than shipping silently.
- **The static headers are set for every path by `next.config.ts` `headers()`**, importing the list from `src/lib/csp.ts` (single source of truth). They are per-deployment constants — recomputing them per request in the proxy would buy nothing, and `headers()` also covers paths the proxy matcher skips (static assets, prefetches).

The production policy, exactly as shipped (`{nonce}` is fresh per request):

```
default-src 'self'; script-src 'self' 'nonce-{nonce}' 'strict-dynamic'; style-src 'self' 'nonce-{nonce}' 'unsafe-hashes' 'sha256-zlqnbDt84zf1iSefLU/ImC54isoprH/MRiVZGskwexk='; img-src 'self' data: https://avatars.githubusercontent.com; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

In development — and only there — `script-src` additionally carries `'unsafe-eval'`, because React uses `eval` to reconstruct server-side error stacks in the browser. The E2E spec asserts it is absent from the production build.

| Header | Value | Set by | Reason |
|---|---|---|---|
| `Content-Security-Policy` | above | `src/proxy.ts` | Blocks injected script execution outright: an attacker's script would need the per-request nonce. `'strict-dynamic'` propagates trust from the nonce'd bootstrap to the chunks it loads |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | `next.config.ts` | Only meaningful once served over HTTPS from a real domain — browsers ignore HSTS on plain HTTP, so it ships inert locally and binds on deployment |
| `X-Content-Type-Options` | `nosniff` | `next.config.ts` | Prevents MIME-type confusion |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `next.config.ts` | Avoids leaking full URLs — including search terms — to third parties |
| `X-Frame-Options` / `frame-ancestors` | `DENY` / `'none'` | `next.config.ts` / CSP | No reason for this app to be framed. `frame-ancestors` is the modern control; `X-Frame-Options` covers older UAs |

No `connect-src` allowance for `api.github.com`: all GitHub traffic is server-side, the browser never calls GitHub, and the CSP governs the browser. This was confirmed by measurement, not assumed.

### Measured, not assumed

This document warned that a carelessly built CSP "looks strict but is not", so the policy is driven, not merely configured: [`e2e/security-headers.spec.ts`](../e2e/security-headers.spec.ts) loads both views from the production build with `securitypolicyviolation`, `pageerror`, and console listeners armed, asserts the exact header values, asserts the nonce differs between requests, and requires **zero CSP violations while the pages load, hydrate, and respond to interaction** (typing in the search input drives a client-side navigation; the detail view's back link navigates) — so "no violations" cannot mean "nothing executed". Findings:

- **`style-src` needed one measured concession — for styles only.** The strict form `style-src 'self' 'nonce-…'` blocked the `style="color:transparent"` attribute `next/image` renders on the avatar (reported as `directive=style-src-attr blocked=inline` on the detail view). A style *attribute* cannot carry a nonce, so the policy adds `'unsafe-hashes'` plus the sha256 of that exact declaration — allowing precisely one known declaration, not arbitrary inline styles. The styles-only `'unsafe-inline'` last resort was **not** needed, and `script-src` was never touched.
- **The statically prerendered global `/_not-found` runs without scripts, accepted and recorded.** It is generated at build time, when no request — and therefore no nonce — exists, so the CSP blocks its bootstrap (its chunk loads, inline scripts, and inline styles are all refused). Its content still renders completely, and it is static markup with nothing interactive to lose, so this is accepted rather than forcing the route dynamic for no user-visible gain. The *designed* not-found page (リポジトリが見つかりません) lives inside the dynamic detail route, receives its nonce normally, and is violation-free.

### Rejected alternatives

- **CSP via `next.config.ts` `headers()` alone.** A static header cannot carry a per-request nonce, and Next's documented no-nonce path requires `script-src 'unsafe-inline'` — the exact thing this policy exists to forbid.
- **Experimental SRI (`experimental.sri`).** Would allow static generation under a strict CSP, but shipping an experimental framework flag in a submission graded as production code is the wrong risk. Nonces are the stable, documented mechanism.

## Dependency and supply-chain security

Built and running today:

| Control | Mechanism |
|---|---|
| Known vulnerabilities | `npm audit --audit-level=high` gates every PR. Currently **0 vulnerabilities** |
| Patched transitive deps | `overrides` in `package.json` raise `postcss` and `sharp` above their advisories — Next pins vulnerable versions and the only "official" fix would downgrade Next to v9 |
| Static analysis | CodeQL with the `security-and-quality` query suite |
| Secret scanning | gitleaks over full history |
| Update cadence | Dependabot weekly, with Next/React grouped so related updates land together |
| Lockfile integrity | `npm ci` in CI installs strictly from `package-lock.json` |

CI permissions default to `contents: read`, with `security-events: write` granted only to the CodeQL job.

## Privacy

No cookies, no analytics, no tracking pixels, no third-party scripts, no user accounts, no data at rest. The app stores nothing about anyone.

The only user-derived data that exists at all is the search keyword, which is a public search term with no identity attached and appears in server logs (see [OPERATIONS.md](./OPERATIONS.md)). There is no GDPR data-subject surface here because there is no data subject — nothing collected can identify a person.

## Deliberately out of scope

| Not doing | Why |
|---|---|
| DAST (OWASP ZAP) | Needs a deployed target. With no auth, no session, and no datastore, a baseline scan would report header configuration — which is already addressed above, by reading the config rather than probing it |
| SBOM generation | Valuable when shipping artifacts to consumers who must audit them. Nothing is distributed here |
| Container scanning | Nothing is containerised |
| Penetration testing | Disproportionate for a read-only client of a public API with no stored state |
| Rate limiting our own endpoints | The app exposes no API. GitHub's limits apply upstream and are handled in the client |

## Reporting a vulnerability

This is a selection-task repository, not a deployed service. If you find an issue while reviewing, please raise it in the submission thread rather than opening a public issue.

---

*Related: [ARCHITECTURE.md](./ARCHITECTURE.md) for the boundaries, [OPERATIONS.md](./OPERATIONS.md) for logging and resilience.*
