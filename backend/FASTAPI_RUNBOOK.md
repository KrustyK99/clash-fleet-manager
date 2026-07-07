# FastAPI Runtime Readiness

This runbook documents the current PHP/status quo runtime path and the FastAPI compatibility runtime path. It is a cutover rehearsal aid only.

## Current status

- PHP remains the default backend.
- FastAPI remains opt-in.
- The browser-facing API contract remains `/api.php?action=...`.
- FastAPI exposes a PHP-compatible `/api.php?action=...` route.
- PHP and the default FastAPI verification path use JSON-file persistence.
- MariaDB exists only as an explicit, disposable test-store path behind the same `/api.php?action=...` contract.
- MariaDB validation does not migrate production data and does not make MariaDB the default runtime.
- Production deployment behavior has not been changed.

## Backend defaults

Use the command names as the source of truth:

```bash
npm run test:e2e
```

runs the PHP/status quo full browser E2E path through `npm run test:e2e:php`.

```bash
npm run test:e2e:fastapi
```

runs the FastAPI-backed full browser E2E path.

FastAPI is deliberately explicit. Do not point `test:e2e` at FastAPI until a future cutover decision is made.

## Runtime command inventory

| Command | Backend target | Starts its own server? | Runtime data path | Touches real app data? | Notes |
| --- | --- | --- | --- | --- | --- |
| `npm test` | PHP/status quo | Yes, through Playwright `webServer` | `tests/runtime-app/data` | No | Alias for `npm run test:e2e:php`. |
| `npm run test:e2e` | PHP/status quo | Yes, through Playwright `webServer` | `tests/runtime-app/data` | No | Default full browser E2E path. Keep this as PHP until an intentional cutover. |
| `npm run test:e2e:php` | PHP/status quo | Yes, through Playwright `webServer` | `tests/runtime-app/data` | No | Explicit PHP full browser E2E path. |
| `npm run verify:php` | PHP/status quo | Yes, through Playwright `webServer` | `tests/runtime-app/data` | No | Prepares the test app and runs the full browser suite with line reporter. May reuse the expected local PHP/Docker server on port `8011`. |
| `npm run test:e2e:fastapi` | FastAPI compatibility | Yes, through Playwright `webServer` and `tests/support/serve-fastapi-test-app.mjs` | `tests/runtime-app/data` via `FLEET_DATA_DIR` | No | Dedicated FastAPI full browser E2E path. FastAPI remains opt-in. |
| `npm run verify:fastapi:e2e` | FastAPI compatibility | Yes, through `test:e2e:fastapi` | `tests/runtime-app/data` via `FLEET_DATA_DIR` | No | FastAPI full browser E2E path with line reporter. Forces a fresh test server. |
| `npm run test:contract:php` | PHP/status quo | Yes, through Playwright `webServer` | `tests/runtime-app/data` | No | Runs only `tests/e2e/api-contract.spec.js` against the PHP runtime app. |
| `npm run test:contract:fastapi` | FastAPI compatibility | No | Whatever the already-running FastAPI server uses | Depends on that server | Expects FastAPI to already be running at `API_CONTRACT_FASTAPI_BASE_URL`, default `http://127.0.0.1:8001`. |
| `npm run verify:fastapi` | FastAPI compatibility | Yes, via `Tools/verify-fastapi-contract.ps1` | `tests/runtime-app/data` via `FLEET_DATA_DIR` | No | Windows PowerShell-oriented FastAPI contract verifier. Explicitly forces `FLEET_STORE_BACKEND=json`, starts FastAPI, waits for readiness, runs API contract tests, then stops FastAPI. |
| `npm run serve:php` | PHP/status quo | Yes | `tests/runtime-app/data` | No | Prepares the isolated runtime app, then runs the PHP server command. |
| `npm run serve:fastapi` | FastAPI compatibility | Yes | `tests/runtime-app/data` via `FLEET_DATA_DIR` | No | Prepares the isolated runtime app, then runs the FastAPI test-app server wrapper. |
| `npm run serve:api:fastapi` | FastAPI compatibility API only | Yes | `tests/runtime-app/data` via `FLEET_DATA_DIR` | No | Manual FastAPI API server command for Windows local use. Browser app serving is not enabled by this command. |
| `npm run fastapi:serve` | FastAPI compatibility API only | Yes | `tests/runtime-app/data` via `FLEET_DATA_DIR` | No | Alias for `serve:api:fastapi`. |
| `npm run prepare:test-app` | None by itself | No | Creates/resets `tests/runtime-app` | No | Copies app files and fixture data into the disposable runtime app. |

The current package scripts are mostly Windows-oriented because they use `set "NAME=value"&&` and PowerShell for some helpers. The Node-based FastAPI server wrapper itself is cross-platform, but the npm script syntax is optimized for the current Windows workflow.

## Run the PHP/status quo E2E path

```bash
npm run test:e2e
```

This is the default full browser path. It prepares `tests/runtime-app`, starts the PHP runtime app through Docker, and runs the Playwright suite against `http://127.0.0.1:8011`.

For explicit naming:

```bash
npm run test:e2e:php
```

For line reporter output:

```bash
npm run verify:php
```

This command may reuse the expected local PHP/Docker server on port `8011`. If another unrelated process is using that port, stop the unrelated process before running the verification.

## Run the FastAPI E2E path

```bash
npm run test:e2e:fastapi
```

This prepares `tests/runtime-app`, starts FastAPI on `http://127.0.0.1:8001`, sets FastAPI to serve the prepared browser app, and runs the same Playwright suite against the FastAPI compatibility backend.

For line reporter output:

```bash
npm run verify:fastapi:e2e
```

The verification command sets `PLAYWRIGHT_REUSE_EXISTING_SERVER=0`, so it starts the intended disposable FastAPI server instead of reusing a server that may already be listening on port `8001`.

## Run PHP API contract tests

```bash
npm run test:contract:php
```

This runs only the API contract spec against the PHP/status quo runtime app. The Playwright `webServer` starts the PHP runtime app unless an existing server can be reused.

## Run FastAPI API contract tests

For the one-command Windows rehearsal path:

```bash
npm run verify:fastapi
```

This script prepares isolated runtime data, explicitly sets `FLEET_STORE_BACKEND=json`, starts FastAPI on port `8001`, waits for readiness, runs the API contract tests, and stops FastAPI. Explicitly selecting JSON keeps stale MariaDB shell variables from changing the default verification path by accident.

If FastAPI is already running in another terminal:

```bash
npm run test:contract:fastapi
```

Before using this manual mode, confirm the running FastAPI process is using disposable data, for example:

```powershell
$env:FLEET_DATA_DIR = "$(Get-Location)\tests\runtime-app\data"
```

## Manual FastAPI startup

From the project root, create and populate the Python virtual environment once:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r backend/requirements.txt
```

Then start FastAPI against disposable runtime data:

```powershell
npm run prepare:test-app
$env:FLEET_DATA_DIR = "$(Get-Location)\tests\runtime-app\data"
.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
```

Or use the package script:

```bash
npm run fastapi:serve
```

## Playwright server reuse safety

By default, ordinary Playwright test commands may reuse an existing local server when one is already listening on the target port. The FastAPI E2E `verify:*` commands are stricter:

- `npm run verify:fastapi:e2e` sets `PLAYWRIGHT_REUSE_EXISTING_SERVER=0`.
- `npm run verify:fastapi:mariadb:e2e` sets `PLAYWRIGHT_REUSE_EXISTING_SERVER=0`.

This matters most for the MariaDB E2E proof path. It prevents Playwright from accidentally reusing an already-running JSON-backed FastAPI process on port `8001` when the command is supposed to start a MariaDB-backed FastAPI process.

## Runtime/test data safety

- Real app data lives under the project `data/` directory.
- The production/status quo PHP app reads and writes `data/timers.json` and `data/account_views.json` when run from the real app root.
- Test runs use the disposable `tests/runtime-app` directory.
- `npm run prepare:test-app` recreates `tests/runtime-app` from app files and fixture data.
- PHP E2E and PHP contract tests use `tests/runtime-app/data` through the prepared runtime app.
- FastAPI E2E uses `tests/runtime-app/data` through `FLEET_DATA_DIR`.
- FastAPI manual API contract tests are safe only when the running FastAPI server has `FLEET_DATA_DIR` pointed at `tests/runtime-app/data`.
- Contract tests intentionally mutate timer/view JSON data and verify save, stale-write, normalization, and backup behavior.
- Runtime folders and generated reports should stay ignored by Git.
- Runtime backup files generated under `data/backups/` are local artifacts and should not be committed.

## How to know which backend is being tested

- `test:e2e`, `test:e2e:php`, `test:contract:php`, and `verify:php` mean PHP/status quo.
- `test:e2e:fastapi`, `verify:fastapi:e2e`, `test:contract:fastapi`, and `verify:fastapi` mean FastAPI compatibility.
- Full FastAPI browser E2E uses base URL `http://127.0.0.1:8001`.
- Full PHP browser E2E uses base URL `http://127.0.0.1:8011`.
- The API parity document remains `backend/API_PARITY.md`.

## Cutover rehearsal checklist

Do not cut over until all applicable items are true:

- [ ] PHP full E2E passes with `npm run test:e2e`.
- [ ] FastAPI full E2E passes with `npm run test:e2e:fastapi`.
- [ ] PHP contract tests pass with `npm run test:contract:php`.
- [ ] FastAPI contract tests pass with `npm run verify:fastapi` or equivalent.
- [ ] `backend/API_PARITY.md` has no unresolved blocking gaps.
- [ ] Runtime data paths are understood for PHP, FastAPI, tests, and production.
- [ ] Backup behavior is understood for `timers.json` and `account_views.json`.
- [ ] A real app data backup exists before any production trial.
- [ ] Rollback path is clear and PHP fallback remains available.
- [ ] Deployment target is known.
- [ ] FastAPI process supervision is understood.
- [ ] Reverse proxy behavior for `/api.php?action=...` is understood.
- [ ] The production frontend/default endpoint decision has been made deliberately.
- [ ] No database migration is accidentally bundled into the cutover.

## Remaining pre-default gaps

Before FastAPI can safely become the default backend, the project still needs a deliberate production plan for process supervision, reverse proxy routing, real-data backup/restore, rollback, and deployment. Those are intentionally outside this readiness pass.
