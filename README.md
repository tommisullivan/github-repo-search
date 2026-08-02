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
- 実際の値をコミットしてはいけません。設定方法は [`.env.example`](./.env.example) を参照してください。

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

**人間が判断したこと。** 認証を作らないこと、DAST を行わないこと、観測ツールを無料・セルフホスト可能なものに限ること、UI を日本語・コードを英語とすること、AI 利用を工程ごとに両言語で記録すること、根拠が不明な場合は捏造せず人間に確認するというルール、そして**エージェントは決してマージしない**というルール。すべての PR は人間がレビューし、人間がマージしました。ライセンスファイルの選定も人間の判断事項として保留しています。

なお、**MongoDB を入れないという判断は AI の提案であり、人間の発案ではありません。** 本アプリは GitHub API への読み取り専用の中継であり永続化する状態を持たないため不要である、という理由を AI が示し、人間がそれを妥当と認めて承認しました。誰が何を決めたかを正確に残すため、ここは「人間が判断したこと」から外してあります。

**どう検証したか。** 各フェーズの完了時に 7 つのゲートコマンド（`lint` / `typecheck` / `test:coverage` / `build` / `test:e2e` / `test:a11y` / `npm audit`）をすべて実行し、出力を読んだ上で結果をログに記録しました。AI の出力は主張であって検証済みの結果ではない、という原則を通しています。CI（lint・型検査・カバレッジ閾値付きテスト・ビルド・E2E・axe・CodeQL・シークレットスキャン）が全 PR をゲートします。

### 開発ワークフロー — GSD Pi

本プロジェクトの進め方は [**GSD Pi**](https://github.com/open-gsd/gsd-pi)（`@opengsd/gsd-pi`、v1.11.0）に沿っています。エージェントが長時間の作業でも全体像を見失わないようにするための、メタプロンプティングとコンテキスト設計、そして仕様駆動開発のためのシステムです。作業は**フェーズ**に分割され、各フェーズは「議論 → 計画 → 実装 → 検証」という同じ形をとり、その成果物（要件・ロードマップ・フェーズ計画・実装サマリー・レビュー）はすべて `.planning/` にコミットされます。本リポジトリの `.planning/` ディレクトリがその実物です。

採用した理由は 4 つあります。

1. **コードより先に計画を文書化させる。** 実装に入る前に方針をレビューできる。実装しながら方針が判明する、という進め方を避けられます。
2. **課題が要求する監査証跡が副産物として残る。** 本課題は AI 利用を工程ごとに記録することを求めており、GSD Pi のフェーズ構造がその単位をそのまま与えてくれます。
3. **AI の作業をレビュー可能な大きさに保つ。** フェーズ単位なら人間が実際に読める差分に収まります。巨大で不透明な 1 つの変更にはなりません。
4. **セッションをまたいでも一貫する。** 状態が `.planning/` にあるため、新しいセッションが文脈を再構築せずに続きから作業できます。

### Superpowers スキルとの併用（今後の可能性）

もう 1 つの選択肢として **Superpowers** 系のスキル群があります（`test-driven-development`、`systematic-debugging`、`verification-before-completion`、`brainstorming`、`writing-plans` など。本リポジトリの [`AGENTS.md`](./AGENTS.md) でも一部を採用しています）。こちらは*一つひとつの作業のやり方*を規律づけるもので、GSD Pi が担う*プロジェクト全体の構造化*とは目的が異なります。

**今回 GSD Pi を選んだのは、いま必要だったのが一貫性であり、TDD を全面的な手法として採る段階ではなかったからです。** 両者は排他ではありません。今後は GSD Pi をフェーズ管理の骨格として使いつつ、各フェーズの内側で TDD やデバッグのスキルを呼び出す、という組み合わせが自然です。骨格と作業手順はそれぞれ別の問題を解いています。

### 今後の自動化の可能性（未実装）

以下はいずれも**本プロジェクトでは実装していません。**現時点での構想として記載します。

- **Jira / Notion などのプロジェクト管理ツールとの連携。** `.planning/` のフェーズとチケットは粒度がほぼ一致します。フェーズ作成時にチケットを起票し、PR のマージでステータスを更新し、AI 利用ログの該当エントリをチケットに添付すれば、監査証跡がリポジトリの外からも追えるようになります。現在は人間が両方を見比べています。
- **CodeRabbit などの AI コードレビューとの連携。** PR に AI レビューアを接続すると、その指摘を人間だけでなくエージェントも読めるようになります。指摘を読む → 修正を適用する → 再度検証する、というループを自動化すれば、機械的な指摘は人間のレビュー前に片付きます。
- **境界は変えません。** 自動化するのは修正の*提案*までです。本リポジトリの「**エージェントは決してマージしない**」という規則は変わりません。CI が緑であることは必要条件であって十分条件ではなく、その変更が正しい判断だったかを言えるのは人間だけです。

### 本番環境で AI エージェントをどう使うか（本課題の範囲外）

本課題は単一のアプリケーションですが、同じ考え方は実務にも延長できます。要点は「一体の万能エージェント」ではなく、**役割ごとに分けた小さなエージェントを、それぞれ責務と権限を限定して置く**ことです。責務が狭いほど、出力が正しいかを人間が判断しやすくなります。

- **可観測性エージェント。** アラートやエラー率の異常を検知した時点で、Jira チケットを自動起票する。単に「500 が増えた」と書くのではなく、発生時刻・影響範囲・関連するデプロイやリリースを添える。**コードベースへの読み取り権限を与えられる場合は、原因と思われる箇所（ファイル・関数・直近の該当コミット）までチケットに書ける**ため、担当者は調査の起点をゼロから探さずに済みます。さらに踏み込めば修正 PR の下書きまで作れますが、そこまで許すかは会社の方針次第です。
- **トリアージ／オンコール支援。** 受け取ったアラートを重大度で分類し、既知の障害や過去のインシデントと突き合わせ、重複を束ねる。深夜に人間が最初に読むべき 1 件を選ぶ作業は、機械のほうが安定します。
- **依存関係の更新エージェント。** Dependabot が上げた PR に対し、破壊的変更の追従修正を当て、テストを走らせ、何が変わったかを PR に書く。放置されがちで、しかし放置すると危険な領域です。
- **リリースノート／変更履歴。** マージ済み PR から利用者向けの記述を生成する。事実はすべて履歴の中にあり、書き写す作業だけが残っています。
- **ドキュメントの乖離検出。** コードと README・仕様書がずれた箇所を指摘する。本リポジトリでも「Phase 3 で解決済みなのに『Phase 3 の課題だから未対応』と書かれたままのコメント」が実際に発生しました（`ResultList.tsx` のアバターの件）。

**エージェントの種類そのものより、その周囲の条件のほうが重要です。**

- **権限は最小限に、そして明示的に決める。** エージェントにコードベースを読ませるか否かは、技術的な問いというより機密情報と知的財産の問いです。「会社によりけり」は後回しにしてよい細部ではなく、前提条件そのものです。
- **運用面の自動復旧と、コード変更は別の話。** サービスの再起動、デプロイのロールバック、トラフィックの切り替え、インスタンスの入れ替え — これらは可逆で、挙動がよく理解されており、影響範囲も限定されます。しかも自動化しなければ、10 分後に人間が深夜に同じ操作をするだけです。この領域の自動化はすでに確立した実務であり、クラウド事業者も長くその基盤を提供しています。ここに AI エージェントの権限を認めてよいかは、エージェントの性能よりも**その周囲のプロセスがどれだけ成熟しているか**で決まります — 対処によって事態が悪化したことを検知できる指標があるか、切り戻しは自動か、影響範囲に上限があるか、いずれにせよ人間が呼び出されるか、何をなぜ実行したかの記録が残るか。これらが既に整っている組織であれば、同じ権限をエージェントに広げることは飛躍ではなく延長線上の一歩です。整っていないのであれば、先に手を入れるべきはエージェントではありません。
- **コード変更のほうが基準は厳しい。** 正しさをヘルスチェックの指標で確認することはできませんし、誤った変更は誤った再起動ほどきれいにロールバックできません。修正を提案し、適用は人間が行う、という既定値のほうが安全です。本リポジトリの「エージェントは決してマージしない」と同じ理由です。
- **エージェントにも監査証跡を。** どのエージェントが、いつ、何を根拠にそう判断したかが残らなければ、レビューのしようがありません。本リポジトリの AI 利用ログと同じ発想です。
- **ノイズは注意力というコストを消費する。** 精度の低いチケットを大量に起票するエージェントは、置かないほうがましになり得ます。人間の注意力こそが希少な資源だからです。導入初期は「起票せず提案だけ」から始め、精度を測ってから権限を広げると、そのコストが見える形で管理できます。

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
- Never commit a real value. See [`.env.example`](./.env.example) for setup.

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

**What the human decided.** Building no authentication; running no DAST; restricting observability tooling to free and self-hostable options; Japanese UI with English code; logging AI usage per process in both languages; the rule that an unknown rationale must be asked for, never invented; and the rule that **an agent never merges**. Every PR was reviewed and merged by a human. The choice of a LICENSE file also remains a flagged human decision.

For accuracy about who decided what: **leaving MongoDB out was the AI's proposal, not the human's.** The AI argued it was unnecessary — the app is a read-only pass-through to the GitHub API with no state to persist — and the human agreed and approved. It is listed here rather than above because attributing it to the human would overstate the human's role.

**How it was verified.** At the close of every phase, all seven gate commands (`lint` / `typecheck` / `test:coverage` / `build` / `test:e2e` / `test:a11y` / `npm audit`) were run and their output read before the results were recorded in the log. The governing principle: an AI's output is a claim, not a verified result. CI (lint, typecheck, coverage-gated tests, build, E2E, axe, CodeQL, secret scanning) gates every PR.

### Development workflow — GSD Pi

The way this project was run follows [**GSD Pi**](https://github.com/open-gsd/gsd-pi) (`@opengsd/gsd-pi`, v1.11.0): a meta-prompting, context-engineering and spec-driven development system built so an agent can work for long stretches without losing the big picture. Work is split into **phases**, each taking the same shape — discuss → plan → execute → verify — and every artefact (requirements, roadmap, phase plans, implementation summaries, reviews) is committed under `.planning/`. The `.planning/` directory in this repository is that record.

Four reasons it was chosen:

1. **It forces a written plan before code.** The approach is reviewable before anything is implemented, rather than being discovered mid-build.
2. **It produces the audit trail the brief demands as a by-product.** The assignment requires AI usage logged per process; GSD Pi's phase structure supplies exactly that unit.
3. **It keeps AI work in reviewable chunks.** A phase is small enough for a human to actually read, instead of one large opaque change.
4. **It stays consistent across sessions.** State lives in `.planning/`, so a new session resumes without re-deriving context.

### Superpowers skills alongside GSD (a future possibility)

The other approach available is the **Superpowers** family of skills — `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `brainstorming`, `writing-plans` and others, some of which this repository's [`AGENTS.md`](./AGENTS.md) already adopts. Those discipline *how an individual piece of work is carried out*, which is a different problem from the *project-level structure* GSD Pi provides.

**GSD Pi was chosen this time because what was needed was consistency, not a TDD-first method.** The two are not mutually exclusive. The natural next step is to keep GSD Pi as the phase-level skeleton while invoking the TDD and debugging skills *inside* each phase — skeleton and working method solve different problems.

### Where this could go next (not implemented)

None of the following is built in this project. It is recorded as intent, not as fact.

- **Connecting to Jira, Notion or a similar project-management tool.** A phase in `.planning/` and a ticket are close to the same granularity. Creating a ticket when a phase is opened, updating its status when the PR merges, and attaching the matching AI-usage entry would make the audit trail followable from outside the repository. Today a human reconciles the two by eye.
- **Connecting an AI code reviewer such as CodeRabbit to the PR.** With one attached, its findings become readable by an agent as well as a human — enabling a loop of read the finding, apply the fix, re-verify, so that mechanical comments are resolved before a human review begins.
- **The boundary does not move.** Automation would extend only as far as *proposing* fixes. This repository's rule that **an agent never merges** stands. Green CI is necessary, not sufficient: only a human can say the change was the right call.

### Using AI agents in a production environment (outside the scope of this assignment)

This assignment is a single application, but the same thinking extends to real operations. The useful shape is not one all-purpose agent; it is **several small agents, each with a narrow role and explicitly limited permissions**. The narrower the responsibility, the easier it is for a human to judge whether the output is right.

- **An observability agent.** When it detects an alert or an anomalous error rate, it opens a Jira ticket automatically — not just "500s are up", but with the time, the blast radius, and the deploy or release that correlates. **Where it is allowed read access to the codebase, it can name the likely location in the ticket** — file, function, the recent commit that touched it — so whoever picks it up does not start the investigation from nothing. Further still, it can draft a fix PR; how far that is permitted is a company decision.
- **Triage / on-call support.** Classify incoming alerts by severity, match them against known issues and past incidents, and collapse duplicates. Choosing the one page a human should read first at 3am is work a machine does more consistently than a tired person.
- **A dependency-upgrade agent.** Take the PR Dependabot raised, apply the follow-up changes a breaking release requires, run the tests, and write up what changed. It is work that gets deferred and is dangerous to defer.
- **Release notes and changelogs.** Generate the user-facing description from merged PRs. Every fact is already in the history; only the transcription is left.
- **Documentation-drift detection.** Flag where code and the README or specs have diverged. This repository produced a real instance: a comment saying a thing was "deliberately not here because that is Phase 3's concern" survived Phase 3 shipping (the avatars in `ResultList.tsx`).

**What matters more than the list of agents is the conditions around them.**

- **Least privilege, decided explicitly.** Whether an agent may read the codebase is less a technical question than a confidentiality and IP one. "It depends on the company" is not a detail to settle later; it is the precondition.
- **Operational remediation is a different case from code changes.** Restarting a service, rolling back a deploy, shifting traffic, replacing an instance — these are reversible, well understood, and bounded in blast radius, and the alternative is often a person performing the identical action ten minutes later at 3am. Automating them is established practice, and the cloud providers have shipped the primitives for it for years. Whether an AI agent can be given that authority depends much less on the agent than on **how mature the process around it already is**: is there a health signal that would notice the action made things worse, does reversal happen automatically, is the blast radius capped, is someone paged regardless, and is there a record of what was done and why. Where those are already in place, extending the same authority to an agent is an incremental step rather than a leap. Where they are not, the agent is not the thing to fix first.
- **Code changes are the stricter case.** Correctness cannot be confirmed by a health metric, and a bad change is not undone by a rollback as cleanly as a bad restart is. Proposing the fix and leaving a human to apply it remains the safer default — the same reasoning as this repository's never-merge rule.
- **Agents need an audit trail too.** If there is no record of which agent concluded what, when, and on what evidence, there is nothing to review. Same idea as the AI usage log here.
- **Noise costs attention.** An agent filing many low-precision tickets can be worse than no agent, because attention is the scarce resource. Starting in propose-only mode, measuring precision, and widening permissions afterwards keeps that cost visible.

## Notes

- `next@16.2.12` pins `postcss@8.4.31` and `sharp@0.34.5`, which carry known advisories. The same fix upstream applies in its unreleased 16.3 previews is applied here via `overrides` in `package.json` — `npm audit` reports 0 vulnerabilities.
