# github-repo-search

GitHub リポジトリ検索アプリ / A GitHub repository search app — Next.js 16 (App Router) + TypeScript strict.

**日本語** | [English](#english)

---

## 概要

キーワードで GitHub のリポジトリを検索し、選択したリポジトリの詳細を専用ページで表示するアプリケーションです。エンジニア選考課題として、本番投入を想定した品質で実装しています。

ビューは 2 つです。

| ビュー | ルート | 内容 |
| --- | --- | --- |
| 検索 | `/` | キーワード入力（デバウンス付き）、結果一覧、ページネーション。キーワードとページ番号は `?q=…&page=…` として URL に保持 |
| 詳細 | `/repos/{owner}/{repo}` | リポジトリ名、オーナーのアバター、言語、Star 数、Watcher 数、Fork 数、Open Issue 数。モーダルではなく独立したルート |

## セットアップ

Node.js は **24.18.1** が必要です（`.nvmrc` で固定、`package.json` の `engines` でも強制）。Node 18 は EOL であり、Next.js 16 を実行できません。

```bash
nvm use          # Node 24.18.1 に切り替え
npm install
npm run dev      # http://localhost:3000
```

### コマンド一覧

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | ユニット / コンポーネントテスト（Vitest、1 回実行） |
| `npm run test:coverage` | カバレッジ付きテスト — CI はこれで閾値（92/90/85/92）を強制 |
| `npm run test:e2e` | Playwright E2E（モック化した GitHub API に対して実行） |
| `npm run test:a11y` | axe によるアクセシビリティ検査（7 つの描画状態すべて） |

## `GITHUB_TOKEN`（任意）

トークンなしでも全機能が動作します。設定すると GitHub API のレート制限が緩和されます（未認証: 検索 約 10 リクエスト/分・REST 60 リクエスト/時 → 認証済み: 検索 約 30 リクエスト/分・REST 5,000 リクエスト/時）。

- **サーバーサイド専用**です。`NEXT_PUBLIC_` を付けてはならず、クライアントバンドルには決して到達しません（GitHub への通信はすべて Server Component 上で行われます）。
- 実際の値をコミットしてはいけません。`.env*` は `.gitignore` の対象で、[`.env.example`](./.env.example) だけが例外的にコミットされます。

### 設定手順

1. **トークンを発行します。** GitHub の [Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) から作成します。**スコープ（権限）は一つも不要です。** 本アプリは公開リポジトリを読むだけで、認証済みリクエストであれば権限の有無にかかわらず上限が緩和されます。付けるスコープが少ないほど、漏洩したときの被害も小さくなります。

2. **テンプレートをコピーして環境変数ファイルを作ります。** ファイル名は `.env.local` です（Next.js がローカル開発で読み込むファイル名。`.env.example` はテンプレートであり、そのままでは読み込まれません）。

   ```bash
   cp .env.example .env.local
   ```

3. **作成した `.env.local` にトークンを記入します。** 引用符もスペースも不要です。

   ```
   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   ```

4. **開発サーバーを再起動します。** 環境変数は起動時に読み込まれるため、起動中に書き換えても反映されません。

起動時に `Environments: .env.local` と表示されれば読み込まれています。値が空、あるいはファイル名が違う場合でもアプリはエラーにならず、未認証のまま（低い上限で）動作します。レート制限に頻繁に当たる場合は、まずこのファイル名を確認してください。

## 主要な設計判断とその理由

### データベースも認証も持たない

このアプリに永続化するデータはありません — データは GitHub が持っています。データベースを足すとローカルセットアップが悪化し、レビュアーには過剰設計と映ります。認証も課題に含まれず、公開リポジトリの検索に身元は不要です。攻撃対象となる認証・セッション・データストアが存在しないことは、そのままセキュリティ上の利点でもあります（詳細: [`docs/SECURITY.md`](./docs/SECURITY.md)）。

### Watcher 数は `subscribers_count` を使う

GitHub REST API には罠があります。**検索・詳細 API が返す `watchers_count` は `stargazers_count` の複製**であり、実際の Watcher 数ではありません。課題は Star 数と Watcher 数を別々の必須項目として挙げているため、素直に `watchers_count` を表示すると同じ数字が 2 回並び、バグに見えます。本当の Watcher 数は詳細エンドポイント（`GET /repos/{owner}/{repo}`）にのみ存在する `subscribers_count` です。本アプリはこれをマッピングし、ドメイン型には `watchersCount` というメンバー自体を持たせないことで、誤ったフィールドを描画する間違いを型レベルで塞いでいます。理由の詳細はコード側（`src/lib/github/repo.ts` と `src/components/RepoDetail.tsx` のコメント）にも記載しており、E2E テストは Star 数とは異なる Watcher 数がエンドツーエンドで描画されることを固定値で検証します。

### DAST（動的スキャン）を行わない

デプロイ先がなく、攻撃対象となる認証・セッション・データストアも存在しないため、ベースラインスキャンはヘッダー設定の報告以外に何も返しません。代わりに CI で CodeQL（SAST）、`npm audit`（脆弱性 0 件を維持）、シークレットスキャンを実行しています。DAST は v2 項目として記録しています。

### Next / React 以外の本番依存関係はゼロ

ライブラリよりプラットフォームを優先します。デバウンスは `setTimeout` の 12 行のフック、ログは `console.log` + `JSON.stringify`、URL 構築は `URLSearchParams`、E2E の GitHub API モックも依存関係を追加せず `instrumentation.ts` の fetch インターセプタで実装しました。依存関係の追加は「詳細」ではなく「判断」であり、追加するたびにサプライチェーン面と `npm audit` の監視対象が増えるためです。

### URL を状態とする

検索キーワードとページ番号はコンポーネントの状態ではなく URL のクエリ文字列に置きます。共有したリンク・リロード・ブラウザの戻るボタンのすべてで同じ結果が再現されるのは、URL だけがその 3 つを生き延びる状態の置き場所だからです。

## エラー処理は機能である

データを描画するすべてのビューが、以下の 5 状態を個別に処理します。レート制限が「結果 0 件」として表示されることはありません。

| 状態 | 表示 |
| --- | --- |
| ローディング | `loading.tsx` によるスケルトン |
| 結果 0 件 | 次の行動を示す空状態メッセージ |
| ネットワーク障害 | `error.tsx` による再試行可能なエラー状態（スタックトレースは表示しない） |
| レート制限（403/429） | 制限中であることの明示と、再試行可能になる時刻（Asia/Tokyo 表記）。制限中のリクエストは決して再試行しない |
| 404（存在しないリポジトリ） | 専用の not-found ページ |

## 技術スタック

| 領域 | 選択 |
| --- | --- |
| フレームワーク | Next.js 16.2.12（App Router、Server Components 中心） |
| UI | React 19、Tailwind CSS v4 |
| 言語 | TypeScript（strict） |
| テスト | Vitest 4 + React Testing Library / Playwright（E2E・axe） |
| ランタイム | Node 24.18.1（`.nvmrc`） |

UI 文言はすべて日本語、コード・コメント・コミットはすべて英語です。

### ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | システム構成、データフロー、却下した代替案 |
| [`docs/TESTING.md`](./docs/TESTING.md) | テスト層、モック境界、カバレッジ閾値、必須の失敗系 5 種 |
| [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) | 構造化ログ、レート制限監視、タイムアウト・リトライ方針 |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | 脅威モデル、トークン取り扱い、CSP を含むレスポンスヘッダー |
| [`AGENTS.md`](./AGENTS.md) | コーディング規約とプロジェクトルール |

## AI 利用について（要約）

本プロジェクトは AI（Claude Code）を全面的に活用して開発しました。以下はその要約で、工程ごとの詳細な記録は [`docs/AI-USAGE.ja.md`](./docs/AI-USAGE.ja.md)（日本語）/ [`docs/AI-USAGE.en.md`](./docs/AI-USAGE.en.md)（英語、同一内容）にあります。

**AI に委ねたこと。** 計画ドキュメント（要件・ロードマップ・フェーズごとの実装計画）の作成、GitHub クライアント・検索・詳細ページ・テスト・セキュリティヘッダーの実装、テストコードの作成（機能と同一 PR で、テストファーストの工程を含む）、設計ドキュメントの執筆と実測（Next.js の fetch キャッシュ挙動や CSP 違反は推測でなく計測で確認）。作業は GSD という構造化ワークフローで工程に分割し、各工程の完了時に AI 利用ログへ「何をしたか」だけでなく「なぜそうしたか」「却下した代替案とその理由」を記録しました。

**人間が判断したこと。** データベース（MongoDB 提案)の却下、認証を作らないこと、DAST を行わないこと、観測ツールを無料・セルフホスト可能なものに限ること、UI を日本語・コードを英語とすること、AI 利用を工程ごとに両言語で記録すること、根拠が不明な場合は捏造せず人間に確認するというルール、そして**エージェントは決してマージしない**というルール。すべての PR は人間がレビューし、人間がマージしました。ライセンスファイルの選定も人間の判断事項として保留しています。

**どう検証したか。** 各フェーズの完了時に 7 つのゲートコマンド（`lint` / `typecheck` / `test:coverage` / `build` / `test:e2e` / `test:a11y` / `npm audit`）をすべて実行し、出力を読んだ上で結果をログに記録しました。AI の出力は主張であって検証済みの結果ではない、という原則を通しています。CI（lint・型検査・カバレッジ閾値付きテスト・ビルド・E2E・axe・CodeQL・シークレットスキャン）が全 PR をゲートします。

## 補足

- `next@16.2.12` が固定する `postcss@8.4.31` と `sharp@0.34.5` には既知のアドバイザリがあります。上流の未リリース 16.3 プレビューと同じ修正を `package.json` の `overrides` で適用しており、`npm audit` は脆弱性 0 件です。

---

<a id="english"></a>

# English

## Overview

A GitHub repository search application: type a keyword, search the GitHub API, and open a selected repository's details on its own page. Built as an engineering selection task, written as if going to production.

There are two views:

| View | Route | Contents |
| --- | --- | --- |
| Search | `/` | Debounced keyword input, result list, pagination. The keyword and page number live in the URL as `?q=…&page=…` |
| Detail | `/repos/{owner}/{repo}` | Repository name, owner avatar, language, stars, watchers, forks, open issues. A dedicated route, never a modal |

## Setup

Node.js **24.18.1** is required (pinned by `.nvmrc`, enforced by `engines` in `package.json`). Node 18 is EOL and cannot run Next.js 16.

```bash
nvm use          # switch to Node 24.18.1
npm install
npm run dev      # http://localhost:3000
```

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit / component tests (Vitest, single run) |
| `npm run test:coverage` | Tests with coverage — CI enforces the thresholds (92/90/85/92) through this |
| `npm run test:e2e` | Playwright end-to-end tests (against a mocked GitHub API) |
| `npm run test:a11y` | axe accessibility checks (all seven render states) |

## `GITHUB_TOKEN` (optional)

Everything works without a token. Setting one raises GitHub's rate limits (unauthenticated: ~10 search requests/min and 60 core REST requests/hour → authenticated: ~30 search requests/min and 5,000 core requests/hour).

- **Server-side only.** It is never prefixed `NEXT_PUBLIC_` and never reaches the client bundle — all GitHub traffic happens in Server Components.
- Never commit a real value. `.env*` is gitignored; only [`.env.example`](./.env.example) is committed, as a template.

### Setting one up

1. **Create the token.** GitHub → [Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens). **No scopes are required.** This app only reads public repositories, and any authenticated request gets the higher limit regardless of what the token is allowed to do. Fewer scopes means less damage if it leaks.

2. **Copy the template to the file Next.js actually reads.** That file is `.env.local` — `.env.example` is a template and is not loaded.

   ```bash
   cp .env.example .env.local
   ```

3. **Put the token in `.env.local`.** No quotes, no spaces.

   ```
   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   ```

4. **Restart the dev server.** Environment variables are read at startup, so editing the file while it runs changes nothing.

You will see `Environments: .env.local` in the startup output when it has been picked up. If the value is empty or the filename is wrong, nothing errors — the app just runs unauthenticated on the lower limits. If you are hitting rate limits often, check the filename first.

## Key decisions, with reasons

### No database, no auth

There is nothing to persist — GitHub owns the data. A database would make local setup worse and read as over-engineering to a reviewer. Authentication is absent from the brief, and public repository search needs no identity. Having no auth, session, or datastore to attack is also a security dividend in its own right (see [`docs/SECURITY.md`](./docs/SECURITY.md)).

### Watchers come from `subscribers_count`

The GitHub REST API has a trap: **the `watchers_count` returned by the search and detail APIs is a duplicate of `stargazers_count`**, not the real watcher count. The brief lists stars and watchers as separate required fields, so rendering `watchers_count` naively would show the same number twice and read as a bug. The real watcher count is `subscribers_count`, which exists only on the detail endpoint (`GET /repos/{owner}/{repo}`). This app maps it accordingly, and the domain type has no `watchersCount` member at all, so rendering the wrong field is closed off at the type level. The full reasoning also lives beside the code (comments in `src/lib/github/repo.ts` and `src/components/RepoDetail.tsx`), and the E2E suite asserts with fixed sentinel values that a watcher count distinct from stars renders end to end.

### No DAST

There is no deployment target, and no auth, session, or datastore to attack — a baseline scan would report header configuration and nothing else. Instead, CI runs CodeQL (SAST), `npm audit` (kept at zero vulnerabilities), and secret scanning. DAST is recorded as a v2 item.

### Zero production dependencies beyond Next / React

Platform over library. The debounce is a twelve-line `setTimeout` hook, logging is `console.log` + `JSON.stringify`, URLs are built with `URLSearchParams`, and even the E2E GitHub API mock is a dependency-free fetch interceptor installed via `instrumentation.ts`. Adding a dependency is a decision, not a detail — each one adds supply-chain surface and an `npm audit` line item to watch.

### URL as state

The search keyword and page number live in the URL query string, not in component state. A shared link, a reload, and the browser back button all reproduce the same results — the URL is the only container of state that survives all three.

## Error handling is a feature

Every data-driven view handles all five of these states distinctly. A rate limit is never displayed as "no results".

| State | Rendering |
| --- | --- |
| Loading | Skeleton via `loading.tsx` |
| Empty results | An empty state that tells the user what to do next |
| Network failure | A retryable error state via `error.tsx` (never a stack trace) |
| Rate limit (403/429) | Explicitly identified, with the reset time shown in Asia/Tokyo. A rate-limited request is never retried |
| 404 (unknown repository) | A dedicated not-found page |

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.2.12 (App Router, Server Components first) |
| UI | React 19, Tailwind CSS v4 |
| Language | TypeScript (strict) |
| Tests | Vitest 4 + React Testing Library / Playwright (E2E, axe) |
| Runtime | Node 24.18.1 (`.nvmrc`) |

All user-facing strings are Japanese; all code, comments, and commits are English.

### Documentation

| Document | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System shape, data flow, rejected alternatives |
| [`docs/TESTING.md`](./docs/TESTING.md) | Test layers, mocking boundary, coverage thresholds, the five required failure modes |
| [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) | Structured logging, rate-limit monitoring, timeout and retry policy |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Threat model, token handling, response headers including the CSP |
| [`AGENTS.md`](./AGENTS.md) | Coding standards and project rules |

## AI usage (summary)

This project was developed with extensive use of AI (Claude Code). The summary is below; the full per-process record is in [`docs/AI-USAGE.ja.md`](./docs/AI-USAGE.ja.md) (Japanese) / [`docs/AI-USAGE.en.md`](./docs/AI-USAGE.en.md) (English, identical content).

**What was delegated to AI.** Writing the planning documents (requirements, roadmap, per-phase implementation plans); implementing the GitHub client, search, the detail page, tests, and the security headers; writing test code (in the same PR as each feature, including test-first cycles); and writing the design documents with real measurement — Next.js fetch-cache behaviour and CSP violations were counted and observed, not assumed. Work was split into processes under GSD, a structured workflow, and at the end of every process the AI usage log records not just *what* was done but *why*, including the alternatives rejected and the reasons.

**What the human decided.** Rejecting a database (MongoDB was proposed); building no authentication; running no DAST; restricting observability tooling to free and self-hostable options; Japanese UI with English code; logging AI usage per process in both languages; the rule that an unknown rationale must be asked for, never invented; and the rule that **an agent never merges**. Every PR was reviewed and merged by a human. The choice of a LICENSE file also remains a flagged human decision.

**How it was verified.** At the close of every phase, all seven gate commands (`lint` / `typecheck` / `test:coverage` / `build` / `test:e2e` / `test:a11y` / `npm audit`) were run and their output read before the results were recorded in the log. The governing principle: an AI's output is a claim, not a verified result. CI (lint, typecheck, coverage-gated tests, build, E2E, axe, CodeQL, secret scanning) gates every PR.

## Notes

- `next@16.2.12` pins `postcss@8.4.31` and `sharp@0.34.5`, which carry known advisories. The same fix upstream applies in its unreleased 16.3 previews is applied here via `overrides` in `package.json` — `npm audit` reports 0 vulnerabilities.
