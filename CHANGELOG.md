# Changelog

Notable changes to UTSAV AI are recorded here. The project does not publish tagged releases yet; entries describe source snapshots. The package version is declared in [package.json](package.json).

## [Unreleased]

### Added

- GitHub Actions workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) that runs `npm ci`, type checking, linting, tests, and the production build on pushes and pull requests to `main`.
- GitHub issue forms for bug reports and feature requests, a pull request template, [`SECURITY.md`](SECURITY.md), and [`CONTRIBUTING.md`](CONTRIBUTING.md).
- Screenshots of the running application in [`docs/screenshots/`](docs/screenshots/), captured from the bundled sample workspace: dashboard, Budget Planner, Event Rescue proposal, Risk Intelligence, AI Planner unavailable state, and compact layout.

### Changed

- README now includes CI and technology badges, a screenshot tour, repository automation details, and links to the contribution, security, and changelog documents.
- Removed outdated statements that the repository had no CI workflow or screenshots.

### Security

- Documented private vulnerability reporting and the project's security scope, privacy limits, and known gaps.

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

- No event deletion, accounts, cloud sync, payments, vendor integrations, live weather, or booking confirmation.
- No hosted deployment or verified public URL.
- AI provider behavior was verified with mocked tests only; no live-provider call is claimed.
- The production build is a single JavaScript chunk, and there is no committed browser E2E suite.
- No license has been chosen; see the README license section.
