<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# github-repo-search

## Build & Test
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Test: `npm test` (watch: `npm run test:watch`)

## Tech Stack
- Next.js 16 (App Router), React 19, TypeScript strict
- Tailwind CSS v4
- Vitest + React Testing Library (jsdom)
- Node 20.20.1 (see `.nvmrc`)

## Assignment Constraints (non-negotiable)
- Next.js v16+ and the App Router. Do not add the Pages Router.
- Repository detail must be a **page** (its own route), never a modal.
- Ship test code alongside features.
- Production-minded: handle loading, empty, error, and rate-limit states.
- Any AI usage must be documented (see the AI usage rule below).

## AI 利用記録のルール（必須）

**1 工程（プロセス）が完了するたびに、AI をどのように利用したかをドキュメントへ追記すること。**

- 追記先は 2 ファイル。**両方を必ず同時に更新する**：
  - `docs/AI-USAGE.ja.md`（日本語・提出用）
  - `docs/AI-USAGE.en.md`（英語・同一内容）
- 記載必須項目：工程番号／日付／使用した AI ツール／AI に任せた範囲／人間が判断した範囲／レビュー方法。
- 更新のタイミングは **その工程のコミット前**。後からまとめて書かない。
- AI の出力をそのまま採用したか、修正したかを正直に記載する。

> 課題要件：「AI を利用した場合は、README に使用方法をまとめること」。`README.md` は上記 2 ファイルを参照する形で運用する。

## Agent Directives
- Run `npm test`, `npm run lint`, and `npm run typecheck` after every significant change.
- Design is not graded; prioritise usability and clarity over visual polish.
- Before committing a process, update `docs/AI-USAGE.ja.md` **and** `docs/AI-USAGE.en.md`.
