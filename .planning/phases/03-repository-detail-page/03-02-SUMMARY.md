# Plan 03-02 — Summary

**Completed:** 2026-08-02
**Requirements closed:** DTL-02, DTL-03 (rendered here; the mapping was Phase 1's), DTL-05 (the back-link render — its guard shipped in 03-01)
**Requirements advanced:** TEST-02 (the component half; the page half lands in 03-03)

## What shipped

### `src/components/RepoDetail.tsx`

One exported component `<RepoDetail>` with props `{ repo: RepoDetailType; backHref: string }`. Server-Component-compatible — no `"use client"`, no `useEffect`, no side effects.

Renders the seven brief-required fields:

| Field | Source | Rendering notes |
|---|---|---|
| name | `repo.name` | `<h1>` |
| owner avatar | `repo.owner.avatarUrl` | `next/image` w/ 64×64, `priority`, alt `${login} のアバター` |
| primary language | `repo.language` | Falls back to "言語情報なし" when `null` |
| stars | `repo.stars` | `Intl.NumberFormat('ja-JP')` — "4,321" |
| watchers | `repo.watchers` | Same formatter; the value is `subscribers_count` per Phase 1's mapping |
| forks | `repo.forks` | Same formatter |
| open issues | `repo.openIssues` | Same formatter |

Plus `fullName`, `description` (rendered as plain text — never `dangerouslySetInnerHTML`; the ESLint rule would fail the build anyway), and a footer "GitHubで開く" link with `target="_blank" rel="noopener noreferrer"`.

The metrics are grouped in a `<section role="region" aria-label="リポジトリ統計">` for accessible queryability. `<dl>` was considered and rejected — it has no default `list` role in ARIA, and forcing one on a `<ul>` would misrepresent the structure.

### `src/components/RateLimitPanel.tsx`

One exported component `<RateLimitPanel>` with props `{ resetAt: number }` (Unix seconds — the shape Phase 1 returns).

The component's *reason to exist* is Phase 1's hybrid failure model: `RATE_LIMIT` returns as a `Result` failure, not a throw, so `error.tsx` cannot receive it. The header comment restates the production-error-sanitisation reason at the file — a future reader who thinks "why not just throw?" needs the answer where they are looking.

Reset time formatted with `Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })`. Formatter instantiated once at module scope. Copy explicitly names "日本時間" — "20:14" alone is not actionable without a timezone.

Link back to `/` with accessible name "検索に戻る".

### `src/components/RepoDetail.test.tsx` — 10 tests

- 7 fields all present, queried by role and accessible name
- Language falls back to "言語情報なし" when `null`
- Numbers formatted as `4,321` / `47,600` / `981`
- **The watchers-vs-stars trap:** fixture with `stars: 4321` and `watchers: 7` — asserts both render distinctly and that `7` (anchored `/^7$/`) is queryable
- Back link renders as `<a href={backHref}>` with accessible name "戻る"
- GitHub link carries `target="_blank"` and both `noopener` and `noreferrer` in `rel`
- Description renders as plain text when present
- The metrics region is queryable by role + accessible name

### `src/components/RateLimitPanel.test.tsx` — 5 tests

- Heading "GitHub APIの利用制限に達しました" is queryable by role + name
- Reset time appears formatted with the same `Intl.DateTimeFormat` (computed in the test rather than hardcoded, so a Node ICU update does not produce false positives) and the raw Unix seconds do **not** leak into the DOM
- "日本時間" is present so the timezone is not ambiguous
- The "検索に戻る" link points at `/`
- **The load-bearing assertion:** the panel does **not** render "リポジトリが見つかりません" — the single most misleading collapse this app can produce (rate-limit rendering as not-found) is prevented in a named test

## Verification

Ran in this session on Node 24.18.1:

- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm test -- src/components/` — 15 passed / 15 (10 RepoDetail + 5 RateLimitPanel).

## Decisions taken as-is vs modified

Two edits during implementation:

1. **The metrics region.** The plan sketched a `<dl>` but the test tried to query by `role="list"`. `<dl>` has no default `list` role in ARIA; queries against a jsdom render would have failed. Changed to `<section role="region" aria-labelledby="stats-heading" aria-label="リポジトリ統計">` with an `sr-only` heading. Same accessible name, same queryability, correct ARIA semantics. The test file was updated to `getByRole("region", { name: "リポジトリ統計" })` before the component was written.

2. **Rate-limit copy exact wording.** Suggested strings in the plan (`${time} (日本時間) 以降に再度お試しください`) shipped essentially as-is. The parenthesised form uses full-width parentheses `（日本時間）` because the surrounding text is Japanese — matching the ambient script rather than switching to ASCII parens mid-sentence.

## Caveats

None specific to this plan. The full DoD gate runs in 03-03.
