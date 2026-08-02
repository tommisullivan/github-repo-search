/**
 * `getRepository()` — the repository capability unit.
 *
 * **Server-side only.** It reaches GitHub through `githubFetch`, which reads the
 * optional `GITHUB_TOKEN`; nothing in this module may be imported by a Client
 * Component.
 *
 * This is where the `repos/{owner}/{repo}` endpoint's knowledge lives: path
 * encoding of the two user-supplied segments and the `subscribers_count`
 * correction. Per the ARCHITECTURE.md boundary table it may depend on
 * `client.ts`, `errors.ts` and `@/types/github`, and it must never import
 * `search.ts` or assume a search ran first — a detail URL opened cold is the
 * case that has to work, on exactly one GitHub read.
 *
 * The summary fields are mapped here rather than shared with `search.ts`. The
 * duplication is deliberate: importing that unit's mapper would be the
 * cross-unit dependency the boundary table forbids (T-01-17), and the compiler
 * catches any drift, because a field added to `RepoSummary` fails to compile in
 * both units at once.
 */

import { githubFetch } from "./client";
import type { Result } from "./errors";
import type { GitHubRepoDetailPayload, RepoDetail } from "@/types/github";

/**
 * D-09: detail changes slowly and is the page most likely to be reloaded during
 * review. Search gets 60 because results shift as repositories are created and
 * starred — a single number would be wrong for one of the two.
 */
const DETAIL_REVALIDATE_SECONDS = 300;

/**
 * Fetches one repository's detail by owner and name.
 *
 * **Returns** a `Result` for every failure the app can name — `NOT_FOUND` for a
 * 404 or a blank argument, `RATE_LIMIT` when the quota is spent — and **throws**
 * `GitHubRequestError` for a transport fault, a timeout or any 5xx (D-03,
 * D-05a). A caller that handles only `ok: false` is incomplete; the throw is the
 * path to `error.tsx`.
 */
export async function getRepository(
  owner: string,
  repo: string
): Promise<Result<RepoDetail>> {
  // Guard first, before any request. `NOT_FOUND` rather than `INVALID_QUERY` is
  // the honest code: a blank owner names no repository, and the not-found page
  // is what a user in that position should see. It also keeps a malformed path
  // like `/repos//react` from ever being built (SEC-03).
  const trimmedOwner = owner.trim();
  const trimmedRepo = repo.trim();
  if (trimmedOwner === "" || trimmedRepo === "") {
    return { ok: false, error: { code: "NOT_FOUND" } };
  }

  // Each segment encoded separately, never the path as a whole and never a raw
  // argument interpolated in (SEC-03, T-01-13). Encoding per segment is what
  // stops an owner of `../../search` escaping into another endpoint: its `/`
  // becomes `%2F` and stays inside the segment.
  const path = `/repos/${encodeURIComponent(trimmedOwner)}/${encodeURIComponent(
    trimmedRepo
  )}`;

  const result = await githubFetch<GitHubRepoDetailPayload>({
    path,
    endpoint: "repos/{owner}/{repo}",
    // The window is this unit's; the cache opt-in is `githubFetch`'s (D-11a).
    revalidate: DETAIL_REVALIDATE_SECONDS,
  });

  // Returned unchanged — no interpretation, no prose (D-05, D-06). And no
  // `try`/`catch`: a thrown `GitHubRequestError` must reach `error.tsx`
  // untouched (D-03).
  if (!result.ok) {
    return result;
  }

  const payload = result.data;

  return {
    ok: true,
    data: {
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
      // `subscribers_count`, and the field name is not a typo. In GitHub's REST
      // API `watchers_count` is a duplicate of `stargazers_count`, so using the
      // obvious field would render the star count twice on a page that asks for
      // both and read as a bug. `subscribers_count` is the real watcher count
      // and exists only on this endpoint — which is also why watchers cannot be
      // shown in a search result list without a second request. This line is
      // the only place in the codebase that knows about the quirk.
      watchers: payload.subscribers_count,
    },
  };
}
