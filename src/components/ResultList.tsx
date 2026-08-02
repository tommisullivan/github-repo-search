/**
 * A search-result list — one row per repository.
 *
 * Server Component. Renders repository name, owner avatar, owner login,
 * primary language and star count for each row (SRCH-02).
 *
 * ## The avatar
 *
 * This file used to say the avatar was "deliberately not here" because remote
 * images need `images.remotePatterns` allowlisted (SEC-02) and that was
 * Phase 3's concern. Phase 3 shipped: `avatars.githubusercontent.com` is
 * allowlisted in `next.config.ts` and `RepoDetail` already renders through
 * `next/image`. The reason had expired, and a row without an avatar was the
 * only place in the app where the owner was text-only. It renders here now,
 * through the same allowlisted host and the same `alt` convention as the
 * detail view — no new host, no new dependency.
 *
 * Each row wraps the repository name in a `next/link` pointing at the Phase 3
 * detail route, carrying the current search URL as `?from=…` so the detail
 * page can render a "戻る" link back to the same result page. This is the
 * D-04 contract between Phase 2 and Phase 3.
 */

import Image from "next/image";
import Link from "next/link";
import type { RepoSummary } from "@/types/github";

/**
 * Rendered size in CSS pixels. Passed to `next/image` as both `width` and
 * `height` so the browser reserves the box before the image arrives — without
 * it, twenty rows reflow as the avatars load.
 */
const AVATAR_SIZE = 40;

type ResultListProps = {
  items: RepoSummary[];
  /**
   * The full URL of the current search view (e.g. `/?q=react&page=2`).
   * Passed straight into `?from=` on each detail link, so a click round-trips
   * back to exactly this state.
   */
  currentSearchUrl: string;
};

export function ResultList({ items, currentSearchUrl }: ResultListProps) {
  return (
    <ul aria-label="検索結果" className="flex flex-col gap-3 p-6">
      {items.map((item) => {
        // Encode each path segment separately. Phase 1's getRepository
        // treats blank arguments as NOT_FOUND but does not defend against
        // unsafe characters in a URL crafted client-side; encoding here is
        // cheap insurance and matches the SEC-03 "never string
        // concatenation" rule.
        const href =
          `/repos/${encodeURIComponent(item.owner.login)}/` +
          `${encodeURIComponent(item.name)}` +
          `?from=${encodeURIComponent(currentSearchUrl)}`;

        return (
          <li
            key={item.id}
            className="p-3 border border-zinc-200 dark:border-zinc-800 rounded-md flex items-start gap-3"
          >
            <Image
              src={item.owner.avatarUrl}
              alt={`${item.owner.login} のアバター`}
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              // shrink-0 so a long repository name cannot squeeze the avatar
              // into an ellipse at narrow widths.
              className="shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800"
            />

            <div className="flex min-w-0 flex-col gap-1">
              <Link
                href={href}
                className="text-base font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                {item.fullName}
              </Link>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                <span>
                  所有者:{" "}
                  <span className="font-medium">{item.owner.login}</span>
                </span>
                <span>
                  言語:{" "}
                  <span className="font-medium">{item.language ?? "-"}</span>
                </span>
                <span>
                  スター:{" "}
                  <span className="font-medium">
                    {item.stars.toLocaleString("ja-JP")}
                  </span>
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
