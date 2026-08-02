"use client";

/**
 * App Router error boundary — catches anything the server render throws,
 * including the `GitHubRequestError` that `githubFetch` raises for transport
 * faults, timeouts, and 5xx responses.
 *
 * Must be a Client Component; the App Router does not permit a Server
 * Component here. Every user-facing string is a fixed Japanese literal — the
 * error object is never interpolated into the DOM (AGENTS.md: "Never render a
 * raw error object or stack trace to the user"). `error.digest` is logged to
 * the console for developer correlation with server logs, not shown.
 */

import { useEffect } from "react";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Diagnostic only — Next already writes the error to stderr on the server;
    // this line surfaces it in the browser console for local debugging.
    // Never rendered into the DOM.
    console.error(error);
  }, [error]);

  return (
    <section
      role="alert"
      className="mx-auto max-w-2xl p-6 flex flex-col gap-4"
    >
      <h1 className="text-2xl font-semibold">エラーが発生しました</h1>
      <p className="text-base">
        ネットワークまたはGitHub側の一時的な問題により、検索を完了できませんでした。少し時間をおいて再度お試しください。
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="self-start rounded-md border border-zinc-400 px-4 py-2 text-base hover:bg-zinc-100 dark:hover:bg-zinc-900"
      >
        再試行
      </button>
    </section>
  );
}
