/**
 * `searchRepositories()` — the search capability unit.
 *
 * **Server-side only.** It reaches GitHub through `githubFetch`, which reads the
 * optional `GITHUB_TOKEN`; nothing in this module may be imported by a Client
 * Component.
 *
 * This is where the `search/repositories` endpoint's knowledge lives and where
 * it stops: query construction, the `per_page` of D-12, and GitHub's
 * 1000-result ceiling. Per the ARCHITECTURE.md boundary table it may depend on
 * `client.ts`, `errors.ts` and `@/types/github`, and it must never import
 * `repo.ts` or know anything about the detail endpoint's shape — a detail page
 * has to load cold, with no search having run first.
 *
 * It owns neither the cache opt-in nor the status mapping. It passes a
 * `revalidate` window and returns whatever failure `githubFetch` produces,
 * unchanged.
 */

import { githubFetch } from "./client";
import type { Result } from "./errors";
import { DEFAULT_SORT, type SearchSort } from "@/lib/searchUrl";
import type {
  GitHubRepoSummaryPayload,
  GitHubSearchPayload,
  RepoSummary,
  SearchResult,
} from "@/types/github";

/**
 * D-12. Substantial without endless scrolling, a small payload, and enough
 * pages inside the ceiling to exercise pagination for real. GitHub's own
 * default of 30 buys nothing here and produces a longer scroll.
 */
export const SEARCH_PER_PAGE = 20;

/**
 * GitHub's hard cap: the search API will not serve a result past the 1000th,
 * however large `total_count` is. This is an upstream limit, not a policy of
 * this app's.
 */
export const SEARCH_MAX_RESULTS = 1000;

/**
 * Derived, never written as a literal `50`. Changing `SEARCH_PER_PAGE` moves
 * the last reachable page with it; a hard-coded bound would silently start
 * refusing pages that exist, or requesting pages that cannot.
 */
const SEARCH_MAX_PAGE = Math.floor(SEARCH_MAX_RESULTS / SEARCH_PER_PAGE);

/** D-09: search results shift as repositories are created and starred. */
const SEARCH_REVALIDATE_SECONDS = 60;

const INVALID_QUERY: Result<never> = {
  ok: false,
  error: { code: "INVALID_QUERY" },
};

/**
 * Anything that is not a positive integer becomes page 1.
 *
 * The page arrives from a URL query parameter in Phase 2, so `"abc"` (`NaN`),
 * `0`, `-3` and `1.5` are all reachable by hand-editing the address bar. None
 * of them names a page, and the first page is the honest answer for all of
 * them — refusing would turn a typo into an error screen.
 */
function normalisePage(page: number): number {
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/**
 * The wire format crossing into the domain. Unexported and unexportable by
 * intent: `repo.ts` must not import it, because that would be exactly the
 * cross-unit dependency the boundary table forbids (T-01-17). Its detail
 * mapping is separate and stays separate.
 */
function toRepoSummary(payload: GitHubRepoSummaryPayload): RepoSummary {
  return {
    id: payload.id,
    name: payload.name,
    fullName: payload.full_name,
    owner: {
      login: payload.owner.login,
      avatarUrl: payload.owner.avatar_url,
    },
    description: payload.description,
    language: payload.language,
    stars: payload.stargazers_count,
    forks: payload.forks_count,
    openIssues: payload.open_issues_count,
    htmlUrl: payload.html_url,
  };
}

/**
 * Searches GitHub repositories by keyword.
 *
 * **Returns** a `Result` for every failure the app can name — `INVALID_QUERY`
 * for a blank keyword or a page past the ceiling, `RATE_LIMIT` when the quota
 * is spent — and **throws** `GitHubRequestError` for a transport fault, a
 * timeout or any 5xx (D-03, D-05a). A caller that handles only `ok: false` is
 * incomplete; the throw is the path to `error.tsx`.
 *
 * Zero matches is a **success** with an empty `items` array, never a failure.
 * That distinction is the whole reason the codes exist: a rate limit rendered
 * as "no results" is the most misleading thing this app could tell a user.
 */
export async function searchRepositories(
  query: string,
  page = 1,
  sort: SearchSort = DEFAULT_SORT
): Promise<Result<SearchResult>> {
  // Guard first, before anything else. API-04 is not an optimisation: the point
  // is that GitHub never receives the request, so its 422 never happens and the
  // cheapest abusive input costs no quota (T-01-15).
  const trimmedQuery = query.trim();
  if (trimmedQuery === "") {
    return INVALID_QUERY;
  }

  const requestedPage = normalisePage(page);
  // Page 51 starts at result 1001. Past the ceiling GitHub answers 422 whatever
  // the keyword was, so the request is refused here instead — an attacker
  // walking `?page=99999` burns nothing (T-01-14).
  if (requestedPage > SEARCH_MAX_PAGE) {
    return INVALID_QUERY;
  }

  // `URLSearchParams` only, never concatenation or interpolation (SEC-03,
  // T-01-12). A keyword of `next&per_page=100` becomes the *value* of `q`, so
  // it cannot introduce a second parameter or change this one.
  const params = new URLSearchParams({
    q: trimmedQuery,
    per_page: String(SEARCH_PER_PAGE),
    page: String(requestedPage),
  });

  // GitHub has no `sort=best-match` value — relevance is what you get when the
  // parameter is absent, so the default branch must omit it rather than send
  // a literal. `order` only means something alongside `sort`, so it is set in
  // the same place or not at all. The value cannot be arbitrary: `SearchSort`
  // is a closed union and `parseSort` is the only way a URL becomes one.
  if (sort === "stars") {
    params.set("sort", "stars");
    params.set("order", "desc");
  }

  const result = await githubFetch<GitHubSearchPayload>({
    path: `/search/repositories?${params.toString()}`,
    endpoint: "search/repositories",
    // The window is this unit's; the cache opt-in is `githubFetch`'s. Passing
    // `cache` from here would put one decision in two places (D-11a).
    revalidate: SEARCH_REVALIDATE_SECONDS,
  });

  // Returned unchanged. This unit adds no interpretation and no prose — Phase 2
  // maps the code to Japanese copy beside the component that renders it
  // (D-05, D-06). There is deliberately no `try`/`catch`: a thrown
  // `GitHubRequestError` must reach `error.tsx` untouched (D-03).
  if (!result.ok) {
    return result;
  }

  const payload = result.data;
  // `total_count` is reported raw (D-14) but clamped for reachability: GitHub
  // will happily say 48283 and then refuse to serve result 1001.
  const reachableCount = Math.min(payload.total_count, SEARCH_MAX_RESULTS);
  const lastIndexOnPage = requestedPage * SEARCH_PER_PAGE;

  // Derived here, beside the clamp it depends on, rather than in the view.
  // `totalPages` counts the pages a user can actually *reach*, not the pages
  // `total_count` implies: a keyword matching 48,283 repositories has 50
  // reachable pages, not 2,415, because GitHub refuses result 1001. Showing
  // the arithmetic answer would put a page number in the UI that returns an
  // error when you navigate to it.
  //
  // The floor of 1 covers the zero-match case: "1 / 0 ページ" is not a thing.
  // Zero matches renders the empty state anyway, but the type should not
  // depend on the caller knowing that.
  const totalPages = Math.max(
    1,
    Math.ceil(reachableCount / SEARCH_PER_PAGE)
  );

  return {
    ok: true,
    data: {
      items: payload.items.map(toRepoSummary),
      totalCount: payload.total_count,
      reachableCount,
      totalPages,
      page: requestedPage,
      perPage: SEARCH_PER_PAGE,
      hasNextPage: lastIndexOnPage < reachableCount,
    },
  };
}
