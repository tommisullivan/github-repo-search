/**
 * Suspense fallback for the repository detail route.
 *
 * The App Router shows this while the Server Component's data fetch is
 * outstanding. Nothing interactive belongs here — the state exists for a
 * fraction of a second on a warm route and for the full 5s timeout at the
 * edge of that budget on a cold, uncached one.
 *
 * `role="status"` + `aria-live="polite"` announces the change to assistive
 * technology without interrupting other announcements. That is the minimum
 * for UX-06 (Phase 4) but costs nothing to ship now.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-2xl items-center justify-center px-4 py-16 text-sm text-zinc-600 dark:text-zinc-400 sm:px-6"
    >
      読み込み中…
    </div>
  );
}
