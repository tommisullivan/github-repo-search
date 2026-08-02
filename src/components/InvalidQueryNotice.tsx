/**
 * Notice for the two distinguishable causes of `INVALID_QUERY`.
 *
 * Server Component. Deliberately takes a `reason` prop rather than the raw
 * `GitHubFailure` code — the page decides which case it is (the blank-keyword
 * and out-of-range-page guards run before any request), and the component
 * renders the copy the page picks. Sharing one message across both causes
 * would confuse a reviewer probing `?page=99999` (valid keyword, invalid page)
 * with the blank-keyword case; this is the D-08/D-09 fix from the phase
 * context that closes the Phase 1 STATE.md pending item.
 */

type InvalidQueryNoticeProps = {
  reason: "blank" | "out-of-range";
};

export function InvalidQueryNotice({ reason }: InvalidQueryNoticeProps) {
  return (
    <section
      role="status"
      className="mx-auto max-w-2xl p-6 flex flex-col gap-2"
    >
      {reason === "blank" ? (
        <>
          <h2 className="text-lg font-semibold">
            キーワードを入力してください
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            リポジトリを検索するには、上の入力欄にキーワードを入力してください。
          </p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold">
            検索できるページを超えています
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            GitHub検索APIは最大1000件までしか結果を返しません。ページ番号を1〜50の範囲で指定してください。
          </p>
        </>
      )}
    </section>
  );
}
