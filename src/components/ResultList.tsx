/**
 * A search-result list — one row per repository.
 *
 * Server Component. Renders the four fields the roadmap requires for a list
 * row (SRCH-02): repository name, owner login, primary language, star count.
 * Owner avatar is deliberately not here — remote images need
 * `images.remotePatterns` allowlisted (SEC-02) which is Phase 3's concern,
 * and the roadmap only asks for an avatar on the detail view (DTL-02).
 *
 * Each row wraps the repository name in a `next/link` pointing at the Phase 3
 * detail route, carrying the current search URL as `?from=…` so the detail
 * page can render a "戻る" link back to the same result page. This is the
 * D-04 contract between Phase 2 and Phase 3.
 */

import Link from "next/link";
import type { RepoSummary } from "@/types/github";

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
            className="p-3 border border-zinc-200 dark:border-zinc-800 rounded-md flex flex-col gap-1"
          >
            <Link
              href={href}
              className="text-base font-semibold text-blue-700 hover:underline dark:text-blue-400"
            >
              {item.fullName}
            </Link>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              <span>
                所有者: <span className="font-medium">{item.owner.login}</span>
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
          </li>
        );
      })}
    </ul>
  );
}
