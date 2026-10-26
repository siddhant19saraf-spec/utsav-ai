# Contributing to UTSAV AI

Thanks for your interest. UTSAV AI is a competition prototype, not a supported product. Focused bug reports and small, well-tested pull requests are welcome, but there is no response-time or support commitment.

Please read [AGENTS.md](AGENTS.md) for the full engineering rules and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module responsibilities.

## Before you start

- Search existing issues first.
- For a new feature, a dependency, a backend service, or a change to approval rules, open an issue before writing code so the scope can be agreed.
- Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md), never in a public issue.
- Never include credentials, `.env` contents, API keys, real guest data, or private planning files in issues, pull requests, screenshots, or tests.
- There is no `LICENSE` file yet. If explicit reuse rights matter for your contribution, raise that in an issue before investing significant work.

## Development setup

Requirements: **Node.js `>= 24.15.0`** and npm.

```bash
npm install
npm run dev
```

The first run seeds a labelled sample workspace. Core planning features require no API key, database, or external account.

Optional AI development uses a second terminal after copying `.env.example` to `.env.local` and adding a server-side provider key and model:

```bash
npm run dev:api
```

Never commit `.env` or `.env.local`. `VITE_*` values are public; provider credentials must stay server-side. Tests must not require a real key or make paid provider calls.

## Required checks

Run all four commands before opening a pull request and report the actual output:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

The same checks run in GitHub Actions on every push and pull request to `main`. A pull request should not be described as passing unless the relevant checks actually ran.

## What fits the project

- **Deterministic facts stay deterministic.** Budget arithmetic uses integer minor units; budget repair, rescue feasibility, risk severity, timeline overlap, guest counts, catering math, and approval are pure TypeScript rules. Do not move these decisions into an AI prompt or provider response.
- **AI is advisory.** Provider output is parsed as `unknown`, validated against the shared Zod contracts, and reviewed explicitly. It must not change totals, protected categories, guest records, risk severity, feasibility, or its own approval state.
- **Local-first remains the default.** Do not add a database, accounts, cloud sync, hosted vendor integration, or a state-management library without a concrete requirement and prior agreement.
- **Validation stays at the boundary.** Forms, URL state, local storage, imports, API responses, and provider output are untrusted until validated at runtime.
- **Approvals remain explicit and atomic.** Persist before replacing state, revalidate against the saved record, and leave data unchanged on failure.
- **Privacy stays minimal.** AI context excludes guest names, notes, dietary and accessibility text, other events, and exported data. Do not log prompts, provider bodies, secrets, guest data, or stack traces.
- **Accessibility is part of correctness.** Use semantic HTML, labels, visible focus, keyboard access, status announcements, and reduced-motion support.
- **Keep dependencies lean.** Justify every new runtime dependency.

## Tests

Tests live next to the code they cover and run in Vitest with jsdom. Use the shared setup and fixtures in `src/test/`. Server behavior belongs in `server/*.test.ts` and must not require network access or a real provider key.

- Add a regression test for a bug fix where practical.
- Test financial and constraint rules as pure logic, not only through rendering.
- Use synthetic values in fixtures and screenshots.
- Mock the provider or use a local test server; never make a paid request.

## Pull requests

1. Fork the repository and work on a short-lived branch in your fork.
2. Keep the change focused; avoid unrelated refactors, formatting churn, and speculative abstractions.
3. Update tests and documentation when behavior, scope, or commands change. Keep status claims accurate: distinguish implemented, verified, configured, and planned work.
4. Complete the pull request template, including the verification results.
5. Do not force-push or rewrite shared history, and do not commit build output, coverage, `node_modules`, or large media.

A public static demo is live (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)); the Node/API service is prepared but not deployed. Do not add a new public URL, TLS, hosting, or post-deploy claim without verifiable results.

## Questions

Open an issue with the **Feature request** or **Bug report** form. For setup problems, check [docs/SETUP.md](docs/SETUP.md) first.
