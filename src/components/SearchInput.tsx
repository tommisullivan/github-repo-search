"use client";

/**
 * Client-side search input.
 *
 * The one Client Component in Phase 2 — everything else on the page is a
 * Server Component. Pushing `"use client"` this far down keeps the GitHub
 * token, the client library, and the result-rendering logic on the server
 * where they belong (AGENTS.md: "push `"use client"` as far down the tree as
 * possible").
 *
 * ## Debounce
 *
 * A local `useDebounce(value, delay)` hook backed by `setTimeout`/
 * `clearTimeout`. **Option B from plan 02-03**, chosen over `useDeferredValue`
 * because the delay must be a real number of milliseconds a test can drive
 * with `vi.advanceTimersByTime`. `useDeferredValue`'s scheduler-driven timing
 * is not controllable from a test, and a controllable delay is the point of
 * the debounce here (SRCH-05 asserts a burst of keystrokes produces one URL
 * change, not four).
 *
 * ## No library
 *
 * `use-debounce`, `lodash.debounce`, or `lodash` would add a dependency, a
 * version to keep current, and an `npm audit` line item for a `setTimeout`
 * and a `clearTimeout`. AGENTS.md says prefer the platform — this hook is
 * the platform.
 *
 * ## router.replace, not router.push
 *
 * A `router.push` on every debounced keystroke would fill the browser
 * history with one URL per keystroke and the back button would traverse
 * them one at a time (D-03). `replace` rewrites the current entry.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchInputProps = {
  /** The keyword already present in the URL when the page first renders. */
  initialQuery: string;

  /**
   * Debounce delay in milliseconds. Defaults to 300 (D-17 — long enough that
   * a normal typing burst fires one request, short enough that the result
   * feels immediate). A test passes 0 to synchronise assertions.
   */
  debounceMs?: number;
};

/**
 * Debounces `value` by `delay` milliseconds. On every new `value`, cancels
 * the pending timer and schedules a new one; the returned state settles to
 * the latest value only after `delay` of quiet.
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function SearchInput({
  initialQuery,
  debounceMs = 300,
}: SearchInputProps) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, debounceMs);
  const router = useRouter();
  // Skip the initial-mount replace: the URL already reflects `initialQuery`,
  // and rewriting it would trigger a needless render.
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    const trimmed = debouncedQuery.trim();
    const target =
      trimmed === ""
        ? "/"
        : `/?q=${encodeURIComponent(trimmed)}&page=1`;

    // replace, not push (D-03) — a keystroke must not become a history entry.
    router.replace(target);
  }, [debouncedQuery, router]);

  return (
    <input
      type="search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder="キーワードを入力"
      aria-label="リポジトリを検索"
      className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}
