/**
 * Dedicated panel for the `RATE_LIMIT` failure.
 *
 * Server Component. Never rendered as "no results" — the two states use
 * different components, different ARIA roles, and different copy. This is
 * UX-04's mitigation at the render layer.
 *
 * The message tells the user *when* to retry (D-11, D-23), computed from
 * `resetAt` — the Unix-seconds timestamp GitHub returned on the 403/429.
 */

type RateLimitPanelProps = {
  /** Unix seconds at which the caller may try again (from `x-ratelimit-reset`). */
  resetAt: number;

  /**
   * Current time in Unix seconds. **Required** — this component is pure by
   * design (a Server Component that may re-render), so it cannot call
   * `Date.now()` itself (react-hooks/purity would fail). The calling page
   * samples the clock once per request and passes it in; a test passes a
   * fixed value.
   *
   * This is also why the panel receives `resetAt` and `now` separately
   * rather than a pre-computed minute count — the two are the raw signals,
   * and the panel does the formatting so the copy stays colocated with the
   * only component that uses it.
   */
  now: number;
};

export function RateLimitPanel({ resetAt, now }: RateLimitPanelProps) {
  const secondsRemaining = resetAt - now;

  return (
    <section
      role="alert"
      className="mx-auto max-w-2xl p-6 flex flex-col gap-2 border border-amber-400 rounded-md bg-amber-50 dark:bg-amber-950/30"
    >
      <h2 className="text-lg font-semibold">アクセス制限中</h2>
      {secondsRemaining <= 0 ? (
        <p className="text-sm">
          現在リトライ可能です。もう一度検索してください。
        </p>
      ) : (
        <p className="text-sm">
          GitHubのAPIレート制限に達しました。あと約
          {Math.max(1, Math.ceil(secondsRemaining / 60))}
          分後にリトライ可能です。
        </p>
      )}
    </section>
  );
}
