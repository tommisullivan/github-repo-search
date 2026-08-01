# Requirements: github-repo-search

**Defined:** 2026-08-01
**Core Value:** A reviewer can search for a repository, open its detail page, and find the code behind it clear, correct, and production-minded — including when the GitHub API fails or rate-limits.

## v1 Requirements

### API Integration

- [ ] **API-01**: Typed GitHub client wraps `search/repositories` and `repos/{owner}/{repo}` with explicit response types
- [ ] **API-02**: HTTP failures map to typed errors (rate limit, not found, validation, network) rather than raw throws
- [ ] **API-03**: Optional `GITHUB_TOKEN` read server-side only, never exposed to the client, documented in `.env.example`
- [ ] **API-04**: Empty or whitespace-only queries are guarded before the request (GitHub returns 422, not an empty list)
- [ ] **API-05**: Responses are cached via Next's fetch cache to reduce rate-limit pressure

### Search

- [ ] **SRCH-01**: User can enter a keyword and see matching repositories
- [ ] **SRCH-02**: Each result shows repository name, owner, primary language, and star count
- [ ] **SRCH-03**: The keyword and page live in the URL query string, so results are shareable and the back button works
- [ ] **SRCH-04**: User can page through results (GitHub caps at 1000 results)
- [ ] **SRCH-05**: Input does not fire one request per keystroke

### Detail

- [ ] **DTL-01**: Selecting a repository navigates to its own route — a page, never a modal
- [ ] **DTL-02**: Detail page shows name, owner avatar, language, stars, watchers, forks, and open issues
- [ ] **DTL-03**: Watcher count uses `subscribers_count`, with the REST `watchers_count` duplication documented
- [ ] **DTL-04**: A detail URL can be opened directly or refreshed and renders correctly
- [ ] **DTL-05**: User can navigate back to results without losing their search

### UX & Resilience

- [ ] **UX-01**: Loading state while search and detail data resolve
- [ ] **UX-02**: Empty-result state that tells the user what to do next
- [ ] **UX-03**: Network and API failures render a usable error state — never a raw error or stack trace
- [ ] **UX-04**: Rate limiting (403/429) is identified specifically, not shown as "no results"
- [ ] **UX-05**: Unknown owner/repo renders a not-found page
- [ ] **UX-06**: Keyboard operable with labelled controls and correct heading structure
- [ ] **UX-07**: Layout works on mobile and desktop widths

### Testing

- [ ] **TEST-01**: Unit tests for the GitHub client including every error-mapping branch
- [ ] **TEST-02**: Component tests for search and detail covering happy path plus at least one failure path each
- [ ] **TEST-03**: E2E test covering search → detail navigation, with the GitHub API mocked
- [ ] **TEST-04**: Coverage threshold enforced in CI

### CI

- [x] **CI-01**: Every PR runs lint, typecheck, unit tests, and build
- [x] **CI-02**: E2E runs in CI against a mocked API so runner rate limits cannot cause flakes
- [x] **CI-03**: Security scanning — CodeQL SAST, `npm audit`, and secret scanning
- [x] **CI-04**: Dependabot keeps dependencies current
- [x] **CI-05**: Automated accessibility check (axe)

### Documentation

- [ ] **DOC-01**: README covers setup, the optional token, and the reasoning behind key decisions
- [ ] **DOC-02**: AI usage logged per process in Japanese and English
- [x] **DOC-03**: `docs/ARCHITECTURE.md` explains structure, data flow, and rejected alternatives

## v2 Requirements

Deferred. Tracked but not in the current roadmap.

### Persistence

- **FAV-01**: User can save favourite repositories
- **FAV-02**: User can see recent search history

### Operations

- **OPS-01**: Error tracking (Sentry) wired to the App Router error boundaries
- **OPS-02**: DAST against a deployed preview
- **OPS-03**: SBOM generation and container scanning

## Out of Scope

| Feature | Reason |
|---------|--------|
| User authentication / GitHub OAuth | Not in the brief; public search needs no identity |
| Database (Mongo/Postgres) | Nothing to persist; worsens local setup; reads as over-engineering |
| Favourites / history in v1 | The only features that would justify a datastore — not requested |
| DAST in CI | No auth, session, or datastore to attack; would find header config only |
| Elaborate visual design | Brief states design is not evaluated |
| Deployment pipeline | Deployment is not mentioned in the brief |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOC-03 | Phase 0 | Complete |
| CI-01 | Phase 0 | Complete |
| CI-02 | Phase 0 | Complete |
| CI-03 | Phase 0 | Complete |
| CI-04 | Phase 0 | Complete |
| CI-05 | Phase 0 | Complete |
| API-01 | Phase 1 | Pending |
| API-02 | Phase 1 | Pending |
| API-03 | Phase 1 | Pending |
| API-04 | Phase 1 | Pending |
| API-05 | Phase 1 | Pending |
| TEST-01 | Phase 1 | Pending |
| SRCH-01 | Phase 2 | Pending |
| SRCH-02 | Phase 2 | Pending |
| SRCH-03 | Phase 2 | Pending |
| SRCH-04 | Phase 2 | Pending |
| SRCH-05 | Phase 2 | Pending |
| UX-01 | Phase 2 | Pending |
| UX-02 | Phase 2 | Pending |
| UX-03 | Phase 2 | Pending |
| UX-04 | Phase 2 | Pending |
| DTL-01 | Phase 3 | Pending |
| DTL-02 | Phase 3 | Pending |
| DTL-03 | Phase 3 | Pending |
| DTL-04 | Phase 3 | Pending |
| DTL-05 | Phase 3 | Pending |
| UX-05 | Phase 3 | Pending |
| TEST-02 | Phase 3 | Pending |
| UX-06 | Phase 4 | Pending |
| UX-07 | Phase 4 | Pending |
| TEST-03 | Phase 4 | Pending |
| TEST-04 | Phase 4 | Pending |
| DOC-01 | Phase 4 | Pending |
| DOC-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0 ✓

**Phase distribution:**

| Phase | Requirements | Count |
|-------|--------------|-------|
| Phase 0 — Foundation & CI | DOC-03, CI-01..CI-05 | 6 |
| Phase 1 — GitHub API Client | API-01..API-05, TEST-01 | 6 |
| Phase 2 — Search Experience | SRCH-01..SRCH-05, UX-01..UX-04 | 9 |
| Phase 3 — Repository Detail Page | DTL-01..DTL-05, UX-05, TEST-02 | 7 |
| Phase 4 — Quality Gate & Submission Readiness | UX-06, UX-07, TEST-03, TEST-04, DOC-01, DOC-02 | 6 |

---
*Requirements defined: 2026-08-01*
*Last updated: 2026-08-01 after roadmap creation*
