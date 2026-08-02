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
 *
 * ## The submit button
 *
 * The debounce alone works, but it gives the user nothing to aim at: there is
 * no visible affordance saying "this is a search", and pressing Enter — the
 * thing everyone does in a search box — did nothing at all before the button
 * existed. A real `<form>` with a `type="submit"` button fixes both at once,
 * because implicit form submission is what makes Enter work; there is no
 * `onKeyDown` handler here and there should not be one. Hand-rolling Enter
 * would duplicate behaviour the platform already provides and would miss the
 * button, IME composition, and the search landmark that come with the form.
 *
 * Submitting navigates immediately rather than waiting out the debounce, and
 * it deliberately still uses `replace` — a `push` here would mean searching by
 * button produced a history entry while searching by typing did not, so Back
 * would behave differently depending on how the user got there. Both paths go
 * through `navigate` so they cannot disagree about what URL a keyword maps to.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildSearchUrl,
  SORT_OPTIONS,
  type SearchSort,
} from "@/lib/searchUrl";

type SearchInputProps = {
  /** The keyword already present in the URL when the page first renders. */
  initialQuery: string;

  /** The ordering already present in the URL when the page first renders. */
  sort: SearchSort;

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
  sort,
  debounceMs = 300,
}: SearchInputProps) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, debounceMs);
  const router = useRouter();
  const inputId = useId();
  const sortId = useId();
  // Skip the initial-mount replace: the URL already reflects `initialQuery`,
  // and rewriting it would trigger a needless render.
  const firstRender = useRef(true);

  /**
   * The one place a keyword becomes a URL. Both the debounce and the submit
   * button call this, so the two paths cannot drift apart.
   */
  const navigate = useCallback(
    (keyword: string, nextSort: SearchSort) => {
      // Always page 1: a new keyword or a new ordering makes the old page
      // number meaningless, and page 7 of a re-sorted list is not where the
      // user was.
      const target = buildSearchUrl({ q: keyword, page: 1, sort: nextSort });

      // replace, not push (D-03) — a keystroke must not become a history entry.
      router.replace(target);
    },
    [router]
  );

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    navigate(debouncedQuery, sort);
  }, [debouncedQuery, sort, navigate]);

  return (
    <form
      role="search"
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        // Without this the form does a full page reload and the App Router
        // never sees the navigation.
        event.preventDefault();
        // Navigate on the current value rather than the debounced one: the
        // user pressed Enter, they should not wait out a timer they cannot
        // see. A pending debounce may still fire afterwards, but it resolves
        // to this same keyword and therefore this same URL.
        navigate(query, sort);
      }}
    >
      <label htmlFor={inputId} className="text-sm">
        キーワード
      </label>

      <div className="flex gap-2">
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="キーワードを入力"
          aria-label="リポジトリを検索"
          className="min-w-0 flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          type="submit"
          className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-950"
        >
          検索
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={sortId} className="text-sm">
          並び替え
        </label>
        {/*
          The select is driven by the `sort` prop — the URL — not by local
          state, so it cannot desynchronise from what is actually rendered.
          Browser Back to a differently-sorted URL re-renders the server
          component with a new prop and the control follows it for free.

          Navigating on change rather than requiring a second click on 検索:
          a sort control that needs confirming reads as broken. The keyword
          comes from `query` (what the user sees), not `debouncedQuery`,
          so re-sorting mid-typing keeps the visible keyword.
        */}
        <select
          id={sortId}
          value={sort}
          onChange={(event) => navigate(query, parseSortValue(event.target.value))}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}

/**
 * Narrows the `<select>`'s `string` value back to `SearchSort`.
 *
 * The DOM types `event.target.value` as `string` even though the options are
 * generated from `SORT_OPTIONS`. Rather than assert with `as`, look the value
 * up in the same array the options came from — the runtime check and the type
 * narrowing are then the same fact, and a value that is somehow not in the
 * list falls back instead of being trusted.
 */
function parseSortValue(value: string): SearchSort {
  const match = SORT_OPTIONS.find((option) => option.value === value);
  return match ? match.value : SORT_OPTIONS[0].value;
}
