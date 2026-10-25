# UTSAV AI — Feature Status

This file records what is implemented, what has been verified, and what is intentionally absent. Statuses are based on source inspection and the automated tests in this repository. A feature is not considered verified merely because it has a UI element.

**Last reviewed:** 2026-10-25
**Verified environment:** Node.js v24.16.0, npm 11.13.0
**Automated baseline:** 496 tests across 47 files passed; typecheck, lint, and build passed; `npm audit` reported 0 vulnerabilities.

## Status definitions

| Status | Meaning |
| --- | --- |
| **Implemented and verified** | Code exists, core behavior is covered by automated tests, and no blocking defect was found during documentation review. UI-level manual browser checks were performed during development where noted. |
| **Implemented but not fully verified** | Code exists, but verification is incomplete because of environment limits, partial automation, or coverage that does not establish the claim broadly. |
| **Partial** | Only part of the intended behavior exists. No feature below uses this status; scope exclusions are listed as **Not implemented** instead. |
| **Requires external configuration** | Code exists but cannot be exercised end-to-end without an external service, credential, model, or configuration. The tests may cover it with mocks. This is not a claim that a real provider was used. |
| **Prepared, not deployed** | Configuration, build settings, or hosting files exist, but no external service has been created, no public URL has been verified, and no platform-side behavior is claimed. |
| **Not implemented** | No working implementation exists. Planned work is explicitly separated from current behavior. |

## Core planning features

| Feature | Status | What exists | Evidence and scope |
| --- | --- | --- | --- |
| Application shell and routes | **Implemented and verified** | Nine navigation destinations: Overview, My Events, Budget Planner, Event Rescue, Timeline, Guests, Risk Intelligence, AI Planner, Settings; 404 route; responsive mobile navigation with focus restoration. | `src/app/App.test.tsx` (4 tests); source inspection of `src/app/App.tsx` and `src/components/navigation.ts`. |
| Overview dashboard | **Implemented and verified** | Saved-workspace summaries, selected-event focus, event cards, open/completed task controls, upcoming activities, guest and catering metrics, risk early-warning links, sample empty states. | `src/features/dashboard/DashboardPage.test.tsx` (11 tests), `selectors.test.ts` (22 tests). |
| Event creation | **Implemented and verified** | Validated creation of user events with category, date, venue, expected guests, budget total, setting, theme, accessibility, and contingency fields. | `src/features/events/eventForm.test.ts` (14 tests), `EventsPage.test.tsx` (6 tests), `eventMutations.test.ts` (5 tests). |
| Event editing | **Implemented and verified** | Edits the selected event only, preserves budget categories, protection rules, reserve, setting, theme, accessibility/contingency answers, status, origin, record ID, and timestamps where appropriate. A changed date must be today or later; an unchanged saved past date remains editable. | `EventsPage.test.tsx`; `eventForm.test.ts`; `eventMutations.test.ts`; browser checks during development. |
| Event search and status filters | **Implemented and verified** | Search by event text and filter by planning status, with an honest empty-filter state. | `eventFilters.test.ts` (7 tests), `EventsPage.test.tsx`. |
| Event deletion | **Not implemented** | Events can be created and edited but not deleted. This is deliberate in the current prototype; no recovery UI exists for deletion. | No delete action in `eventMutations.ts` or event UI. |
| Sample workspace controls | **Implemented and verified** | First run seeds labelled sample events; Settings can add samples again or remove only sample-origin records, preserving user-created data. | `DashboardPage.test.tsx` sample-data tests; `SettingsPage.test.tsx` (4 tests); `WorkspaceProvider` / workspace reducer tests. |
| Budget Planner | **Implemented and verified** | Per-event total, allocated categories, planned/actual money, protected and flexible categories with minimum floors, emergency reserve, utilisation/overrun/variance, category add/edit/remove with confirmation. | `BudgetPlannerPage.test.tsx` (8 tests); `calculations.test.ts` (27 tests); `validation.test.ts` (13 tests); `budgetForm.test.ts` (15 tests); `mutations.test.ts` (10 tests). |
| Budget repair proposal | **Implemented and verified** | Deterministic, advisory repair that reduces only eligible flexible categories, respects minimums and protections, never changes the total, and applies only after review/approval. Reports infeasible cases without inventing money. | `repair.test.ts` (9 tests); `BudgetPlannerPage.test.tsx` approval and infeasible-repair tests. Greedy, not claimed optimal. |
| Emergency reserve | **Implemented and verified** | A protected category with fixed ID `emergency-reserve`; enabling/disabling goes through protected allocation changes; reserve is part of planned expenditure, not additional money. | `BudgetPlannerPage.test.tsx` reserve test; budget calculation and mutation tests. |
| Event Rescue | **Implemented and verified** | Saved-event analysis, deterministic findings, constrained proposal, before/after comparison, validation report, remaining issues, explicit accept/reject/return, stale and duplicate rejection, atomic persistence. | `rescueEngine.test.ts` (18 tests); `rescueApproval.test.ts` (8 tests); `EventRescuePage.test.tsx` (5 tests); `rescueForm.test.ts` (6 tests). The documented Ananya budget-reduction scenario was also verified in a fresh browser profile on 2026-10-25. |
| Rescue external verification | **Not implemented** | Rescue does not contact vendors, verify booking availability, check live weather, or confirm venue accessibility. Catering recalculation is a proportional planning assumption, not a quote. | Source inspection of `src/features/rescue/`; UI disclosures. |
| Timeline activities | **Implemented and verified** | Local date-time start/end validation, chronological sorting, status filtering, creation/editing/completion/reopen/confirmed deletion, overlap review with both saved times unchanged. | `TimelinePage.test.tsx` (5 tests); `activityRules.test.ts` (11 tests). |
| Automatic overlap resolution | **Not implemented** | Overlaps are review prompts only; the app does not silently move, merge, or delete activities. | Source and tests confirm overlaps are surfaced but not auto-resolved. |
| Preparation tasks | **Implemented and verified** | Create/edit/complete/reopen/delete with confirmation; priorities, due dates, assignee/description options, sorting/filtering, overdue detection, completion progress, event-scoped lists. | `TimelinePage.test.tsx`; `taskRules.test.ts` (15 tests); dashboard task tests. |
| Task reminders and notifications | **Not implemented** | No email, push, browser notification, calendar reminder, or background job exists. | No notification integration in source. |
| Guest management and RSVP | **Implemented and verified** | Create/edit/search/filter guests, RSVP statuses pending/confirmed/declined, dietary preference, accessibility request, notes, per-event isolation, explicit-confirmation deletion. | `GuestsPage.test.tsx` (7 tests); `guestRules.test.ts` (9 tests). |
| Invitations and guest messaging | **Not implemented** | The app does not send invitations, email, SMS, or messages. Guest email is not collected by new guest forms and is retained only for legacy records. Guest data stays local. | Source inspection of guest forms/context. |
| Catering estimator | **Implemented and verified** | Confirmed RSVPs when guest records exist, otherwise expected guest count as an estimate; whole-percent buffer rounded up; per-person integer-minor-unit assumption; budget comparison; saved per event. | `cateringEstimator.test.ts` (9 tests); `GuestsPage.test.tsx` catering panel tests. Results are assumptions, not vendor quotes. |
| Risk Intelligence | **Implemented and verified** | Deterministic detection across financial, scheduling, guest-catering, venue-contingency, and proposal-consistency categories; evidence, severity, certainty, filters, event scope, recommended actions. | `riskEngine.test.ts` (35 tests); `RiskIntelligencePage.test.tsx` (7 tests); `riskSelectors.test.ts` (18 tests); `riskState.test.ts` (6 tests). |
| Risk reconciliation and dismissal history | **Implemented and verified** | Stable IDs; open findings update in place; resolved findings remain in history; reappearing issues reopen; dismissed findings stay dismissed until fingerprint changes; explicit undo/restore; no duplicate open findings. | `riskReconciliation.test.ts` (15 tests); `RiskIntelligencePage.test.tsx` dismissal/restore tests. |
| Risk thresholds UI | **Not implemented** | Thresholds are centralized and validated in `riskConfig.ts`; there is no Settings UI or user-editable threshold configuration. | Source inspection. |
| Predictive or AI risk scoring | **Not implemented** | Risk Intelligence is deterministic and rule-based. It does not use a predictive model or AI. | Source; README and UI labels. |
| Local persistence | **Implemented and verified** | `localStorage` workspace with schema version 2, load statuses, salvage of valid records, recovery copy for invalid/partial payloads, save failure classification, legacy record migration. | `workspaceStorage.test.ts` (36 tests); `WorkspaceProvider.test.tsx` (2 tests); `workspaceReducer.test.ts` (15 tests). |
| Export and import | **Implemented and verified** | Whole-workspace validated JSON export; filename with date; import size cap of 5,000,000 characters; whole-file validation; explicit confirmation; replace-not-merge behavior. | `SettingsPage.test.tsx` export/import tests; `workspaceStorage.test.ts`. |
| Cloud backup and sync | **Not implemented** | No hosted database, account, remote backup, sync, or automatic external backup. Deployment does not change data locality. | No server-side planning-data storage; Settings copy says no cloud sync. |

## AI features

| Feature | Status | What exists | Evidence and scope |
| --- | --- | --- | --- |
| Deterministic local outline | **Implemented and verified** | Always available, derived from saved workspace facts, labelled **Not AI-generated**, does not invent vendor prices/bookings or unavailable provider output. | `aiFallback.test.ts` (6 tests); `AiPlanningPage.test.tsx` (5 tests). |
| AI provider suggestions | **Requires external configuration** | Browser request, server-side provider proxy, shared validation, proposal preview, and approval flow exist. Requires a running API server, a provider key, a model, and OpenAI-compatible JSON output. Automated tests use mocked providers; no live provider response was verified in this repository. | `server/http.test.ts`, `server/service.test.ts`, `server/provider.test.ts`, `server/config.test.ts`, `aiClient.test.ts`, `planValidation.test.ts`, `AiPlanningPage.test.tsx` (mocked provider tests). |
| AI privacy-minimal context | **Implemented and verified** | Aggregates one event; excludes guest names, notes, dietary/accessibility text, other events, local storage, and exports; caps arrays and message length. | `aiContext.test.ts` (5 tests); source inspection of `aiContext.ts` and contracts. |
| AI proposal validation and approval | **Implemented and verified** | Parses provider output as unknown; validates contracts and deterministic constraints; rejects stale/duplicate/invalid/blocking proposals; previews; only selected new open tasks and activities can be added; persists before state replacement; budgets/guests/events/protected priorities/risks untouched. | `aiApproval.test.ts` (9 tests); `contracts.test.ts` (6 tests); `AiPlanningPage.test.tsx`; `planValidation.test.ts`. This verifies the flow with mock/local provider paths, not a real model's quality. |
| AI-generated changes to budgets, guests, or events | **Not implemented** | AI cannot modify totals, allocations, protected categories, guest records, event fields, risk findings, or approval state. | Source inspection and tests. |
| AI provider quality evaluation | **Not implemented** | No benchmark, prompt-quality dataset, latency/cost evaluation, or real-model regression suite exists. | No such test or artifact. |

## Quality, accessibility, and operations

| Area | Status | What exists | Evidence and limits |
| --- | --- | --- | --- |
| Automated tests | **Implemented and verified** | 496 tests across 47 files, including unit, integration, UI, server, validation, privacy, health, static-serving, and stale/duplicate scenarios. | `npm run test` passed on 2026-10-25. |
| Type checking and linting | **Implemented and verified** | Strict TypeScript typecheck and ESLint with zero tolerated warnings. | `npm run typecheck` and `npm run lint` passed on 2026-10-25. |
| Production build | **Implemented and verified** | `tsc -b && vite build` succeeds; output is a single JS chunk plus CSS. | `npm run build` passed. Vite warns the JS chunk is >500 kB; no code splitting. |
| Dependency audit | **Implemented and verified for the recorded run** | `npm audit` reported 0 vulnerabilities at the documented date. This is a point-in-time report, not a guarantee. | Recorded 2026-10-25. |
| Keyboard and dialog accessibility | **Implemented but not fully verified** | Semantic controls, labels, landmarks, visible focus, Escape close for dialogs, focus restoration, live status announcements. Mobile nav and dialog keyboard flows are tested. | `App.test.tsx` and page tests; no formal accessibility audit, screen-reader certification, or full keyboard matrix. |
| Responsive layouts | **Implemented but not fully verified** | Responsive Tailwind layouts and a mobile navigation drawer exist. | Source and automated navigation tests; not tested on a broad physical-device matrix. |
| Reduced motion | **Implemented but not fully verified** | Reduced-motion handling exists in the design system. | Source inspection; no automated visual regression or user-preference test. |
| End-to-end browser suite | **Not implemented** | No Playwright/Cypress suite is committed. Development browser QA is not a reproducible checked-in test artifact. | Repository inspection. |
| CI pipeline | **Not implemented** | No workflow configuration; commands are run locally. | Repository inspection. |
| Production static serving and SPA fallback | **Implemented and verified locally** | The Node server can serve `dist/` with SPA fallback, correct MIME types, immutable asset caching, no-cache HTML, GET/HEAD, and path-traversal/dotfile rejection. | `server/app.test.ts` (4 tests); local production-server checks for `/`, `/rescue`, a missing asset, and API/static routing. No platform deployment was tested. |
| Health endpoint | **Implemented and verified** | `GET /api/health` returns `200 {"status":"ok"}` with safe headers and no configuration detail; other methods receive 405. It works without AI credentials. | `server/http.test.ts` health test; local production-server check. |
| Deployment configuration | **Prepared, not deployed** | `render.yaml`, `.node-version`, `npm start`, production static settings, environment documentation, and a deployment guide exist. No hosting service, DNS record, TLS certificate, or public URL was created. | Source inspection of `render.yaml`, `server/config.ts`, `server/index.ts`, and `docs/DEPLOYMENT.md`; local production-server checks only. |
| Hosted demo | **Prepared, not deployed** | A single-service deployment can be created by the owner using the guide. No public demo URL exists, and none is claimed. | Repository inspection. |

## Security and privacy posture

| Aspect | Status | Notes |
| --- | --- | --- |
| Provider key confidentiality | **Implemented and verified by source inspection and tests** | Server-only environment variables; never `VITE_*`; safe status does not expose key or base URL; no secret logging paths found. |
| Request limits and safe errors | **Implemented and verified** | Body size, timeout, output tokens, rate limit, JSON-only endpoints, request IDs, safe error envelopes, no CORS, security headers except CSP. The health endpoint and static handler reveal no configuration. |
| Content-Security-Policy | **Not implemented** | No CSP is configured in the page or server headers. Do not describe the app as having one. |
| Authentication and authorization | **Not implemented** | Single-user local prototype; no sign-in or roles. |
| Encryption of local data | **Not implemented** | Browser storage and exports are plaintext. |
| Multi-user/tenant isolation | **Not implemented** | No multi-user model exists. |
| Comprehensive security audit | **Not performed** | The test suite and source review are not a penetration test or certification. |
| AI data privacy | **Implemented within the documented scope** | Only aggregate event context is sent when AI is explicitly requested; guest detail is excluded. Provider-side handling is outside this repository's control. |

## Repository and delivery

| Item | Status | Notes |
| --- | --- | --- |
| License | **Not specified** | No `LICENSE` file; `package.json` is private. An explicit license must be chosen before public reuse is granted. |
| Screenshots or demo video | **Not included** | None are present in the repository; no recording link exists. |
| Hosted demo | **Prepared, not deployed** | No public URL was created or tested. The app is still run locally. |
| Git remote/push/branch operations | **Not performed** | Setup and documentation do not require a remote. |
| CI test badges | **Not applicable** | No CI or remote pipeline exists. |

## Verification evidence summary

Actual command results from the latest full run:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed (exit 0) |
| `npm run lint` | Passed, zero warnings |
| `npm run test` | 496 passed / 496; 47 test files passed |
| `npm run build` | Passed; dist JS 835.81 kB (223.61 kB gzip), CSS 53.72 kB (9.40 kB gzip); >500 kB chunk warning only |
| `npm audit` | 0 vulnerabilities reported |

What these results do **not** establish:

- That a real external AI provider returns useful, valid output.
- That every UI flow is accessible to every assistive technology or device.
- That saved planning assumptions reflect real vendor prices or availability.
- That a deployment, public URL, platform-managed TLS, or platform header behavior exists or has been verified. Local production-mode checks do not establish platform behavior.
- That CSP, authentication, authorization, or multi-user security exists.
- That the app is a production-ready or audited system.

For setup and commands, see [SETUP.md](SETUP.md). For the architecture and trust boundaries, see [ARCHITECTURE.md](ARCHITECTURE.md). For the demo flow, see [DEMO_SCRIPT.md](DEMO_SCRIPT.md). For deployment preparation, see [DEPLOYMENT.md](DEPLOYMENT.md).
