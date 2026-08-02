/**
 * Previous/next pagination for a search result page.
 *
 * Server Component — the two links only need to know the current page and
 * whether more results are available; nothing here is interactive beyond
 * following a `next/link`. Refresh-safe (no client state), works without
 * JavaScript executing.
 *
 * The disabled edge cases render as `<span aria-disabled="true">` rather
 * than being removed from the DOM (D-19) so the tab order and reading
 * order are stable across pages — a screen-reader user hears "link,
 * disabled" for both endpoints, not "link, missing" that shifts around.
 */

import Link from "next/link";

type PaginationProps = {
  q: string;
  page: number;
  hasNextPage: boolean;
};

export function Pagination({ q, page, hasNextPage }: PaginationProps) {
  const encodedQ = encodeURIComponent(q);
  const prevHref = `/?q=${encodedQ}&page=${page - 1}`;
  const nextHref = `/?q=${encodedQ}&page=${page + 1}`;

  const isPrevDisabled = page <= 1;
  const isNextDisabled = !hasNextPage;

  return (
    <nav
      aria-label="ページ移動"
      className="flex items-center justify-between gap-4 p-6"
    >
      {isPrevDisabled ? (
        <span
          role="link"
          aria-disabled="true"
          className="text-sm text-zinc-400 dark:text-zinc-600"
        >
          前へ
        </span>
      ) : (
        <Link
          href={prevHref}
          rel="prev"
          className="text-sm text-blue-700 hover:underline dark:text-blue-400"
        >
          前へ
        </Link>
      )}

      <span aria-live="polite" className="text-sm">
        {page} ページ目
      </span>

      {isNextDisabled ? (
        <span
          role="link"
          aria-disabled="true"
          className="text-sm text-zinc-400 dark:text-zinc-600"
        >
          次へ
        </span>
      ) : (
        <Link
          href={nextHref}
          rel="next"
          className="text-sm text-blue-700 hover:underline dark:text-blue-400"
        >
          次へ
        </Link>
      )}
    </nav>
  );
}
