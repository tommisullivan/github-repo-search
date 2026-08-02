"use client";

/**
 * Route-scoped error boundary for the repository detail route.
 *
 * Next requires `"use client"` on `error.tsx` — the reset button needs to
 * bind an interactive handler. This is the only client boundary in Phase 3.
 *
 * Reached by anything thrown from the page: a transport fault, the 5s
 * timeout, any 5xx, or a malformed JSON body. Phase 1 D-03 / D-05a is
 * deliberate here — those are the failures with no useful branch, so a
 * generic Japanese retry message is the complete answer. `RATE_LIMIT`,
 * `NOT_FOUND` and `INVALID_QUERY` are returned as values by the client and
 * never reach this file (see `src/lib/github/errors.ts` header for why).
 *
 * `error.message` and `error.stack` are never rendered. Production Next
 * sanitises them, but the copy does not depend on that. `error.digest` is
 * shown so a reviewer can correlate a user's report with the server logs
 * — its only value.
 */

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DetailError({ error, reset }: Props) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        問題が発生しました
      </h1>

      <p className="text-base leading-7 text-zinc-700 dark:text-zinc-300">
        リポジトリ情報の取得中に問題が発生しました。しばらくしてから再度お試しください。
      </p>

      {error.digest !== undefined ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          エラーID: {error.digest}
        </p>
      ) : null}

      <div className="pt-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          再試行
        </button>
      </div>
    </section>
  );
}
