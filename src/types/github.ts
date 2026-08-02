/**
 * GitHub REST API shapes.
 *
 * Server-side only. This module is never imported by a Client Component: the
 * types describe responses fetched inside `src/lib/github/`, which runs on the
 * server so the optional `GITHUB_TOKEN` cannot reach the browser bundle.
 *
 * Two sections, and the split is deliberate:
 *   1. `GitHub…Payload` — the wire format, snake_case, exactly as GitHub sends it.
 *   2. Domain types — camelCase, what crosses the boundary into routes and
 *      components. Nothing outside `src/lib/github/` should see a payload type.
 *
 * Only the fields this app actually reads are modelled (API-01). Typing the
 * whole GitHub schema would be noise, and leaving the payload as `unknown`
 * would push parsing into components.
 */

// ---------------------------------------------------------------------------
// Section 1 — raw payload types (GitHub's wire format, snake_case)
// ---------------------------------------------------------------------------

/** Owner of a repository, as embedded in a repository payload. */
export type GitHubOwnerPayload = {
  login: string;
  avatar_url: string;
};

/**
 * A repository as returned by `GET /search/repositories`.
 *
 * The detail endpoint returns a superset of this — see `GitHubRepoDetailPayload`.
 */
export type GitHubRepoSummaryPayload = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  owner: GitHubOwnerPayload;
};

/** Response body of `GET /search/repositories`. */
export type GitHubSearchPayload = {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepoSummaryPayload[];
};

/**
 * A repository as returned by `GET /repos/{owner}/{repo}`.
 *
 * `extends` rather than a type alias because this genuinely is the summary plus
 * two fields (AGENTS.md: reserve `interface` for extension).
 */
export interface GitHubRepoDetailPayload extends GitHubRepoSummaryPayload {
  /**
   * The real watcher count. Present only on the detail endpoint — the search
   * endpoint does not return it, which is why watchers cannot be rendered in a
   * result list without a second request.
   */
  subscribers_count: number;

  /**
   * TRAP — do not render this. In GitHub's REST API `watchers_count` is a
   * duplicate of `stargazers_count`, not the number of watchers. Using it shows
   * the star count twice on a page that asks for both, which reads as a bug.
   * The real watcher count is `subscribers_count` (above). This field is
   * modelled only so a reader who greps for `watchers_count` lands on this
   * explanation instead of quietly using it.
   */
  watchers_count: number;
}

// ---------------------------------------------------------------------------
// Section 2 — domain types (camelCase, what leaves the boundary)
// ---------------------------------------------------------------------------

/** A repository as rendered in a search result list. */
export type RepoSummary = {
  id: number;
  name: string;
  fullName: string;
  owner: {
    login: string;
    avatarUrl: string;
  };
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  htmlUrl: string;
};

/**
 * A repository as rendered on its own detail route.
 *
 * `extends` because a detail is a summary plus watchers.
 */
export interface RepoDetail extends RepoSummary {
  /**
   * Sourced from `subscribers_count`, never from `watchers_count` — see the
   * trap note on `GitHubRepoDetailPayload`. There is deliberately no
   * `watchersCount` field on this type, so the only way to populate `watchers`
   * is a deliberate mapping in the repository unit.
   */
  watchers: number;
}

/**
 * One page of search results.
 *
 * `totalCount` is carried so Phase 2 can render pagination from a single call
 * rather than probing for the last page (D-14). It is GitHub's raw total, which
 * can exceed the 1000 results the search API will actually serve — the caller
 * decides how to clamp it.
 */
export type SearchResult = {
  items: RepoSummary[];

  /** GitHub's raw `total_count` — how many repositories matched. */
  totalCount: number;

  /**
   * `totalCount` clamped to the 1000-result ceiling: how many of those matches
   * this API will actually serve. Equal to `totalCount` for ordinary searches;
   * smaller for broad ones. The gap between the two is what the view needs in
   * order to explain itself honestly.
   */
  reachableCount: number;

  /**
   * The last page a user can reach, derived from `reachableCount` — never from
   * `totalCount`, which would name pages that return an error.
   */
  totalPages: number;

  page: number;
  perPage: number;
  hasNextPage: boolean;
};
