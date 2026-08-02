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
import { RateLimitPanel } from "@/components/RateLimitPanel";
import { ResultList } from "@/components/ResultList";

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
    await renderSearchResults(trimmedQ, page)
  );

  return (
    <main className="mx-auto max-w-3xl w-full flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">GitHubリポジトリ検索</h1>

      <label className="flex flex-col gap-2">
        <span className="text-sm">キーワード</span>
        {/* Client-side interactive input lands in plan 02-03; this slot keeps
            the DOM structure stable so the swap does not shift layout. */}
        <div data-slot="search-input" />
      </label>

      {content}
    </main>
  );
}

async function renderSearchResults(q: string, page: number) {
  const result = await searchRepositories(q, page);

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

  const { items, totalCount, page: currentPage } = result.data;

  if (items.length === 0) {
    return <EmptyState />;
  }

  const start = (currentPage - 1) * SEARCH_PER_PAGE + 1;
  const end = start + items.length - 1;
  const currentSearchUrl = `/?q=${encodeURIComponent(q)}&page=${currentPage}`;

  return (
    <div className="flex flex-col gap-4">
      <p className="px-6 text-sm text-zinc-600 dark:text-zinc-400">
        全 {totalCount.toLocaleString("ja-JP")} 件中 {start}〜{end} 件
      </p>
      <ResultList items={items} currentSearchUrl={currentSearchUrl} />
    </div>
  );
}
