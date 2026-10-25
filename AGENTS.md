# AGENTS.md — Engineering rules for UTSAV AI

## Project context

UTSAV AI is a celebration and event planner built for **PromptWars Virtual — Challenge 5**.
The repository contains the Step 1–10 feature set plus the **Step 11 deployment-readiness**
work. The dashboard, event browsing, creation and editing, sample-data controls, settings,
routing, per-event budget planning, deterministic repair proposals, deterministic event-rescue
analysis with explicit atomic approval, guarded local persistence with schema versioning and
recovery, timeline and task management, guest and RSVP management, a deterministic catering
estimator, a centralized deterministic Risk Intelligence engine with reconciliation and
dismissal history, validated JSON export/import, and an advisory AI Planner with a server-side
API provider boundary are implemented. The Node server can also serve the production SPA and a
health endpoint, and a single-service Render Blueprint is prepared. **No deployment has been
performed**: there is no public URL, hosted data store, account system, cloud sync, DNS, or
verified platform TLS. Event deletion and any server-side planning-data backend do not exist.

Do not describe planned behavior as implemented. Risk Intelligence is a working deterministic
module; it is not an AI feature and does not score risks with a predictive model. The AI
Planner is advisory: deterministic code owns budgets, catering, overlap detection, constraint
validation, risk severity, feasibility, and approval.

## Architecture boundaries

- `src/app/` owns the application entry point, routes, and global styles.
- `src/components/` contains small, reusable presentational components.
- `src/features/` owns feature-specific UI, state, and domain logic. Feature folders are
  isolated by responsibility.
- `src/features/workspace/` owns the workspace provider, reducer, guarded local storage,
  and clearly labelled sample dataset. Future modules should replace the data source here
  rather than reaching across feature folders.
- `src/features/budget/` owns budget contracts, pure calculations, validation, mutations,
  form parsing, and the deterministic repair engine. Presentational budget components do
  not perform arithmetic.
- `src/features/rescue/` owns rescue contracts, finding detection, requirement resolution,
  proposal generation, proposal validation, and approval. The engine reuses budget
  calculations, timeline overlap detection, guest counts, and the catering estimator rather
  than duplicating them. Approval persistence is atomic and lives at the workspace boundary.
- `src/features/risks/` owns risk contracts, centralized thresholds, the deterministic
  detection engine, reconciliation/dismissal rules, proposal snapshots, selectors,
  presentation metadata, and the Risk Intelligence UI. The engine reuses budget, task,
  timeline, guest, catering, and rescue data rather than reimplementing those rules.
- `src/features/timeline/` owns activity contracts, validation, chronological sorting,
  status filtering, upcoming selection, and overlap detection. Overlaps are review prompts,
  never automatic edits.
- `src/features/tasks/` owns task validation, sorting, filtering, overdue detection,
  completion progress, and preparation-task suggestions derived from the event date.
- `src/features/guests/` owns guest validation, search, RSVP filtering, counts, and the
  accessible guest and catering-estimate UI.
- `src/features/catering/` owns the deterministic catering estimator. It uses confirmed
  RSVPs when guest records exist, otherwise the event's expected count, and never invents a
  vendor price.
- `src/features/ai/` owns the shared AI request/response contracts, privacy-minimal context
  builder, client HTTP boundary, deterministic plan validation, proposal approval, local
  fallback outline, labels, and the AI Planner UI. It must not duplicate budget, timeline,
  task, guest, catering, or risk rules; it calls those modules.
- `server/` owns the Node server: environment config, HTTP routing and hardening, the health
  endpoint, optional static SPA serving, rate limiting, the provider interface, prompt
  construction, and response validation. It is a provider proxy and static file server, not
  a business-logic layer, and it must remain stateless. Static serving must not expose files
  outside the configured root or bypass API routing. Shared AI schemas are imported from
  `src/features/ai/contracts.ts` so browser and server validation cannot drift.
- `render.yaml`, `.node-version`, and `docs/DEPLOYMENT.md` describe the prepared single-service
  deployment. They must not be used to claim that a deployment exists.
- `src/lib/` contains framework-free utilities.
- `src/services/` is reserved for future in-browser I/O boundaries. Components must not call
  external APIs directly; the AI client is the only browser code that calls `/api`.
- `src/types/` contains shared domain contracts and UI-level types.
- `src/test/` contains shared test setup and fixtures. Tests live next to the code they
  cover, including `server/*.test.ts`.

Keep business logic out of presentational components. Prefer pure functions for rules and
calculations, then test them independently of React.

## Required verification

Before reporting work as complete, run and report the actual result of:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Report failures honestly. Never claim a test passed without running it.

## Engineering rules

1. **Use maintainable TypeScript.** Keep the project strict, avoid `any`, model untrusted
   data as `unknown` until validated, and prefer clear types over type assertions.
2. **Prefer small, reusable components.** Extract a component only when it has a clear,
   repeated responsibility; do not build a large component library speculatively.
3. **Separate UI from business logic.** Calculation, validation, and domain rules belong
   in feature modules or `src/lib/`, not inside presentational JSX.
4. **Validate untrusted inputs.** Validate data at boundaries such as forms, URL state,
   local storage, imports, and API responses. TypeScript types alone do not validate
   runtime data.
5. **Handle errors explicitly.** Do not silently swallow failures. Surface safe,
   actionable error states and preserve enough context for diagnosis.
6. **Never expose API keys in frontend code.** `VITE_*` values are public. AI and vendor
   secrets must stay behind a server-side boundary and must not appear in client bundles,
   responses, logs, error messages, fixtures, or committed files.
7. **Never commit credentials.** Keep `.env` files local, commit only safe placeholders in
   `.env.example`, and follow `.gitignore`.
8. **Never use AI for deterministic budget arithmetic.** Store and calculate money as
   integer minor units in code. AI may assist with suggestions, never totals or financial
   facts.
9. **Write tests for important business logic.** Cover budget rules, validation, rescue
   decisions, timeline constraints, and risky edge cases. A bug fix should include a
   regression test where practical.
10. **Never claim a test passed without running it.** Distinguish verified results from
    assumptions, and include command output in completion reports.
11. **Preserve user-approved constraints.** Do not relax dates, budgets, scope, event
    rules, or other user decisions without asking.
12. **Do not overwrite user data without approval.** Treat destructive migrations,
    imports, resets, and data exports as actions that need confirmation and a recovery
    path.
13. **Implement accessible semantic HTML.** Use landmarks, logical headings, labels,
    keyboard access, visible focus, readable contrast, and reduced-motion support. Test
    important flows beyond mouse-only use.
14. **Avoid unnecessary dependencies.** Prefer the platform and existing packages. Justify
    each new runtime dependency and keep the bundle lean.
15. **Keep the final repository below 10 MB.** Do not commit `node_modules`, build output,
    coverage, large media, or generated caches. Check size before delivery.
16. **Do not create additional Git branches.** Work on the existing branch unless the user
    explicitly asks for a branch operation.
17. **Do not upload to GitHub during development.** Do not create remotes, push commits, or
    open pull requests unless explicitly instructed.
18. **Keep documentation accurate.** Mark work as planned or implemented, keep commands
    runnable, and update the README when behavior changes. Never imply a hosted deployment,
    configured provider, credential, or unimplemented feature exists. AI suggestions require
    a separately started API server and server-side credentials; never claim a live provider
    was used without verifiable results.

## Current conventions

- Money is represented by the `Money` type in `src/types/domain.ts` using integer minor
  units. `src/lib/money.ts` formats and parses values. Budget totals, utilization, variance,
  reserve status, and overruns come from pure functions in
  `src/features/budget/calculations.ts`; dashboard selectors aggregate through that engine.
  Validation and repair live in the same feature folder.
- Budget protection is a discriminated union: `{ mode: 'protected' }` or
  `{ mode: 'flexible', minimumPlanned }`. Do not introduce a parallel boolean or store
  protected and flexible amounts as independent derived state.
- The emergency reserve is a protected category with ID `emergency-reserve`. Its planned
  amount is part of planned expenditure and the available total; a reserve is not extra
  money.
- Repair proposals are deterministic and advisory. They must never mutate inputs, change the
  total budget, reduce protected categories or flexible minimums, produce negative amounts,
  or apply without explicit approval. Greedy feasibility is not a claim of optimality.
- Event Rescue treats the saved event as the original plan. Analysis must never mutate it,
  never silently raise the total budget or change guest counts to fake feasibility, never
  demote saved protections, and never apply a proposal without explicit approval. Catering
  recalculation is a proportional assumption derived from the saved plan, not a vendor
  quote. Approval must revalidate the proposal and saved event, reject stale or duplicate
  proposals, persist atomically, and update timestamps only on success.
- Dates are date-only `YYYY-MM-DD` strings parsed as local calendar dates through
  `src/lib/date.ts` to avoid timezone drift. Activity start and end values are local
  date-time strings in `YYYY-MM-DDTHH:mm` form without a timezone offset; an activity must
  end after it starts.
- Event editing replaces only the selected event through a pure `updateUserEvent` mutation.
  It preserves the event's status, origin, setting, theme, accessibility and contingency
  answers, budget categories, reserve, protected allocations, and record ID. A changed total
  budget flows through `withUpdatedBudgetTotal`; an unchanged total leaves the budget object
  untouched. A changed date must be today or later, while an unchanged saved past date stays
  editable. There is no event deletion.
- Timeline overlaps are potential conflicts surfaced for review. They may be intentional
  and must never be resolved by silently moving, merging, or deleting an activity.
- Task status is the union `'open' | 'completed'`; do not add a parallel completion boolean.
  Overdue detection compares an open task's due date with the local today value. Preparation
  suggestions are derived from the event date and are not persisted as completed work.
- Guest RSVP status is `'pending' | 'confirmed' | 'declined'`. Invited guests are not
  confirmed attendees. Guest data stays in browser storage and is not sent to an AI service.
- The catering estimator is deterministic. It uses confirmed RSVPs when guest records exist
  and labels the event's expected guest count as an estimate otherwise. The buffer is a
  whole percentage rounded up to whole attendees. Per-person cost is a user assumption, never
  a vendor quote or a current market rate, and all money arithmetic uses integer paise.
- Persistence includes activities, guests, and one catering estimate per event alongside
  events, budgets, and tasks. Legacy stored tasks with a `completed` flag and guests with
  `attending`/`waitlisted` RSVP values migrate to the current shapes during validated load.
- Styling uses Tailwind CSS v4 through `@tailwindcss/vite`. Design tokens and reusable
  `.btn-*`, `.field-*`, and `.surface-card` classes live in `src/app/index.css` under
  `@theme` and `@layer components`. Icons come from `lucide-react`.
- Routing uses React Router DOM 7 with real routes for every navigation destination.
  Workspace state uses React context plus `useReducer`; do not add a state library without a
  concrete requirement.
- Risk Intelligence is deterministic, in-process, and read-only. Every finding has a stable
  detection ID derived from the event and rule (plus an optional entity key), a category,
  severity, certainty, evidence, recommended action, related entity references, detection
  timestamps, status, source module, and rule ID. Thresholds live in `riskConfig.ts` and are
  validated; do not scatter numeric limits through the engine or UI. Analysis must never
  mutate saved budgets, tasks, guests, activities, events, or proposals.
- Reconciling repeated analyses must not create duplicate open findings. An open finding is
  updated in place and keeps its first detection time. An open issue that is no longer
  detected becomes resolved and stays in history. A resolved issue that reappears is
  reopened. A dismissed finding stays dismissed while its content fingerprint is unchanged
  and reopens only when severity or evidence changes. Findings never cross event boundaries,
  and viewing or filtering the page must never resolve an issue. Dismissal is not resolution.
- Event Rescue snapshots store signatures and change summaries for consistency checks, never
  a second approvable copy of the event. Proposal-consistency findings must revalidate
  against the saved event and never approve or apply anything. Approval remains explicit,
  revalidated, atomic, and stale-safe.
- The AI Planner is advisory. Provider output must be parsed as `unknown`, validated against
  the shared Zod contracts, and checked for impossible dates, reversed activity ranges,
  invalid integer money, unsafe sums, and unknown finding/task/activity references before it
  is shown as a proposal. Never present unvalidated or partially valid output as confirmed or
  feasible. Never let AI output change totals, protected categories, guest records, risk
  severity, feasibility decisions, or its own approval state.
- AI context must remain privacy-minimal. Send only the selected event's aggregates and never
  guest names, notes, dietary or accessibility text, other events, local storage contents, or
  exported data. The request is capped in length and size at both the browser and server
  boundaries. The server must not log prompts, provider payloads, or guest data.
- AI suggestions are transient page state and are never persisted. Applying additions is
  explicit and review-first: the host selects items, opens a preview, and confirms. Approval
  must revalidate the request, proposal, saved event, and context signature; reject stale,
  duplicate, invalid, or blocking proposals; persist before dispatching state; and leave all
  records unchanged on failure. Only selected new open tasks and timeline activities may be
  added. Budgets, guests, events, protected priorities, and risk findings are untouched.
- The deterministic local outline is a fallback, not an AI response. It must be labelled
  `Not AI-generated`, derive every value from saved workspace data and existing app rules,
  and never invent vendor prices, bookings, availability, or AI-style advice. Missing
  provider credentials or an unavailable server must leave the app usable with clear status
  and no fabricated result.
- Provider integration lives only in `server/`. Secrets come from server environment
  variables, never from `VITE_*` values, source, or committed configuration. Requests use one
  bounded provider attempt with an abort timeout, output-token cap, body limit, per-client
  fixed-window rate limit, JSON-only endpoint, and safe error envelope with a request ID.
  Responses use `no-store`, no CORS, and safe logs. Never add an automatic retry loop or log
  a key, prompt, provider body, or stack trace.
- Production static serving is opt-in through `SERVE_STATIC=true` and must stay same-origin
  with `/api`. The static handler must keep rejecting path traversal, dotfiles, and dot
  segments; must not serve API paths; must return 404 for missing assets; and must leave
  `/api/health` independent of AI configuration. Do not hard-code a localhost API URL into
  production client code; the browser calls relative `/api` paths.
- Deployment is prepared but has not occurred. Do not create hosting services, DNS records,
  or public URLs, and do not claim a deployment, TLS, or post-deploy smoke test without
  explicit user authorization and verifiable results. Keep AI credentials in the hosting
  platform's server-side environment only; the prepared service must remain usable with a
  clear **Not configured** AI state when they are absent.
- AI tests must mock the provider or use an ephemeral local server. Never make paid calls,
  require real credentials, or put real keys in fixtures. Cover missing credentials,
  timeouts, provider errors, request/size limits, rate limiting, malformed output, invalid
  proposals, privacy isolation, protected constraints, preview/approval, stale rejection,
  no-mutation failures, and existing Step 1–7 behavior.
- `server/` runs through Node's native TypeScript execution: import shared modules with
  explicit `.ts` extensions, avoid TypeScript parameter properties and other non-erasable
  syntax, and keep server-only types out of client code.
- Workspace data persists to browser `localStorage` under `utsav-ai.workspace.v1` with
  schema version `2`. Load strictly at the boundary, salvage valid records when part of a
  saved payload is malformed instead of wiping everything, retain a recovery copy of the
  original payload under `utsav-ai.workspace.recovery.v1` before saving over it, and surface
  load/save/unavailable states. Export validates and serializes the whole workspace; import
  validates the whole file before replacing anything and requires explicit user confirmation
  in the UI. There is no server-side planning-data backend or cloud sync; a stateless
  deployment does not change localStorage's per-browser, per-origin limitations.
- Sample records use `origin: 'sample'`; user-created records use `origin: 'user'`.
- Do not log or display raw persisted record contents in error messages. Storage and analysis
  messages must be safe summaries that never expose guest notes, names, or other record
  detail.
- Tests run in Vitest with `jsdom`; shared setup lives in `src/test/setup.ts`, shared
  fixtures in `src/test/fixtures.ts`, and AI fixtures in `src/test/aiFixtures.ts`. Use
  Testing Library and user-event for interaction tests. Budget arithmetic and constraints
  must be tested as pure logic, not only through rendering. Server tests live in `server/`
  and are type-checked under `tsconfig.node.json`; they must not require network access or a
  real provider key.
- Keep the local build reproducible with the committed `package-lock.json`.
