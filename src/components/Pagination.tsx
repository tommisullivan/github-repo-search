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
 *
 * ## Rendered twice per result page
 *
 * A 20-result page is taller than the viewport, so a user who wanted the
 * next page had to scroll past every result to reach the only control that
 * would take them there. The search view renders this component at both ends
 * of the list, which is why `position` exists and why it is required rather
 * than defaulted: two copies of the same markup would be two `navigation`
 * landmarks with the identical accessible name (axe `landmark-unique`) and
 * two `aria-live` regions announcing the same sentence twice on every page
 * change. `position` is what makes the pair legal:
 *
 * - the landmark name is disambiguated — 「ページ移動（上部）」/「（下部）」;
 * - only the top copy carries `aria-live`, so a page change is announced
 *   once. The rule is "the first indicator in reading order announces",
 *   which stays true if the bottom copy is ever dropped.
 */

import Link from "next/link";
import { buildSearchUrl, type SearchSort } from "@/lib/searchUrl";

type PaginationProps = {
  q: string;
  page: number;
  hasNextPage: boolean;

  /**
   * The last reachable page. Comes from the search unit, which derives it from
   * the 1000-result ceiling — this component must not compute it from a total
   * count, or it will offer pages GitHub refuses to serve.
   */
  totalPages: number;

  /**
   * The active ordering, carried through so paging preserves it. Without this
   * the links drop back to relevance on page 2 and the user silently loses
   * their sort.
   */
  sort: SearchSort;

  /**
   * Where this copy sits relative to the result list. Required — see the
   * file header; a caller must not be able to render an unlabelled duplicate
   * by forgetting it.
   */
  position: "top" | "bottom";
};

export function Pagination({
  q,
  page,
  hasNextPage,
  totalPages,
  sort,
  position,
}: PaginationProps) {
  // Built through the shared helper, never by hand — that is what keeps `sort`
  // from being dropped here while the input still sets it.
  const prevHref = buildSearchUrl({ q, page: page - 1, sort });
  const nextHref = buildSearchUrl({ q, page: page + 1, sort });

  const isPrevDisabled = page <= 1;
  const isNextDisabled = !hasNextPage;

  const isTop = position === "top";

  return (
    <nav
      aria-label={isTop ? "ページ移動（上部）" : "ページ移動（下部）"}
      // The top copy sits directly under the result count, where a full `p-6`
      // would open a gap wide enough to read as a separate section.
      className={
        isTop
          ? "flex items-center justify-between gap-4 px-6 py-2"
          : "flex items-center justify-between gap-4 p-6"
      }
    >
      {isPrevDisabled ? (
        <span
          role="link"
          aria-disabled="true"
          // tabIndex keeps the disabled endpoint in the tab order — D-19's
          // "stable tab order across pages" needs focusability, not just DOM
          // presence, or the sequence shifts between page 1 and page 2
          // (Phase 4 UX-06 audit finding).
          tabIndex={0}
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

      {/* Only the top copy announces — see the file header. The bottom copy
          renders the identical text, silently. */}
      <span aria-live={isTop ? "polite" : undefined} className="text-sm">
        {page} / {totalPages} ページ
      </span>

      {isNextDisabled ? (
        <span
          role="link"
          aria-disabled="true"
          // Same rationale as the disabled "前へ" above (D-19 / UX-06).
          tabIndex={0}
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
