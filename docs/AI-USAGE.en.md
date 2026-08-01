# AI Usage Log

A per-process record of how AI was used on this project. The Japanese version is at [AI-USAGE.ja.md](./AI-USAGE.ja.md) and carries identical content.

## Rules

**Who this log is for:** the engineers reviewing this submission. They are assessing judgement. An entry that records only *what happened* proves nothing — the reasoning is the evidence.

- **Every time a process completes, append to both this file and the Japanese version**, before that process is committed.
- Each entry must include: process number, date, AI tool, what was delegated to AI, **why that approach was taken including alternatives rejected and the reason**, what the human decided, and how it was reviewed (specific commands and results).
- Record honestly whether AI output was accepted as-is or corrected.
- Write the entry during the process, never retroactively in bulk.

An entry is finished only when a reviewer could answer "why did they build it this way?" from it alone.

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

## Process 3: Architecture, planning artifacts, and the CI quality gate

- **Date:** 2026-08-01
- **Tool:** Claude Code (Claude Opus 5), including one specialised sub-agent for roadmap generation
- **Delegated to AI:**
  - Read the assignment brief again specifically to confirm what it does *not* say. Confirmed it never mentions authentication, a database, persistence, deployment, or a deadline — so none of those were built.
  - Wrote `docs/ARCHITECTURE.md`: system shape, directory layout, the key decisions with reasoning, a table of rejected alternatives, and local development instructions.
  - Wrote the CI quality gate — `.github/workflows/ci.yml` (lint, typecheck, unit tests with coverage, build, Playwright E2E, axe accessibility, `npm audit`, gitleaks secret scanning, CodeQL SAST) and `.github/dependabot.yml`.
  - Set up the harnesses the workflow depends on: Playwright config, an E2E smoke spec, an axe accessibility spec, Vitest coverage thresholds, and `.env.example`.
  - Produced the planning artifacts: `.planning/PROJECT.md`, `REQUIREMENTS.md` (34 v1 requirements), `config.json`, `ROADMAP.md`, and `STATE.md`. The roadmap was generated by a dedicated sub-agent from the requirements.
- **Human decisions:**
  - **Rejected MongoDB.** It was proposed so that everything could run locally. The app has nothing to persist — GitHub owns the data — and local setup is already zero-service, so a database would make it worse, not better, and would read as over-engineering to a reviewer.
  - **No user authentication.** Absent from the brief, and public repository search needs no identity.
  - **No DAST.** It needs a deployed target, and with no auth, session, or datastore, a baseline scan would report header configuration and nothing else. Recorded as a v2 item instead.
  - Chose scope: the brief's requirements plus the quality work reviewers actually grade — no invented features.
  - Chose coarse roadmap granularity and disabled per-phase research agents, since the domain is small and already well understood.
- **Review:** `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run test:e2e`, and `npm run test:a11y` were each run locally and pass. `npm audit` reports zero vulnerabilities.
- **Taken as-is vs modified:** The sub-agent's roadmap was accepted with one correction. It had marked the CI requirements simply "Complete"; since no GitHub remote exists yet, the workflow has never actually executed. The status was rewritten to state that the scripts pass locally but the workflow YAML is unverified until first push.

### Note on scope discipline

The brief is short, and the strongest temptation in a task like this is to add things that look impressive — a database, authentication, a caching service. Each was considered and rejected explicitly, with the reasoning written down in `docs/ARCHITECTURE.md` and `.planning/PROJECT.md`. Unnecessary infrastructure is not neutral in a code review; it invites the question "why is this here?", and the honest answer would have been "it isn't needed."

---

<!-- Append the next process here -->
