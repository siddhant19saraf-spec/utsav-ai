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
- Focused Event Rescue tests for the extracted request form (saved and analysis-only protections, minimum-floor visibility, error wiring, edit/reset/submit callbacks), the approval-gating predicate (missing, infeasible, invalid, unchanged, and valid proposals), and minimum-floor error focus.
- A public static deployment of the built SPA on Qoder Sites at <https://utsav-ai-9evw6i99uw4.qoder.website> over HTTPS. The deployment serves `dist/` with SPA fallback and no Node API, so the AI Planner reports **Unavailable** and the deterministic outline is used.
- An MIT `LICENSE` file; the project is now explicitly reusable with attribution.
- Light, Dark, and System themes. The header toggle switches between light and dark, Settings exposes all three options, and the preference is stored in this browser and applied before first paint. A standalone `ThemeProvider` owns the preference, device-scheme listener, and document class; the pure helpers live in `src/lib/theme.ts`.
- Theme tests: preference parsing and storage, system resolution, document class and browser theme-color application, persistence, and the header and Settings controls.
- Shared-component tests for the `ModalDialog` accessibility shell (label and description wiring, initial focus, Escape close, Tab trap in both directions, backdrop dismissal, scroll-lock and focus restoration) and for `SelectedEventCard` (heading/meta rendering and labeled event switching).
- A workspace-provider regression test that makes the localStorage write fail with a quota error and asserts that the edit stays in memory, the persistence state reports `save-failed` with the actionable message, and the previously saved payload is not corrupted, plus unit tests for the shared form-state helpers.

### Changed

- Added shared `FieldError` and `SelectedEventCard` components, replacing 35 repeated inline error paragraphs and four drifting copies of the selected-event summary card.
- Broke the repository's only circular dependency (`src/types/budget.ts` → `src/types/domain.ts`) by moving the `Money`/`CurrencyCode` contracts into a leaf `src/types/money.ts` module and re-exporting them from `domain.ts`, so all existing importers are unchanged.
- Routed event creation and editing through the shared `ModalDialog` shell instead of a second copy of the focus trap, Escape handling, scroll lock, and dialog labelling.
- Consolidated budget-category cloning and catering-category lookup into `src/lib/eventSnapshot.ts` and `src/features/budget/catering.ts`, removing the rescue engine's and rescue validation's local copies.
- Unified AI client non-OK response handling in one helper so status and plan requests share the same error-envelope parsing, and replaced three avoidable type assertions with validated narrowing.
- Decomposed the 517-line `validateAiPlan` function into focused timeline, task, budget, catering, and risk section validators behind a shared issue collector. Issue order, ids, counts, applyable indexes, and the public API are unchanged; the orchestration function dropped from 517 to roughly 100 lines.
- README now includes CI and technology badges, a screenshot tour, repository automation details, and links to the contribution, security, and changelog documents.
- README now documents the recorded challenge alignment, target persona, problem significance, assumptions, and the deterministic decision-engine boundaries.
- Removed outdated statements that the repository had no CI workflow or screenshots.
- Updated documentation to distinguish the live static deployment from the prepared-but-undeployed Node/Render service: public URL, AI **Unavailable** state, platform-managed HTTPS, observed headers, localStorage limits, and the third-party site watermark.
- Updated the automated baseline to 554 tests across 58 files and recorded the updated route-split build sizes: 452.42 kB entry chunk (132.81 kB gzip), 73.28 kB largest route chunk (18.35 kB gzip), and 57.16 kB CSS (10.16 kB gzip).
- Extracted the identical `?event=<id>` selection rule from the Budget Planner, Timeline, Guests, and Event Rescue pages into `useSelectedEvent`, which resolves the requested event, falls back to the first saved event, and preserves unrelated query parameters when switching with a history replace. Selection semantics are unchanged; the hook adds focused tests for valid, missing, unknown, and empty-workspace cases plus parameter preservation and replace behavior.
- Split the 1,050-line AI plan result into focused presentation, issue-list, validation-summary, suggestion, detail, and approval modules. Rendered markup, accessible names, and the public export are unchanged; the refactor adds a new `src/lib/format.test.ts` regression test for shared count formatting.
- Split the 1,314-line risk engine into five detectors plus shared detection support, the 1,452-line workspace storage module into value parsers, schema validation, salvage, and browser-storage I/O, and the AI planning page into a provider-status panel, request composer, and request-lifecycle page. Public exports, storage keys, rendered markup, accessible names, and behaviour are unchanged.
- Split the 950-line Event Rescue page into a request-form component, an analysis-result panel, and the remaining page state machine. Field ids and the minimum-field id builder are exported once from `rescueForm.ts` and shared with the page's validation-focus logic, so the form and focus code cannot drift; rendered markup, ids, accessible names, focus behavior, and announcements are unchanged.
- Added one `isApprovableProposal` rule used by the result badge, analysis announcement, proposal controls, and approval gating, replacing four handwritten copies of the same feasibility, validation, and change-count checks. Replaced the last two direct `toLocaleString('en-IN')` count formats with the shared cached `formatCount` helper.
- Consolidated `Intl` number and date formatters into module-level caches, and replaced per-module count formatters with the shared helpers in `src/lib/format.ts`. This removes repeated formatter construction during render without changing output.
- Removed unreferenced code (`ModulePlaceholder`, `todayIsoString`, `compareLocalDateTime`, `addMinutesToLocalDateTime`, `taskPriorityTones`, `missingProviderMessage`) and corrected stale user-facing copy that referred to earlier development steps.
- Dark-mode token roles: badge and panel tints darken while text and accent mid-tones lighten, destructive buttons use dedicated `rust-800`/`rust-900` tokens so white labels stay readable, and the permanently dark navigation rail uses theme-independent `nav-*` tokens.
- Consolidated the five form dialogs (event, budget category, guest, task, activity) onto a shared `FormErrorSummary` banner and the `clearFieldError`/`firstInvalidField` helpers in `src/lib/formState.ts`, replacing five drifted copies of the alert markup, error-clearing reducer, and first-invalid focus scan. Field ids, messages, `aria-invalid`/`aria-describedby` wiring, and focus targets are unchanged; the budget-category banner now uses the same styling as the dialog banners.
- Replaced nine `as unknown as Record<string, unknown>` assertions in the budget validator with a checked `asRecord` read, so malformed category or reserve values are handled as validation input rather than bypassing the type system. Validation rules, issue codes, and messages are unchanged.
- Extracted the identical rescue/AI post-approval commit protocol in `WorkspaceProvider` into one `commitApproval` helper: state is replaced and the persistence status cleared only after the atomic save succeeds, and a persistence failure surfaces `save-failed` without mutating the workspace or recording the approval.
- Removed a redundant `AiPlanRequest` assertion from the AI request handler; schema `safeParse` already narrows the request to the shared contract type.
- Updated the automated baseline to 561 tests across 59 files and the recorded local build sizes: 452.58 kB entry chunk (132.90 kB gzip), 73.28 kB largest route chunk (18.34 kB gzip), and 57.16 kB CSS (10.16 kB gzip).

### Fixed

- A late AI response could attach to the wrong saved event. The request composer stays editable while a provider or fallback request is pending, so changing the saved event mid-request left the earlier response free to render against the newly selected event. The page now stamps each request with a monotonic sequence number, discards responses whose sequence is no longer current, and announces that the in-flight request was discarded. A regression test holds a provider response open, switches events, then releases it and asserts that no proposal appears. `src/features/ai/AiPlanningPage.tsx`, `src/features/ai/AiPlanningPage.test.tsx`.
- Stabilized the lazy-route app-shell test after an intermittent timeout under full-suite CPU contention: the lazy-page lookup budget is now 10 seconds and the affected test budgets 25 seconds. Assertions were unchanged; the test still fails if a route does not render. `src/app/App.test.tsx` passed 5/5 in isolation and the full 549-test suite passed on four consecutive runs after the change.
- Saved Event Rescue proposal snapshots were skipped during workspace load because the loader capped the stored `originalEventSignature` at 200 characters while the real canonical event signature is roughly 2,400–2,500 characters. The cap is now 65,536, and a round-trip regression test saves and reloads a snapshot carrying the full signature.
- The selected-event picker's hint text is now associated with the select through `aria-describedby`, so screen readers announce the guidance when the control receives focus. The regression test asserts the accessible description.

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
