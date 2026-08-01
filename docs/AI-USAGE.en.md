# AI Usage Log

A per-process record of how AI was used on this project. The Japanese version is at [AI-USAGE.ja.md](./AI-USAGE.ja.md) and carries identical content.

## Rules

**Who this log is for:** the engineers reviewing this submission. They are assessing judgement. An entry that records only *what happened* proves nothing — the reasoning is the evidence.

- **Every time a process completes, append to both this file and the Japanese version**, before that process is committed.
- Each entry must include: process number, date, AI tool, what was delegated to AI, **why that approach was taken including alternatives rejected and the reason**, what the human decided, and how it was reviewed (specific commands and results).
- Record honestly whether AI output was accepted as-is or corrected.
- Write the entry during the process, never retroactively in bulk.

**When the "why" is not known, ask the developer — never invent one.** A plausible but fabricated reason is worse than none: it reads convincingly, a reviewer cannot falsify it, and it will not match what the developer says when asked in person. Every reason in this log is one the developer actually gave.

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

### Why GSD as the planning framework

The planning artifacts in `.planning/` were produced with GSD (Get Shit Done), a structured workflow framework. This was the developer's choice, for these reasons:

- **It is the project management tool for this repo.** The project is local-only for now, so there is no Jira board behind it. GSD's `REQUIREMENTS.md`, `ROADMAP.md`, and `STATE.md` serve that role — requirements, phases, and current state tracked in version control alongside the code.
- **It has a migration path to real PM tools.** GSD can be connected to Jira or Notion later, so a product manager writes tickets in the tool they already use and GSD converts each ticket into planned, executable work. Choosing it now does not mean rewriting the process when a team is involved.
- **It is built for production systems, not prototypes.** Engineers at large companies use it precisely because it holds quality high through planning, execution, and verification rather than letting a model improvise.
- **It has a strong code review capability**, which is used as a gate rather than trusting generated code by default.
- **It does not make assumptions.** This is the deciding property. When something is uncertain, GSD checks by default instead of guessing and proceeding — the same discipline this log requires (see "When the 'why' is uncertain, ask" in `AGENTS.md`).
- **It validates its own output automatically.** Validation is a built-in stage, not something remembered by hand: plans are checked against the phase goal before execution, completed work is verified against the requirements it claimed to satisfy, requirement-to-phase coverage is proven rather than assumed, and generated documentation is fact-checked against the actual codebase. Generated output is treated as a claim to verify, never as a finished result.

In short: it works like a scrum team, with the ceremonies and quality gates a scrum team provides, but staffed by AI. For a task judged on production-mindedness, showing that the *process* was structured is part of the evidence, not overhead.

### Note on scope discipline

The brief is short, and the strongest temptation in a task like this is to add things that look impressive — a database, authentication, a caching service. Each was considered and rejected explicitly, with the reasoning written down in `docs/ARCHITECTURE.md` and `.planning/PROJECT.md`. Unnecessary infrastructure is not neutral in a code review; it invites the question "why is this here?", and the honest answer would have been "it isn't needed."

---

## Process 4: Architecture documentation, boundary design, and testing strategy

- **Date:** 2026-08-01
- **Tool:** Claude Code (Claude Opus 5), running GSD's documentation workflow with two documentation sub-agents in parallel
- **Delegated to AI:**
  - First, tightened this log's own standard: "why" became a required field, and a rule was added that when a rationale is not actually known it must be asked for, never invented.
  - Rewrote `docs/ARCHITECTURE.md` with five diagrams — system shape, a structural view down to named functions, an API boundary diagram, and two request sequences covering the success and failure branches.
  - Added an API boundary section defining what each unit owns, may depend on, and must not touch, with the rules framed as code-review rejection criteria.
  - Created `docs/TESTING.md` — the three test layers and their explicit non-responsibilities, the mocking boundary, the five failure modes every feature must cover, the accessibility setup, and the CI gate.
  - Tagged every module in the architecture doc as Built or Planned with its delivery phase.
- **Why this approach:**
  - The app is read-only — no create, update, or delete anywhere, because GitHub owns the data. Its production burden is therefore CI and testing, not application complexity. The architecture document's job is to make the boundaries legible and prove the seams are clean, not to describe intricate logic that does not exist.
  - The GitHub-facing code is split into a Search unit and a Repository unit over a shared, stateless HTTP and error core. The value is that each unit is independently replaceable and neither can reach into the other, so a change to one endpoint cannot ripple through the app. Written as explicit rules because a boundary nobody can check is not a boundary.
  - Documenting the target design while the code is still a scaffold risks implying more exists than does. Marking every part Built or Planned was chosen over both alternatives — describing only the scaffold would have discarded the design reasoning, and describing the target with no markers would have overstated progress.
- **Human decisions:**
  - Rejected generating the full nine-document set. Against a scaffold, most would have been hollow; architecture and testing were the two that carry real information.
  - Required that the boundaries be shown as clean separations without ever labelling them a candidate for splitting into services. The structural property is what matters; speculating about future deployment topology would have been noise.
  - Chose to mark build status explicitly rather than let the document imply completeness.
- **Review:** `npm run lint`, `npm run typecheck`, `npm run test:coverage`, and `npm audit` all pass. The CI job names in the document were checked line by line against `.github/workflows/ci.yml` — all six match. Every Mermaid diagram was parsed with mermaid 11, the version GitHub renders with: 5 of 5 valid.
- **Taken as-is vs modified:** Neither sub-agent's output was taken on trust, and checking them was worthwhile three times over. Both claimed their diagrams were valid; the first verification run failed three of five, which traced to a fault in the verification setup rather than the diagrams — re-run correctly, all five passed. The previous version of the architecture document had described a CI job named `security` that does not exist in the workflow; that was corrected to the six real jobs. Most usefully, the testing sub-agent found a genuine defect in `vitest.config.mts`: the coverage configuration collected `*.spec` files as tests while failing to exclude them from the measured source, so such a file would have counted as fully covered code and silently inflated the coverage figure. Fixed, along with three places where `AGENTS.md` and `README.md` had drifted from the scripts and directories that actually exist.

---

<!-- Append the next process here -->
