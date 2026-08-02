/**
 * App Router loading boundary — shown while a server render resolves.
 *
 * Server Component by design (no `"use client"`). The role="status" element is
 * what a screen reader announces during the wait, so this boundary carries the
 * accessibility contract for UX-01 rather than a visual spinner. Phase 4's a11y
 * audit inherits this.
 */
export default function Loading() {
  return (
    <p
      role="status"
      aria-label="読み込み中"
      className="p-6 text-sm text-zinc-600 dark:text-zinc-400"
    >
      読み込み中…
    </p>
  );
}
