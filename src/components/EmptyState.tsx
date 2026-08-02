/**
 * Zero-results state — a search that legitimately returned zero repositories.
 *
 * Server Component (no `"use client"`); nothing here needs interactivity. The
 * `role="status"` is what a screen reader announces once the render completes,
 * which is when a user knows their search returned nothing — an empty result
 * that a sighted user reads as "no rows" needs to be announced to a screen
 * reader user or the state is silent.
 *
 * Deliberately not confusable with a rate-limit panel: `RateLimitPanel` uses
 * `role="alert"` (announced as an alert), this uses `role="status"` (announced
 * as a passive status). The two states also use distinct copy.
 */
export function EmptyState() {
  return (
    <section
      role="status"
      aria-label="該当するリポジトリが見つかりませんでした"
      className="mx-auto max-w-2xl p-6 flex flex-col gap-2"
    >
      <h2 className="text-lg font-semibold">
        該当するリポジトリが見つかりませんでした
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        別のキーワードを試してください。
      </p>
    </section>
  );
}
