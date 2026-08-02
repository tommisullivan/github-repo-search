/**
 * The search view's URL contract, in one place.
 *
 * Four things build a search URL — the input, the sort control, both copies of
 * the pagination, and the back link a result card carries into the detail page.
 * When each built its own string, adding a parameter meant remembering all four;
 * the failure mode is silent and specific: you change the sort, click 次へ, and
 * the sort is gone because the pagination link never knew about it.
 *
 * So the URL shape lives here and nowhere else. This module is deliberately
 * **pure and framework-free** — no `next/*`, no `githubFetch`, no `"use server"`
 * boundary. That is what lets the Client Component (`SearchInput`) and the
 * Server Components (`page.tsx`, `Pagination`) share one definition instead of
 * keeping two that can drift. `SearchSort` lives here rather than in
 * `lib/github/search.ts` for the same reason: a `"use client"` module must be
 * able to name the type without importing the server-only search unit.
 */

/**
 * How results are ordered.
 *
 * `best-match` is GitHub's default relevance ranking and is expressed by
 * **omitting** `sort` from the request — there is no `sort=best-match` value in
 * the API. `stars` maps to `sort=stars&order=desc`.
 */
export type SearchSort = "best-match" | "stars";

export const DEFAULT_SORT: SearchSort = "best-match";

/**
 * The sort control's options, with their Japanese labels. Exported as data so
 * the `<select>` cannot list an option the parser would reject — adding a sort
 * means adding one row here, and both ends move together.
 */
export const SORT_OPTIONS: ReadonlyArray<{
  value: SearchSort;
  label: string;
}> = [
  { value: "best-match", label: "関連度順" },
  { value: "stars", label: "スター数順" },
];

/**
 * Anything that is not a sort this app supports becomes the default.
 *
 * The value arrives from a query parameter, so `?sort=forks`, `?sort=<script>`
 * and `?sort=` are all reachable by hand-editing the address bar. Falling back
 * is the honest answer for all of them: an unrecognised ordering is not an
 * error state a user needs a screen for, and refusing would turn a typo into
 * one. It also means only values from `SORT_OPTIONS` ever reach GitHub.
 */
export function parseSort(raw: string): SearchSort {
  return SORT_OPTIONS.some((option) => option.value === raw)
    ? (raw as SearchSort)
    : DEFAULT_SORT;
}

type BuildSearchUrlInput = {
  q: string;
  page: number;
  sort: SearchSort;
};

/**
 * Builds a search URL from the three pieces of state the view owns.
 *
 * `URLSearchParams` handles the escaping (SEC-03) — a keyword of
 * `next&page=99` becomes the *value* of `q` and cannot introduce a second
 * parameter. The default sort is omitted rather than written out, so an
 * ordinary search keeps the short `/?q=react&page=1` shape that every existing
 * link, test and bookmark already uses.
 *
 * A blank keyword collapses to `/` — the canonical "nothing searched yet" URL.
 * Without this, clearing the input would leave `/?q=&page=1`, which renders the
 * same screen under a different address.
 */
export function buildSearchUrl({ q, page, sort }: BuildSearchUrlInput): string {
  const trimmed = q.trim();
  if (trimmed === "") {
    return "/";
  }

  const params = new URLSearchParams({
    q: trimmed,
    page: String(page),
  });

  if (sort !== DEFAULT_SORT) {
    params.set("sort", sort);
  }

  return `/?${params.toString()}`;
}
