/**
 * Route-scoped not-found page for `/repos/[owner]/[repo]`.
 *
 * Reached when `page.tsx` calls `notFound()` — which happens on
 * `NOT_FOUND` and `INVALID_QUERY` from `getRepository`. The framework catches
 * the internal throw and renders this component with a real 404 status.
 *
 * Kept plain. The user's next action is to search again, so the only affordance
 * this page needs is a link back to `/`.
 */

import Link from "next/link";

export default function DetailNotFound() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        リポジトリが見つかりません
      </h1>

      <p className="text-base leading-7 text-zinc-700 dark:text-zinc-300">
        指定されたオーナーまたはリポジトリ名が見つかりませんでした。名前をご確認のうえ、もう一度検索してください。
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
