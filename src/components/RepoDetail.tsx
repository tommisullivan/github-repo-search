/**
 * `<RepoDetail>` — presentation for the repository detail route.
 *
 * A Server-Component-compatible pure presentation component. No data fetching,
 * no `"use client"`, no side effects. The boundary lint rule
 * (`project/presentation-layer-boundary` in `eslint.config.mjs`) forbids this
 * file from importing `@/lib/github/client` — the units, not the transport, are
 * the app's contract.
 *
 * `repo.watchers` is not `watchers_count`. The mapping happens in exactly one
 * place — `src/lib/github/repo.ts:103` — where `subscribers_count` becomes
 * `watchers`. GitHub's REST `watchers_count` duplicates `stargazers_count`, so
 * a reader who reached for the obvious field would render the star count twice
 * under two labels. The `RepoDetail` type has no `watchersCount` member at all,
 * so the trap is closed by the type and not by a comment. The comment stays
 * anyway because the next reader deserves to know the reason without leaving
 * the file.
 *
 * `next.config.ts` allowlists exactly one image host for the avatar — see
 * SEC-02 in `docs/SECURITY.md`. A `next/image` `src` outside that allowlist
 * fails at build time, which is the property that keeps the app from becoming
 * an open image proxy.
 */

import Image from "next/image";
import Link from "next/link";

import type { RepoDetail as RepoDetailType } from "@/types/github";

/** Module-scope so it's built once, not per render. `ja-JP` gives the
 *  thousands grouping a reviewer expects: 12,345 rather than 12345. */
const NUMBER_FORMAT = new Intl.NumberFormat("ja-JP");

type Props = {
  repo: RepoDetailType;
  /** The pre-validated back-link `href`. The caller runs `resolveBackTarget`
   *  on the untrusted `?from=` query param; this component takes only the
   *  post-guard value so it cannot be routed off-origin by construction. */
  backHref: string;
};

function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}

export function RepoDetail({ repo, backHref }: Props) {
  const languageLabel = repo.language ?? "言語情報なし";

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
      <nav aria-label="ページナビゲーション">
        <Link
          href={backHref}
          className="text-sm text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          戻る
        </Link>
      </nav>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Image
          src={repo.owner.avatarUrl}
          alt={`${repo.owner.login} のアバター`}
          width={64}
          height={64}
          priority
          className="h-16 w-16 flex-shrink-0 rounded-full"
        />
        <div className="flex flex-col gap-1">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {repo.owner.login}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {repo.name}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {repo.fullName}
          </p>
        </div>
      </header>

      {repo.description !== null ? (
        <p className="text-base leading-7 text-zinc-700 dark:text-zinc-300">
          {repo.description}
        </p>
      ) : null}

      {/* Region rather than list, because <dl> has no default `list` role and
          giving one to a <ul> would misrepresent the structure. The region is
          labelled by its heading. */}
      <section
        role="region"
        aria-labelledby="stats-heading"
        aria-label="リポジトリ統計"
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        <h2 id="stats-heading" className="sr-only">
          リポジトリ統計
        </h2>

        <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            スター
          </span>
          <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {formatNumber(repo.stars)}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            ウォッチャー
          </span>
          <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {/* repo.watchers is subscribers_count (Phase 1 mapping) — see
                header comment. */}
            {formatNumber(repo.watchers)}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            フォーク
          </span>
          <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {formatNumber(repo.forks)}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            オープンなIssue
          </span>
          <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {formatNumber(repo.openIssues)}
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          主要言語
        </span>
        <span className="text-base text-zinc-900 dark:text-zinc-50">
          {languageLabel}
        </span>
      </section>

      <footer className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <a
          href={repo.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          GitHubで開く
        </a>
      </footer>
    </article>
  );
}
