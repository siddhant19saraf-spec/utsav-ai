# Changelog

Notable changes to UTSAV AI are recorded here. The project does not publish tagged releases yet; entries describe source snapshots. The package version is declared in [package.json](package.json).

## [Unreleased]

### Added

- GitHub Actions workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) that runs `npm ci`, type checking, linting, tests, and the production build on pushes and pull requests to `main`.
- GitHub issue forms for bug reports and feature requests, a pull request template, [`SECURITY.md`](SECURITY.md), and [`CONTRIBUTING.md`](CONTRIBUTING.md).
- Screenshots of the running application in [`docs/screenshots/`](docs/screenshots/), captured from the bundled sample workspace: dashboard, Budget Planner, Event Rescue proposal, Risk Intelligence, AI Planner unavailable state, and compact layout.
- Event deletion with explicit confirmation, an affected-record summary, and cascading removal of the event's tasks, guests, activities, catering estimate, risk findings, and rescue-proposal snapshots. Other events are untouched; export remains the recovery path.
- Route-level code splitting so feature pages load on demand instead of in one 840.00 kB JavaScript bundle, with a shell-preserving loading card that exposes a status announcement and respects reduced motion.
- A top-level application error boundary with a focused, safe recovery screen, no raw error detail, retry and reload actions, and confirmed recovery after a forced chunk-load failure.
- A keyboard-activation regression test for the Event Rescue analysis action, verifying that submitting from the keyboard moves focus to the analysis result.
- A public static deployment of the built SPA on Qoder Sites at <https://utsav-ai-9evw6i99uw4.qoder.website> over HTTPS. The deployment serves `dist/` with SPA fallback and no Node API, so the AI Planner reports **Unavailable** and the deterministic outline is used.
- An MIT `LICENSE` file; the project is now explicitly reusable with attribution.

### Changed

- README now includes CI and technology badges, a screenshot tour, repository automation details, and links to the contribution, security, and changelog documents.
- README now documents the recorded challenge alignment, target persona, problem significance, assumptions, and the deterministic decision-engine boundaries.
- Removed outdated statements that the repository had no CI workflow or screenshots.
- Updated documentation to distinguish the live static deployment from the prepared-but-undeployed Node/Render service: public URL, AI **Unavailable** state, platform-managed HTTPS, observed headers, localStorage limits, and the third-party site watermark.
- Updated the automated baseline to 512 tests across 50 files and recorded the route-split build sizes: 448.69 kB entry chunk (131.75 kB gzip), 74.98 kB largest route chunk, and 54.48 kB CSS (9.52 kB gzip).

### Fixed

- Saved Event Rescue proposal snapshots were skipped during workspace load because the loader capped the stored `originalEventSignature` at 200 characters while the real canonical event signature is roughly 2,400–2,500 characters. The cap is now 65,536, and a round-trip regression test saves and reloads a snapshot carrying the full signature.

### Security

- Documented private vulnerability reporting and the project's security scope, privacy limits, and known gaps.
- Recorded that the live static responses were observed without a Content-Security-Policy or `X-Frame-Options`, that the static host serves no `/api` routes, and that no provider call was made.

## [0.1.0] - 2026-10-25

Initial public source snapshot of the PromptWars Virtual — Challenge 5 prototype. No hosted deployment, published package, or supported release exists.

### Added

- Local-first event workspace with create, edit, search, filter, sample-data controls, and per-event isolation.
- Budget Planner with integer-minor-unit arithmetic, protected and flexible categories, minimums, emergency reserve, overrun detection, and deterministic advisory repair with explicit approval.
- Event Rescue with deterministic findings, constrained proposal generation, validation, before/after review, stale and duplicate rejection, and atomic approval.
- Timeline activities with overlap review, and preparation tasks with priorities, due dates, overdue detection, and completion progress.
- Guest and RSVP management plus a deterministic catering estimator that labels assumptions and never invents a vendor price.
- Risk Intelligence with centralized thresholds, stable finding IDs, reconciliation, dismissal history, restore, and proposal-consistency checks.
- Schema-versioned browser persistence with salvage, a recovery copy, and validated workspace JSON export and import.
- Optional AI Planner with a privacy-minimal context, shared Zod contracts, deterministic proposal validation, review-first approval, and a locally generated **Not AI-generated** fallback outline.
- Stateless Node server with a same-origin `/api` provider proxy, request limits, rate limiting, safe errors, a health endpoint, and opt-in production static serving.
- Single-service Render Blueprint, Node version pin, deployment guide, architecture and setup documentation, and a demo script. No deployment was performed.
- Vitest and Testing Library coverage for deterministic rules, persistence, validation, approval, mocked provider failures, and main UI flows.

### Known limitations

- No event deletion at this snapshot (added in Unreleased), accounts, cloud sync, payments, vendor integrations, live weather, or booking confirmation.
- No hosted deployment or verified public URL.
- AI provider behavior was verified with mocked tests only; no live-provider call is claimed.
- At this snapshot the production build was a single JavaScript chunk (route-level code splitting was added in Unreleased), and there is still no committed browser E2E suite.
- No license has been chosen; see the README license section.
