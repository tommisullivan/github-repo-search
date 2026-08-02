/**
 * Search route — `/`.
 *
 * Server Component. Reads `searchParams.q` and `searchParams.page`, calls
 * `searchRepositories()` on the server, and renders one of five states —
 * happy, empty, rate-limited, invalid-query (two distinguishable causes), or a
 * throw that reaches `app/error.tsx`. Never `try`/`catch` around the client
 * call — a thrown `GitHubRequestError` must propagate to the boundary
 * (D-07 in phase context; D-03 in Phase 1).
 *
 * In Next 16 the App Router passes `searchParams` as a Promise — this is a
 * breaking change from earlier versions. See
 * `node_modules/next/dist/docs/…` if the type ever drifts.
 */

import {
  searchRepositories,
  SEARCH_MAX_RESULTS,
  SEARCH_PER_PAGE,
} from "@/lib/github/search";
import { EmptyState } from "@/components/EmptyState";
import { InvalidQueryNotice } from "@/components/InvalidQueryNotice";
import { Pagination } from "@/components/Pagination";
import { RateLimitPanel } from "@/components/RateLimitPanel";
import { ResultList } from "@/components/ResultList";
import { SearchInput } from "@/components/SearchInput";
import { buildSearchUrl, parseSort, type SearchSort } from "@/lib/searchUrl";

/**
 * Derived from the exported client constants — never written as `50` literally.
 * Changing `SEARCH_PER_PAGE` in the client moves this bound with it, so a
 * change cannot silently open the ceiling (STATE.md carried this from
 * Phase 1's plan 01-04).
 */
const SEARCH_MAX_PAGE = Math.floor(SEARCH_MAX_RESULTS / SEARCH_PER_PAGE);

type SearchParams = Record<string, string | string[] | undefined>;

type SearchPageProps = {
  searchParams: Promise<SearchParams>;
};

function readParam(value: string | string[] | undefined): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function parsePage(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export default async function Home({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const q = readParam(params.q);
  const page = parsePage(readParam(params.page));
  const sort = parseSort(readParam(params.sort));

  const trimmedQ = q.trim();
  const isBlankQuery = trimmedQ === "";
  const isOutOfRangePage = !isBlankQuery && page > SEARCH_MAX_PAGE;

  // Resolve the content region on the server, so the rendered tree is fully
  // synchronous JSX. Deliberately NO try/catch around searchRepositories —
  // a thrown GitHubRequestError from the client (transport fault, timeout,
  // 5xx) must reach app/error.tsx unchanged (D-07 / D-03).
  const content = isBlankQuery ? (
    <InvalidQueryNotice reason="blank" />
  ) : isOutOfRangePage ? (
    <InvalidQueryNotice reason="out-of-range" />
  ) : (
    await renderSearchResults(trimmedQ, page, sort)
  );

  return (
    <main className="mx-auto max-w-3xl w-full flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">GitHubリポジトリ検索</h1>

      {/* The label lives inside SearchInput: the component now renders a
          <form>, which is flow content and cannot legally nest inside a
          <label>. The association is by htmlFor/id instead of wrapping. */}
      <SearchInput initialQuery={q} sort={sort} />

      {content}
    </main>
  );
}

async function renderSearchResults(
  q: string,
  page: number,
  sort: SearchSort
) {
  const result = await searchRepositories(q, page, sort);

  if (!result.ok) {
    switch (result.error.code) {
      case "RATE_LIMIT":
        // Sample the clock once per server request, at the boundary. The
        // panel itself must stay pure (react-hooks/purity) — see the
        // rationale on RateLimitPanel's `now` prop.
        return (
          <RateLimitPanel
            resetAt={result.error.resetAt}
            now={Math.floor(Date.now() / 1000)}
          />
        );
      case "INVALID_QUERY":
        // The page's guards catch blank and out-of-range before we reach
        // here, so this branch is defensive against a future client-side
        // return we cannot predict. Blank copy is the honest fallback.
        return <InvalidQueryNotice reason="blank" />;
      case "NOT_FOUND":
        // searchRepositories never returns NOT_FOUND, but the exhaustive
        // switch protects against a future addition to the type.
        return <InvalidQueryNotice reason="blank" />;
      default: {
        // Exhaustiveness check — compiles only if every code is handled.
        const _exhaustive: never = result.error;
        return _exhaustive;
      }
    }
  }

  const {
    items,
    totalCount,
    reachableCount,
    totalPages,
    page: currentPage,
    hasNextPage,
  } = result.data;

  if (items.length === 0) {
    return <EmptyState />;
  }

  const start = (currentPage - 1) * SEARCH_PER_PAGE + 1;
  const end = start + items.length - 1;
  const currentSearchUrl = buildSearchUrl({ q, page: currentPage, sort });

  // A broad keyword matches far more than GitHub will serve. Saying
  // 「全 48,283 件」 next to 「1 / 50 ページ」 invites the obvious question —
  // 48,283 ÷ 20 is 2,415, so where did the other 2,365 pages go? The answer is
  // an upstream limit, so the UI states it rather than leaving the two numbers
  // to contradict each other.
  const isCountClamped = reachableCount < totalCount;

  // Pagination lives only in the happy branch — a user on the empty,
  // rate-limited, or invalid-query state has no page-2 to visit, so a
  // disabled control there would be visual noise (SRCH-04).
  //
  // The wrapper is a labelled <section> (region landmark), not a bare <div>,
  // so a screen-reader user can jump to the answer by landmark the same way
  // the state panels are reachable via their status/alert roles (UX-06).
  return (
    <section aria-label="検索結果" className="flex flex-col gap-4">
      <p className="px-6 text-sm text-zinc-600 dark:text-zinc-400">
        全 {totalCount.toLocaleString("ja-JP")} 件中 {start}〜{end} 件
        {isCountClamped ? (
          <>
            <br />
            <span className="text-zinc-500 dark:text-zinc-500">
              GitHubの仕様により、表示できるのは先頭{" "}
              {reachableCount.toLocaleString("ja-JP")} 件（{totalPages}{" "}
              ページ）までです。
            </span>
          </>
        ) : null}
      </p>

      {/* Two copies, top and bottom: 20 results is taller than a viewport, so
          a single control at the end meant scrolling past everything to reach
          the next page. See the Pagination file header for what makes the
          duplicate legal for a screen-reader user. */}
      <Pagination
        q={q}
        page={currentPage}
        hasNextPage={hasNextPage}
        totalPages={totalPages}
        sort={sort}
        position="top"
      />
      <ResultList items={items} currentSearchUrl={currentSearchUrl} />
      <Pagination
        q={q}
        page={currentPage}
        hasNextPage={hasNextPage}
        totalPages={totalPages}
        sort={sort}
        position="bottom"
      />
    </section>
  );
}
