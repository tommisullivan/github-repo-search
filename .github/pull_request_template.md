# What and why

<!-- What changed, and the reason. Link the requirement ID from .planning/REQUIREMENTS.md if there is one. -->

## Verification

Run these and paste the real result. Do not tick a box you have not run — an unchecked box with an honest note is worth more than a checked one that is wrong.

```bash
nvm use
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:e2e && npm run test:a11y && npm audit --audit-level=high
```

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:coverage` — coverage threshold met
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] `npm run test:a11y`
- [ ] `npm audit --audit-level=high` — 0 vulnerabilities

<!-- Paste output, or note what you could not verify locally and why. -->

## Tests

- [ ] New behaviour has tests covering the happy path
- [ ] New behaviour has tests covering at least one failure path
- [ ] No test hits the live GitHub API

## Project rules

- [ ] Still Next.js 16 App Router — no `pages/`
- [ ] Repository detail remains a page with its own route, not a modal
- [ ] No `any`, `@ts-ignore`, or non-null `!` added to silence the compiler
- [ ] User-facing strings are Japanese; code and comments are English
- [ ] No token, `Authorization` header, or response body is logged
- [ ] No secret committed; `.env*` untouched

## AI usage

- [ ] `docs/AI-USAGE.ja.md` and `docs/AI-USAGE.en.md` both updated, including **why** — or N/A because this is not a process boundary

## Anything a reviewer should look at first

<!-- Trade-offs, things you were unsure about, anything you would push back on. -->
