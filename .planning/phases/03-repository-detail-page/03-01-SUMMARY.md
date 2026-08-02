# Plan 03-01 — Summary

**Completed:** 2026-08-02
**Requirements closed:** SEC-02
**Requirements advanced:** DTL-05 (the guard the detail page's back link needs)

## What shipped

### `next.config.ts`

Exactly one entry under `images.remotePatterns`:

```ts
{ protocol: "https", hostname: "avatars.githubusercontent.com" }
```

No wildcards. No `pathname` — GitHub's avatar URL shapes vary. No additional hosts. A comment above the block cites SEC-02 and `docs/SECURITY.md` and states why the entry is deliberately narrow.

### `src/lib/backTarget.ts`

One exported pure function:

```ts
export function resolveBackTarget(from: string | string[] | undefined): string
```

Header comment explains the mirror to `SITE_RELATIVE_PATH` in `src/lib/github/client.ts` (line 49) and cites the WHATWG-URL trap: `new URL("/\\evil.example.com/x", "https://…").pathname === "/evil.example.com/x"`. Same regex shape; both `/` and `\` rejected as the second character.

Handles the four input shapes Next can hand you:
- `undefined` → `"/"`
- `""` → `"/"`
- `string[]` → `"/"` (a repeated query param is not a legitimate back link)
- `string` → `SITE_RELATIVE_PATH.test(from) ? from : "/"`, with `"/"` special-cased so the root itself does not fail the two-character test

### `src/lib/backTarget.test.ts`

15 tests (`it.each` table), one per named case:

| Input | Expected | Reason |
|---|---|---|
| `undefined` | `/` | absent query param |
| `""` | `/` | empty query param |
| `["/x","/y"]`, `["/only"]` | `/` | array shape |
| `/` | `/` | the root itself |
| `/?q=next&page=2` | `/?q=next&page=2` | the primary success case (Phase 2 back-link shape) |
| `/repos/foo/bar` | `/repos/foo/bar` | a legitimate internal path |
| `//evil.example.com` | `/` | protocol-relative attack |
| `/\evil.example.com` | `/` | the WHATWG-URL parser trap |
| `\host` | `/` | not site-relative |
| `https://evil.example.com`, `http://evil.example.com` | `/` | absolute URLs |
| `javascript:alert(1)` | `/` | XSS via `href` |
| `#top` | `/` | bare fragment |
| `?q=x` | `/` | bare query string without leading slash |

## Verification

Ran in this session on Node 24.18.1:

- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm test -- src/lib/backTarget.test.ts` — 15 passed / 15.
- `npm run build` — compiled; route table shows `○ /` and `○ /_not-found` (the scaffold routes; `/repos/[owner]/[repo]` is plan 03's).

## Decisions taken as-is vs modified

Everything shipped as the plan specified. One deliberate choice from the "Claude's Discretion" leeway in the plan: the guard lives at `src/lib/backTarget.ts` rather than inside `RepoDetail.tsx`. The reason is testability — a component-embedded pure function is harder to test in isolation, and this function's *whole value* is the case table its test names.

## Caveats

None. The plan was small on purpose and shipped as specified.
