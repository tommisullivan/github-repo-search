# AI Usage Log

A per-process record of how AI was used on this project. The Japanese version is at [AI-USAGE.ja.md](./AI-USAGE.ja.md) and carries identical content.

## Rules

- **Every time a process is completed, append to both this file and the Japanese version.** Update them before finishing the process and committing.
- Each entry must include: process number, date, AI tool used, what was delegated to AI, what the human decided, and how it was reviewed.
- Record honestly whether AI output was accepted as-is or modified.
- Write the entry during the process, not retroactively in bulk.

---

## Process 1: Understanding the spec and building the base

- **Date:** 2026-08-01
- **Tool:** Claude Code (Claude Opus 5)
- **Delegated to AI:**
  - Read the assignment page and extracted the requirements (Next.js v16+, App Router, detail view as a page rather than a modal, test code required, production-minded implementation).
  - Scaffolded the base project via `create-next-app` (Next.js 16.2.12 / App Router / TypeScript strict / Tailwind CSS v4 / `src` directory / `@/*` alias).
  - Set up the test harness — Vitest + React Testing Library (jsdom) — plus one smoke test to prove it runs.
  - Pinned the Node.js version (`.nvmrc` at 20.20.1; the default Node 18 cannot run Next.js 16).
  - Resolved the `postcss` / `sharp` advisories reported by `npm audit` by raising them to patched versions through `overrides` in `package.json`, confirming 0 vulnerabilities.
- **Human decisions:** No features and no architecture were built in this process. Scope was deliberately limited to the base environment, because **architecture will be worked through by a human together with AI in the next process.**
- **Review:** Verified that `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass.

---

## Process 2: Project rules (`AGENTS.md`) and AI documentation workflow

- **Date:** 2026-08-01
- **Tool:** Claude Code (Claude Opus 5)
- **Delegated to AI:**
  - Wrote `AGENTS.md`, the repo's rules file, covering: assignment constraints, build/test commands, tech stack, coding standards (TypeScript, React/Next conventions, naming, file layout), required error and edge-case handling, GitHub API rules and rate limits, testing standards, git conventions, and an explicit "do not" list.
  - Recorded the dependency decisions that are easy to lose — why `overrides` exist in `package.json`, and why npm overrides require a clean reinstall to take effect.
  - Documented which agents this project uses, and which it deliberately does not (see below).
  - Set up this two-file AI usage log and the rule that every process appends to both files before being committed.
- **Human decisions:**
  - Required that AI usage be documented **per process** rather than summarised once at the end, so the record reflects what actually happened at each step.
  - Required a Japanese log for submission plus an English mirror.
  - Chose to keep `AGENTS.md` in English — it is read by agents, not by reviewers, and English is faster and cheaper to process. Submission-facing docs stay in their intended language.
- **Review:** Rules were checked against the assignment brief for contradictions. No application code was changed in this process.

### Why `AGENTS.md` exists

Claude Code loads `AGENTS.md` (via `CLAUDE.md`) automatically at the start of every session. Without it, each new session re-derives the project's conventions from scratch and drifts — most dangerously on the constraints that are invisible in the code, such as "the detail view must be a page, not a modal." Putting the rules in the repo makes them durable across sessions, and reviewable like any other file.

### Why the agent roster is scoped

The global Claude Code configuration exposes a large set of agents and skills built for other projects (planning suites, marketing, mobile). Most are irrelevant here and only add noise and cost. `AGENTS.md` therefore names the small set that is actually useful for this repo — exploration, planning, TDD, debugging, verification, and browser testing — and states that agents must inherit the project's constraints and that their reported results are re-verified locally rather than trusted.

---

<!-- Append the next process here -->
