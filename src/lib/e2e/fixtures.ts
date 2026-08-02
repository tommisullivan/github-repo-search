/**
 * E2E fixture payloads for the server-side GitHub API mock.
 *
 * **Raw GitHub REST JSON shapes, snake_case, deliberately.** The interceptor in
 * `githubApiMock.ts` sits beneath the real client (`src/lib/github/`), so these
 * payloads travel through the client's actual parsing and mapping — that is the
 * point of mocking at the fetch boundary rather than the module (D4-02a).
 *
 * **Every value is a sentinel that cannot exist on real GitHub** (D4-02): the
 * owner `e2e-fixture` and counts like 12,345 stars are chosen so that a spec
 * asserting them can only pass through this mock. A silently-broken interceptor
 * fails named assertions instead of passing against live data.
 *
 * The one trap this fixture set proves end to end: `watchers_count` is set
 * **equal to** `stargazers_count` (12345) — exactly GitHub's real duplication —
 * while `subscribers_count` is 678. A detail page rendering "678" for watchers
 * can only have read `subscribers_count`, which is the mapping the brief's
 * watcher requirement actually needs (see `src/lib/github/repo.ts`).
 */

import type {
  GitHubRepoDetailPayload,
  GitHubRepoSummaryPayload,
  GitHubSearchPayload,
} from "@/types/github";

/** The sentinel owner. No real GitHub account should ever produce this data. */
export const FIXTURE_OWNER = "e2e-fixture";

/**
 * Fixed far-future `x-ratelimit-reset` (2100-01-01T00:00:00Z, Unix seconds) so
 * the rate-limit panel's "retry in N minutes" copy renders deterministically as
 * a rate-limit state. Specs assert the state, never the minute count.
 */
export const RATE_LIMIT_RESET = 4102444800;

/** On the one host `next.config.ts` allowlists — anything else fails the build-time check. */
const AVATAR_URL = "https://avatars.githubusercontent.com/u/99999999?v=4";

const OWNER = {
  login: FIXTURE_OWNER,
  avatar_url: AVATAR_URL,
};

/**
 * The first result — the repository the journey spec clicks through to.
 * `stargazers_count: 12345` renders as `12,345` via `Intl.NumberFormat("ja-JP")`.
 */
const REPO_ALPHA: GitHubRepoSummaryPayload = {
  id: 900001,
  name: "repo-alpha",
  full_name: "e2e-fixture/repo-alpha",
  html_url: "https://github.com/e2e-fixture/repo-alpha",
  // The trailing URL is one long unbroken token, deliberately: real GitHub
  // descriptions carry URLs, and an unbroken token wider than a 375px
  // viewport is the realistic horizontal-overflow risk UX-07's responsive
  // spec must exercise (04-02 additive extension to the 04-01 fixture set).
  description:
    "E2Eテスト用のフィクスチャリポジトリです。参照: " +
    "https://e2e-fixture.example.invalid/very-long-unbroken-reference-path-" +
    "0123456789012345678901234567890123456789012345678901234567890123456789",
  language: "TypeScript",
  stargazers_count: 12345,
  forks_count: 234,
  open_issues_count: 56,
  owner: OWNER,
};

/** Filler rows so page 1 carries a full `per_page` of 20 items. */
function fillerRepo(index: number): GitHubRepoSummaryPayload {
  return {
    id: 900100 + index,
    name: `repo-filler-${index}`,
    full_name: `e2e-fixture/repo-filler-${index}`,
    html_url: `https://github.com/e2e-fixture/repo-filler-${index}`,
    description: index % 3 === 0 ? null : `フィクスチャ ${index} 番`,
    // One row without a language exercises the list's "-" fallback.
    language: index % 4 === 0 ? null : "TypeScript",
    stargazers_count: 100 + index,
    forks_count: 10 + index,
    open_issues_count: index,
    owner: OWNER,
  };
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * `q` containing `fixture-alpha`, page 1 (or no page): 25 total results —
 * 20 on this page, 5 on the next — so pagination is exercised for real.
 */
export const SEARCH_PAGE_1: GitHubSearchPayload = {
  total_count: 25,
  incomplete_results: false,
  items: [REPO_ALPHA, ...range(1, 19).map(fillerRepo)],
};

/** Same query, page 2: the remaining 5 items. */
export const SEARCH_PAGE_2: GitHubSearchPayload = {
  total_count: 25,
  incomplete_results: false,
  items: range(20, 24).map(fillerRepo),
};

/** `q` containing `fixture-empty`: a legitimate zero-result success. */
export const SEARCH_EMPTY: GitHubSearchPayload = {
  total_count: 0,
  incomplete_results: false,
  items: [],
};

/**
 * `GET /repos/e2e-fixture/repo-alpha` — the detail payload.
 *
 * `watchers_count` deliberately equals `stargazers_count` (GitHub's real REST
 * duplication) and `subscribers_count` is the visibly different 678, so the
 * journey spec's "watchers shows 678" assertion proves the mapping end to end.
 */
export const REPO_ALPHA_DETAIL: GitHubRepoDetailPayload = {
  ...REPO_ALPHA,
  subscribers_count: 678,
  watchers_count: 12345,
};
