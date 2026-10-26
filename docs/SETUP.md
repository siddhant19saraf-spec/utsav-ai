# UTSAV AI — Local Setup Guide

This guide covers running UTSAV AI on a local machine for evaluation, development, a demo, or a local production-build check. It describes the repository as it exists, not a hosted service.

**What you are setting up**

- A browser-based React application whose core features run entirely locally.
- Optional AI suggestions served by a Node.js API process that proxies one external, OpenAI-compatible provider.
- Optionally, the same Node process can serve the built SPA for local production-style verification.

There is no database, Docker image, cloud account, or external service required for the core planner. AI is optional. A public static demo is live at **https://utsav-ai-9evw6i99uw4.qoder.website**; the Node/API service is prepared but not deployed. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Supported environment

| Requirement | Detail |
| --- | --- |
| Node.js | `>= 24.15.0` (declared in `package.json`). Verified with **v24.16.0**. Node 24's native TypeScript execution is used by the server. |
| npm | Verified with **11.13.0**. The committed `package-lock.json` is the dependency source of truth. |
| Operating system | Any OS supported by Node.js and Vite. Setup was verified on Windows 10/11 with Git Bash; the npm commands are cross-platform. |
| Browser | A current browser with JavaScript, `localStorage`, and ES modules enabled. Chrome/Chromium was used for browser QA. |
| External services | None for the core app and test suite. Optional AI requires a provider key and a compatible model. |
| Ports | Vite dev server defaults to `5173`; the Node server defaults to `127.0.0.1:8787`. |

The project has no Docker Compose file or database migration step. `.node-version` pins Node `24.16.0` for hosting platforms, and `render.yaml` contains a prepared Blueprint. Neither has been used to deploy; see [DEPLOYMENT.md](DEPLOYMENT.md).

## 1. Install dependencies

Open a terminal in the project root (the directory containing `package.json`) and run:

```bash
npm ci
```

`npm ci` installs exactly the locked dependency versions. On a machine where you are changing dependencies intentionally, use `npm install` instead. Both commands install dev dependencies, including the test and lint tooling.

Nothing needs to be installed globally.

## 2. Run the frontend

```bash
npm run dev
```

Vite starts the development server and prints the local URL, normally:

```text
http://localhost:5173
```

If port `5173` is already occupied, Vite chooses the next available port and prints it. Open the printed URL in a current browser.

**First run:** if no saved workspace exists, the app seeds the labelled sample workspace. You can remove sample events and later restore them from **Settings**. User-created records are kept when samples are removed.

**Local data:** the workspace is saved in the browser's `localStorage`, scoped to the origin (scheme, host, and port). Opening the app through `localhost` versus `127.0.0.1`, or on a different port, uses a different storage bucket. Use the same origin consistently; do not interpret a different origin as lost data until you check the original URL.

For the full feature tour, use the sample data or follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

## 3. Optional AI API server

The core planner, the deterministic outline, and all automated tests work without this section. Complete it only if you want provider-generated AI suggestions.

### 3.1 Create the local environment file

Copy the template:

```bash
# macOS / Linux / Git Bash
cp .env.example .env.local
```

On Windows Command Prompt or PowerShell, copy `.env.example` to `.env.local` with Explorer or:

```powershell
Copy-Item .env.example .env.local
```

Open `.env.local` and set at least:

```dotenv
AI_PROVIDER_API_KEY=your-real-server-side-key
AI_MODEL=your-provider-model-id
```

Never commit `.env.local` or `.env`; both are ignored by `.gitignore`. Never rename these variables with a `VITE_` prefix. `VITE_*` values are public in the browser bundle.

### 3.2 Environment variables

The server loads `.env.local` and then `.env` if present. Node's repeated `--env-file-if-exists` flags let the later file win for duplicate variables, so keep real values only in `.env.local` and do not put conflicting values in `.env`. Only the API server reads these values.

| Variable | Required for AI | Default | Notes |
| --- | --- | --- | --- |
| `AI_PROVIDER_API_KEY` | Yes | none | Read only server-side; never logged. |
| `AI_MODEL` | Yes | none | No default model is assumed. Must be valid for the selected provider. |
| `AI_BASE_URL` | No | `https://api.openai.com/v1` | Any OpenAI-compatible Chat Completions base URL using `http` or `https`. |
| `AI_PROVIDER_NAME` | No | `OpenAI-compatible provider` | Safe label shown in the UI; truncated to 80 characters. |
| `AI_REQUEST_TIMEOUT_MS` | No | `20000` | Whole number from `1000` to `120000`. One provider attempt; no retry loop. |
| `AI_MAX_OUTPUT_TOKENS` | No | `1800` | Whole number from `256` to `8192`. |
| `AI_MAX_REQUEST_BYTES` | No | `96000` | Whole number from `1024` to `1048576`. |
| `AI_RATE_LIMIT_MAX` | No | `10` | Whole number from `1` to `1000` requests per window. |
| `AI_RATE_LIMIT_WINDOW_MS` | No | `60000` | Whole number from `1000` to `3600000`. |
| `AI_SERVER_HOST` | No | `127.0.0.1` | Loopback by default. A hosting platform normally requires `0.0.0.0`. |
| `AI_SERVER_PORT` | No | `8787` | Whole number from `1` to `65535`. If changed for development, also update the Vite `/api` proxy target in `vite.config.ts`. On a hosting platform, leave it unset so the platform's `PORT` is used. |
| `PORT` | No | unset | Hosting-platform port. Used only when `AI_SERVER_PORT` is unset. It has no effect locally unless you set it. |
| `SERVE_STATIC` | No | `false` | Set to `true` to serve the built SPA from the Node server. Must be exactly `true` or `false`. |
| `STATIC_DIR` | No | `dist` | Directory served when `SERVE_STATIC=true`. It must contain `index.html` at startup. |

The provider must support OpenAI-compatible Chat Completions and JSON object output. Model availability, pricing, rate limits, and data-handling terms are controlled by your provider account, not by this repository.

### 3.3 Start the server

In a second terminal, from the project root:

```bash
npm run dev:api
```

This runs `server/index.ts` with Node.js native TypeScript execution and loads `.env.local`/`.env` through `--env-file-if-exists`. It prints a safe startup message to the terminal; it does not print the key.

Keep `npm run dev` running in the first terminal. Vite proxies `/api/*` from the frontend to `http://127.0.0.1:8787`.

Optional status checks from a third terminal:

```bash
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8787/api/ai/status
```

`/api/health` is a lightweight process health check and does not require AI configuration. `/api/ai/status` reports only safe provider metadata.

The response is a safe status envelope that reports whether provider metadata is configured. It must not contain the key or provider body. When the app is open, the **AI Planner** page shows the same status in its **Server-side AI status** area.

### 3.4 AI behavior without configuration

If the key, model, or server is missing:

- The app still loads and all core planning works.
- The AI Planner reports **Not configured** or **Unavailable**.
- **Generate AI plan** is disabled.
- **Build deterministic outline** remains available and is labelled **Not AI-generated**.
- No paid request is made by the app or the test suite.

If configuration is invalid, the server reports safe configuration notes and disables AI; the app does not fabricate a result.

## 4. Production build and local production check

```bash
npm run build
npm run preview
```

`npm run build` runs `tsc -b && vite build` and writes `dist/`. `npm run preview` serves that output locally. Feature pages are emitted as separate chunks and load on demand; see the measured bundle sizes in the root README. There is no chunk-size warning in the current build.

`vite preview` uses the same `/api` proxy configuration as `vite dev`, so the optional local API can be exercised in preview if it is running. It is a Vite preview server, not the production server.

To verify the production server that the prepared deployment uses, run the Node server with static serving enabled after a build:

```bash
SERVE_STATIC=true AI_SERVER_HOST=127.0.0.1 AI_SERVER_PORT=8790 npm start
```

Open `http://127.0.0.1:8790`. The same process serves the SPA, its assets, and `/api/*` on one origin. Useful checks:

```bash
curl -i http://127.0.0.1:8790/api/health
curl -i http://127.0.0.1:8790/api/ai/status
curl -i http://127.0.0.1:8790/rescue
```

The health endpoint returns `{"status":"ok"}` without requiring AI configuration. A direct navigation to `/rescue` must return `index.html`, not a 404. Unknown assets must return 404 rather than HTML. This is a local production-style check only; it is not a deployment and does not verify platform TLS, headers, or networking.

`npm start` without `SERVE_STATIC=true` runs only the API, which is useful when the frontend is served by another local process.

## 5. Persistence and data setup

There is no database setup. The application persists to browser storage:

| Item | Value |
| --- | --- |
| Workspace storage key | `utsav-ai.workspace.v1` |
| Payload schema version | `2` |
| Recovery-copy key | `utsav-ai.workspace.recovery.v1` |
| Import size limit | 5,000,000 characters |
| Export format | JSON, with version, export timestamp, and workspace |
| Backup location | Downloaded file chosen by the browser; the app does not upload it anywhere |

When an unreadable or partially salvaged payload is loaded, the app attempts to keep the original raw payload in the recovery key if no earlier recovery copy exists. Recovery-copy status is surfaced in Settings. Normal saves do not create a new recovery copy on every write.

**Before clearing browser data, changing ports/origins, or demoing on someone else's machine:** export the workspace from **Settings**, or work in a disposable browser profile. There is no cloud backup.

Import is a replace operation, not a merge. The app validates the whole file, shows a confirmation, and only then replaces the workspace. Use the app's own export as the safest import source.

## 6. Common commands

| Command | What it does |
| --- | --- |
| `npm ci` | Install exact locked dependencies |
| `npm install` | Install/update dependencies and the lockfile |
| `npm run dev` | Start Vite (frontend only) |
| `npm run dev:api` | Start the optional local AI provider proxy |
| `npm run typecheck` | Type-check client and Node TypeScript projects |
| `npm run lint` | ESLint with zero warnings allowed |
| `npm run test` | Run all Vitest tests once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run build` | Type-check and build the client into `dist/` |
| `npm run preview` | Serve the built client with Vite's preview server |
| `npm start` | Run the Node server (API only unless `SERVE_STATIC=true`) |

Verification results as of 2026-10-26: typecheck passed, lint passed with zero warnings, 529 tests passed across 52 files, and the production build passed. `npm audit` reported 0 vulnerabilities. The tests use mocked AI providers and require no real key, network access to a model, or paid request.

## 7. Troubleshooting

### Node.js compatibility errors

**Symptom:** the API server fails to start, does not understand TypeScript, or reports an unsupported Node version.

**Action:** check `node -v` and update to Node.js `>= 24.15.0`. The API uses Node's built-in TypeScript execution and loads `.ts` modules directly. `npm install` warnings about the `engines` field mean the installed Node is too old.

### Frontend starts on a different port

**Symptom:** the app is at `http://localhost:5174` or another port, and previously saved events appear missing.

**Action:** local storage is origin-scoped. Open the URL that was used previously, stop the conflicting process, or accept that the new origin starts with fresh sample data. Export from the old origin first if needed.

### AI Planner says "Not configured"

**Check:**

1. `.env.local` exists in the project root, not a parent folder.
2. `AI_PROVIDER_API_KEY` and `AI_MODEL` are both set to non-empty values.
3. The variables do not have a `VITE_` prefix.
4. `npm run dev:api` was restarted after changing the environment file.
5. The key and model are valid for the configured provider.

### AI Planner says "Unavailable"

**Check:** the API server is running, the terminal shows no startup failure, the server is on `127.0.0.1:8787`, and the frontend was started from the same project so Vite's proxy is active. If you changed `AI_SERVER_PORT`, update the proxy target in `vite.config.ts` and restart both processes.

The deterministic outline remains available while you troubleshoot.

### Provider error, timeout, or invalid output

The server returns a safe error envelope with a request ID and maps timeouts/provider failures to appropriate status codes. It does not expose the provider body or key. Check the provider's model name, base URL, quota, and JSON-response support. Do not add a retry loop or log the prompt while debugging; the design makes one bounded attempt by default.

### Saved data could not be loaded or was partially skipped

Open **Settings** and read the persistence status. If a recovery copy was created, it is stored under `utsav-ai.workspace.recovery.v1` in the same browser origin. Do not clear storage before exporting whatever loads successfully. A malformed payload can be salvaged record by record; valid records are kept.

### Import is rejected

Imports must be a valid UTSAV AI export under 5,000,000 characters and must pass whole-file validation. Partial or third-party JSON is not accepted. Use **Settings → Export** to produce a valid backup, then retry. Import replaces the current workspace only after explicit confirmation.

### Local storage is full

Export a backup, remove the sample workspace if it is not needed, and free browser space. The app keeps unsaved edits in the tab but cannot guarantee persistence after closing. Safari/private browsing and restrictive browser settings may block storage entirely.

### A route fails to load after a new build or deployment

**Symptom:** navigating to a feature page shows the recovery screen, or the browser console reports a missing hashed chunk.

**Cause:** feature pages are loaded as separate hashed chunks. A browser tab left open across a new build can still reference chunk names that the server has replaced.

**Action:** choose **Reload app** on the recovery screen, or refresh the tab, to fetch the current `index.html` and its chunks. Restarting a local dev or preview server while a tab is open can produce the same transient state.

### `SERVE_STATIC=true` exits with a static-directory error

**Symptom:** startup stops with a safe message saying the static directory does not contain `index.html`.

**Action:** run `npm run build` first, confirm `dist/index.html` exists, and check `STATIC_DIR` if you changed it. The server intentionally refuses to start with static serving enabled and no built frontend.

### `/api/health` works but the page shows a 404

**Check:** `SERVE_STATIC` is exactly `true`, `STATIC_DIR` points to the built output, and the request is going to the same port as the Node server. Without static serving, the Node server exposes only `/api/*` and returns a 404 for page routes.

### Production server uses the wrong port

**Check:** on a hosting platform, leave `AI_SERVER_PORT` unset so `PORT` is used. If both are set, `AI_SERVER_PORT` wins. The sanitized startup log prints the selected port without printing environment secrets.

### Tests appear to require an API key

They do not. The suite uses mocks and local test paths. If a test fails, capture the failing test file and command output; do not add real credentials to fixtures. Run `npm run test -- <pattern>` to narrow a failure if needed.

## 8. Where to go next

- [Project overview and feature status](../README.md)
- [Architecture](ARCHITECTURE.md)
- [Deployment guide](DEPLOYMENT.md) (static demo live; Node/API prepared, not deployed)
- [Competition demo script](DEMO_SCRIPT.md)
- [Detailed feature status](FEATURE_STATUS.md)
- Engineering rules: [AGENTS.md](../AGENTS.md)

For a clean evaluation, use a fresh browser profile, keep the optional API server off unless you specifically want to test provider suggestions, and export any workspace you want to preserve.
