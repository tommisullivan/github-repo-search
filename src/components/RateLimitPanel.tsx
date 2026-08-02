/**
 * `<RateLimitPanel>` — the rate-limit state renderer.
 *
 * This exists as a component the *page* renders because Phase 1's client
 * returns `RATE_LIMIT` as a `Result` failure rather than throwing (D-01 /
 * D-05a, see `src/lib/github/errors.ts` header). In production, Next
 * sanitises server errors before the client error boundary receives them, so
 * per-state UI inside `error.tsx` would work in development and silently
 * degrade to one generic message once deployed — the exact bug class Phase 1
 * designed the hybrid model to avoid.
 *
 * Every string is Japanese; the time is formatted in Asia/Tokyo because the
 * reviewers are Japanese engineers and the app has no server-side signal that
 * would justify anything else. "20:14 UTC" is not actionable in Tokyo.
 *
 * A missing `GITHUB_TOKEN` raises the limit (Phase 1 D-15), but D-16 keeps
 * that notice server-side only — the copy here does not say "set a token",
 * because a user cannot act on that. It explains what happened and when to
 * retry, and that is the whole job.
 */

import Link from "next/link";

/** Instantiated once, at module scope. `hour12: false` and Tokyo timezone are
 *  the two non-defaults that matter here. */
const RESET_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
});

type Props = {
  /** Unix seconds — the shape Phase 1's client returns. */
  resetAt: number;
};

export function RateLimitPanel({ resetAt }: Props) {
  // Unix seconds → milliseconds. Multiplying inside the render is fine; the
  // formatter memoises internally.
  const formattedTime = RESET_TIME_FORMAT.format(new Date(resetAt * 1000));

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        GitHub APIの利用制限に達しました
      </h1>

      <p className="text-base leading-7 text-zinc-700 dark:text-zinc-300">
        しばらくお待ちください。{formattedTime}（日本時間）以降に再度お試しいただけます。
      </p>

      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        GitHubの匿名アクセスは1時間あたりのリクエスト数が制限されています。時間が経てば自動的に復帰します。
      </p>

      <div className="pt-2">
        <Link
          href="/"
          className="text-sm text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          検索に戻る
        </Link>
      </div>
    </section>
  );
}
