/**
 * Repository detail route — `/repos/[owner]/[repo]`.
 *
 * DTL-01: this is the assignment's non-negotiable — the detail view is a
 * page with its own URL, never a modal. Being a Server Component is what
 * gives DTL-04 for free: a bare or refreshed URL renders correctly on the
 * request path, and `GITHUB_TOKEN` stays server-side by construction (API-03).
 *
 * The failure model is Phase 1's D-01 / D-05a, inherited unchanged. The
 * three returned codes route inline: `RATE_LIMIT` renders the panel
 * (production Next sanitises server errors before the client boundary sees
 * them, so per-state UI inside `error.tsx` would silently degrade — see
 * `src/lib/github/errors.ts` header); `NOT_FOUND` and `INVALID_QUERY` call
 * Next's `notFound()`, which triggers the colocated `not-found.tsx` and
 * gives a real 404 status. The one thrown class (`GitHubRequestError`,
 * carrying `NETWORK`) reaches the route-scoped `error.tsx` because this
 * page does not `try`/`catch` the client — D-03, and the page test proves
 * it.
 *
 * The seven required fields (name, avatar, language, stars, watchers, forks,
 * open issues) are rendered by `<RepoDetail>`. Watchers reads
 * `repo.watchers`, which the Phase 1 mapper populates from
 * `subscribers_count` — the one line in the codebase that knows about
 * GitHub's `watchers_count` duplicate-of-stars quirk lives at
 * `src/lib/github/repo.ts:103`. This file does not know.
 */

import { notFound } from "next/navigation";

import { RepoDetail } from "@/components/RepoDetail";
import { RateLimitPanel } from "@/components/RateLimitPanel";
import { resolveBackTarget } from "@/lib/backTarget";
import { getRepository } from "@/lib/github/repo";
import type { GitHubFailure } from "@/lib/github/errors";

/** Exhaustiveness helper — a new `GitHubFailure` variant becomes a compile
 *  error here rather than a runtime surprise. */
function assertNever(x: never): never {
  throw new Error(`Unhandled failure code: ${JSON.stringify(x)}`);
}

type Props = {
  /** Next 16 hands async route params as a Promise; await before use. */
  params: Promise<{ owner: string; repo: string }>;
  /** Same for search params. `from` carries the back-link target from Phase 2. */
  searchParams: Promise<{ from?: string | string[] }>;
};

export default async function RepoPage({ params, searchParams }: Props) {
  const { owner, repo } = await params;
  const { from } = await searchParams;

  // No try/catch — a thrown GitHubRequestError must reach error.tsx (D-03).
  const result = await getRepository(owner, repo);

  if (result.ok) {
    return (
      <RepoDetail repo={result.data} backHref={resolveBackTarget(from)} />
    );
  }

  const failure: GitHubFailure = result.error;

  switch (failure.code) {
    case "RATE_LIMIT":
      return <RateLimitPanel resetAt={failure.resetAt} />;
    case "NOT_FOUND":
      // notFound() throws internally so the framework can render not-found.tsx.
      // Its signature is `() => never`, so no `break` is needed and the
      // switch remains exhaustive with no fall-through.
      notFound();
    case "INVALID_QUERY":
      // Defence in depth. repo.ts folds blank owner/repo into NOT_FOUND today
      // so this branch is unreachable, but leaving it unhandled would be a
      // compile error the day the mapping changes — better a real handler.
      notFound();
    default:
      return assertNever(failure);
  }
}
