# Clash Fleet Manager Commands

A low-cognitive-load command reference for the project. Keep this file open in VS Code instead of hunting through `package.json`.

## Critical day-to-day commands

| Purpose | Command | Notes |
|---|---|---|
| Status quo / PHP full E2E | `npm test` | Default test command. Runs the PHP/status-quo E2E path. |
| Status quo / PHP full E2E | `npm run test:e2e` | Same practical target as `npm test`; explicit E2E name. |
| FastAPI full E2E | `npm run test:e2e:fastapi` | Runs the same app E2E suite against the FastAPI path. |
| PHP verification | `npm run verify:php` | Prepares the runtime app and runs the PHP/status-quo suite with line output. May reuse the expected local PHP/Docker server on port `8011`. |
| FastAPI contract verification | `npm run verify:fastapi` | Runs the PowerShell FastAPI contract verification wrapper and explicitly forces the default JSON store. |
| FastAPI E2E verification | `npm run verify:fastapi:e2e` | Runs the FastAPI E2E path with line output using the default JSON store. Forces a fresh test server. |
| Local FastAPI container smoke test | `npm run verify:container` | Read-only check for the local container runtime. |
| Backend unit/contract tests | `npm run test:backend` | Runs the Python backend tests against the default JSON path. |
| FastAPI MariaDB contract verification | `npm run verify:fastapi:mariadb` | Opt-in only. Requires disposable MariaDB test database variables. |
| FastAPI MariaDB E2E verification | `npm run verify:fastapi:mariadb:e2e` | Optional full browser suite against FastAPI + MariaDB test DB. Forces a fresh FastAPI server so it cannot accidentally reuse a JSON-backed server. |
| AI review zip | `npm run ai:zip` | Creates the normal AI review zip. |
| AI review dry run | `npm run ai:zip:dry` | Prints the proposed AI package contents without creating the zip. |
| AI review JSON | `npm run ai:json` | Creates structured JSON output for AI review. |
| Gemini-friendly package | `npm run ai:gemini` | Creates split zip files with a 10-file-per-zip limit. |
| Gemini-friendly package with tools | `npm run ai:gemini:tools` | Creates split zip files and includes Tools. |
| Deploy static/PHP app to NAS | `npm run deploy:nas` | Runs the older NAS deployment PowerShell script. |
| Dry-run FastAPI NAS container deployment | `npm run deploy:nas:fastapi:dry` | Safe preview of the FastAPI container deployment. Does not perform the real deployment. |
| Deploy FastAPI NAS container | `npm run deploy:nas:fastapi` | Builds/saves/copies the image, recreates the NAS container, mounts production JSON data, and smoke-tests the candidate URL. |
| Reuse existing FastAPI image for NAS deployment | `npm run deploy:nas:fastapi:reuse-image` | Skips local Docker build/save and redeploys using the existing image tar path. Useful for retrying deployment mechanics. |

## Phase 4A local FastAPI JSON container rehearsal

This rehearsal proves the FastAPI + JSON runtime shape locally before touching Synology. It serves the static app and `/api.php` compatibility route from one FastAPI container and mounts disposable JSON data from `tests/runtime-app/data`.

```powershell
npm run container:build
npm run container:run
npm run verify:container
npm run container:stop
```

Useful helpers:

| Purpose | Command | Notes |
|---|---|---|
| Prepare disposable JSON data | `npm run container:prepare-data` | Rebuilds `tests/runtime-app/data` from fixtures. `container:run` already does this. |
| Build local FastAPI JSON image | `npm run container:build` | Builds `clash-fleet-manager-fastapi-json:local`. |
| Save local image for Synology import | `npm run container:save` | Exports `clash-fleet-manager-fastapi-json-local.tar` for Synology Docker image import. |
| Run local FastAPI JSON container | `npm run container:run` | Starts `http://127.0.0.1:8001` with `FLEET_STORE_BACKEND=json` and `/data` mounted from `tests/runtime-app/data`. |
| Smoke test running container | `npm run verify:container` | Read-only check for `/`, `/api.php?action=load`, and `/api.php?action=loadViews`. |
| View container logs | `npm run container:logs` | Follows logs for `clash-fleet-manager-fastapi-json`. |
| Stop local container | `npm run container:stop` | Stops/removes the local Compose container. |

See `docs/CONTAINER_RUNTIME.md` for the full runbook.

## Phase 4B Synology Docker rehearsal

This rehearsal takes the Phase 4A image shape to Synology Docker without touching production Web Station/PHP, production data, DNS, router rules, MariaDB, nginx, or reverse proxy configuration.

Preferred local export path:

```powershell
npm run container:build
npm run container:save
```

Then import `clash-fleet-manager-fastapi-json-local.tar` into Synology Docker and create a rehearsal container with:

```text
Host port:       8002, or another unused LAN-only rehearsal port
Container port:  8001
Host data path:  /volume1/docker/clash-fleet-manager-rehearsal/data
Container path:  /data
Browser URL:     http://<synology-host-or-ip>:8002
```

Read-only smoke test from the development PC:

```powershell
node tests/support/verify-container-runtime.mjs --base-url http://<synology-host-or-ip>:8002
```

See `docs/SYNOLOGY_CONTAINER_REHEARSAL.md` for the full runbook.

## Phase 4C-B production-copy rehearsal

This is the safe step after Phase 4B. It uses copied production JSON, not the live production JSON folder.

Production-copy shape:

```text
Browser on LAN
  -> http://<synology-host-or-ip>:8003
  -> Synology Docker FastAPI container
  -> /api.php compatibility route
  -> JsonFileStore
  -> /data mounted from /volume1/docker/clash-fleet-manager-production-copy/data
```

Suggested Synology Docker settings:

```text
Container name:  clash-fleet-manager-fastapi-json-prod-copy
Host port:       8003
Container port:  8001
Host data path:  /volume1/docker/clash-fleet-manager-production-copy/data
Container path:  /data
Environment:     FLEET_STORE_BACKEND=json, FLEET_DATA_DIR=/data, FLEET_SERVE_APP=1, FLEET_APP_DIR=/app
```

Template/reference file:

```text
docker-compose.synology.production-copy.example.yml
```

Read-only smoke test for the running production-copy container:

```powershell
node tests/support/verify-container-runtime.mjs --base-url http://<synology-host-or-ip>:8003
```

Do not mount the live production JSON folder for Phase 4C-B.

## Phase 4C-C real production data mount candidate

Phase 4C is the controlled production-data planning step after the Synology Docker rehearsal. It does **not** change the production URL by default.

Default safe outcome:

```text
Existing Web Station/PHP production URL remains unchanged
FastAPI production-candidate URL uses a separate LAN-only port, usually 8004 when 8003 is still used by the production-copy rehearsal
Production JSON is not mounted until the exact folder is identified, backed up, verified, and explicitly approved
```

Production-candidate shape:

```text
Browser on LAN
  -> http://<synology-host-or-ip>:8004
  -> Synology Docker FastAPI container
  -> /api.php compatibility route
  -> JsonFileStore
  -> /data mounted from /volume1/web/clash-timers/data
```

Read-only smoke test for a running candidate container:

```powershell
node tests/support/verify-container-runtime.mjs --base-url http://<synology-host-or-ip>:8004
```

See `docs/PHASE_4C_PRODUCTION_DATA_CUTOVER.md` for the hard stop gates, backup procedure, concurrent-writer rule, rollback procedure, and Strategy A/B/C steps. Do not run mutation-heavy E2E tests against live production data.

## FastAPI NAS container deployment

These scripts automate the production-candidate FastAPI container deployment path.

Use the dry-run first:

```powershell
npm run deploy:nas:fastapi:dry
```

If the preview looks correct, run the real deployment:

```powershell
npm run deploy:nas:fastapi
```

If the build/save image step already succeeded and only the NAS deployment mechanics need to be retried, use:

```powershell
npm run deploy:nas:fastapi:reuse-image
```

Important notes:

- These commands target the configured NAS host `192.168.2.252`, SSH user `lincoln`, and SSH port `34222` from `package.json`.
- `deploy:nas:fastapi:dry` uses `-DryRun` and is the safe preview command.
- `deploy:nas:fastapi` passes `-Yes`, so it is the real deployment command.
- `deploy:nas:fastapi:reuse-image` passes `-SkipBuild -SkipSave -Yes`, so it assumes the image tar already exists.
- See `docs/PHASE_4C_D_PRODUCTION_URL_CUTOVER_RUNBOOK.md` and `backend/FASTAPI_RUNBOOK.md` before using these commands for an actual production URL cutover.

## Phase 3F FastAPI + JSON cutover rehearsal

Use this short ladder to rehearse the near-term FastAPI + JSON path while keeping PHP + JSON as rollback.

Active rehearsal path:

```text
Frontend -> FastAPI compatibility endpoint -> JsonFileStore -> JSON files
```

Rollback path:

```text
Frontend -> PHP compatibility endpoint -> JSON files
```

Validation commands:

```powershell
npm run verify:php
npm run verify:fastapi
npm run verify:fastapi:e2e
```

Notes:

- The browser still calls `api.php`; PHP vs FastAPI is decided by which runtime serves that compatibility path.
- FastAPI + JSON does not require MariaDB environment variables.
- Back up `data/timers.json` and `data/account_views.json` before any real runtime deployment switch.
- Do not run MariaDB production cutover or destructive MariaDB setup as part of Phase 3F.

See `backend/FASTAPI_RUNBOOK.md` for the cutover and rollback checklists.

## Practical workflow

### Routine application change: verify both runtimes, then deploy both

Use this as the normal change-to-deployment sequence while the PHP rollback path and FastAPI path are both being maintained:

```powershell
npm run verify:php
npm run verify:fastapi:e2e
npm run deploy:nas
npm run deploy:nas:fastapi
```

Notes:

- `verify:php` prepares the disposable test app and runs the complete PHP/status-quo Playwright suite, so a separate `prepare:test-app` step is not required.
- `verify:fastapi:e2e` prepares the disposable test app, forces a fresh FastAPI test server, runs the complete Playwright suite against FastAPI, and stops the test server afterward.
- Deploy only after both verification commands pass.

### Backend, API, or persistence change: expanded verification

Use this sequence when a change touches `backend/`, API validation or compatibility behaviour, JSON persistence, or store selection:

```powershell
npm run test:backend
npm run verify:php
npm run verify:fastapi
npm run verify:fastapi:e2e
npm run deploy:nas
npm run deploy:nas:fastapi
```

Notes:

- `test:backend` runs the Python backend test suite directly.
- `verify:fastapi` is the narrower FastAPI API-contract checkpoint and explicitly forces the default JSON store.
- `verify:fastapi:e2e` then validates the complete browser workflow against FastAPI. The contract coverage overlaps deliberately with the narrower check.

### Normal status-quo check

```bash
npm test
```

### FastAPI check

```bash
npm run test:e2e:fastapi
```

### FastAPI JSON verification ladder

```powershell
npm run verify:php
npm run verify:fastapi
npm run verify:fastapi:e2e
```

### Local container smoke test

```powershell
npm run container:build
npm run container:run
npm run verify:container
npm run container:stop
```

### Backend test check

```bash
npm run test:backend
```

### Optional MariaDB FastAPI contract check

Set the disposable `FLEET_TEST_MARIADB_*` variables first, then run:

```bash
npm run verify:fastapi:mariadb
```

### Optional MariaDB FastAPI full E2E check

Set the same disposable `FLEET_TEST_MARIADB_*` variables first, then run:

```bash
npm run verify:fastapi:mariadb:e2e
```

This verification wrapper forces Playwright to start a fresh FastAPI server, so it cannot accidentally reuse another server already listening on port `8001`.

### Create an AI review package

```bash
npm run ai:zip
```

### Preview an AI review package

```bash
npm run ai:zip:dry
```

### Create a Gemini-friendly AI review package

```bash
npm run ai:gemini
```

### Deploy static/PHP app to NAS

```bash
npm run deploy:nas
```

### Dry-run FastAPI container deployment to NAS

```powershell
npm run deploy:nas:fastapi:dry
```

### Deploy FastAPI container to NAS

```powershell
npm run deploy:nas:fastapi
```

### Retry FastAPI NAS deployment with existing image

```powershell
npm run deploy:nas:fastapi:reuse-image
```

## Passing extra options to AI packaging

For less-common combinations, keep the script list smaller and pass extra arguments after `--`.

```bash
npm run ai:zip -- --include-tools
npm run ai:json -- --include-tools
npm run ai:both -- --include-tools --max-files-per-zip 10
```

## Full script reference

This is the complete script list from `package.json`, grouped by intent.

### Testing shortcuts

| Script | Runs |
|---|---|
| `test` | `npm run test:e2e:php` |
| `test:php` | `npm run test:e2e:php` |
| `test:fastapi` | `npm run test:e2e:fastapi` |
| `test:e2e` | `npm run test:e2e:php` |
| `test:e2e:php` | `set "API_CONTRACT_TARGET=php"&& playwright test` |
| `test:e2e:fastapi` | `set "APP_E2E_TARGET=fastapi"&& playwright test` |
| `test:e2e:ui` | `set "API_CONTRACT_TARGET=php"&& playwright test --ui` |
| `test:e2e:headed` | `set "API_CONTRACT_TARGET=php"&& playwright test --headed` |
| `test:list` | `set "API_CONTRACT_TARGET=php"&& playwright test --list` |
| `test:contract:php` | `set "API_CONTRACT_TARGET=php"&& playwright test tests/e2e/api-contract.spec.js --project=chromium --reporter=line` |
| `test:contract:fastapi` | `set "API_CONTRACT_TARGET=fastapi"&& set "API_CONTRACT_FASTAPI_BASE_URL=http://127.0.0.1:8001"&& playwright test tests/e2e/api-contract.spec.js --project=chromium --reporter=line` |
| `test:api-client` | `set "API_CONTRACT_TARGET=php"&& playwright test tests/e2e/api-client.spec.js --project=chromium --reporter=line` |

### Backend tests

| Script | Runs |
|---|---|
| `test:backend` | `python -m pytest tests/backend` |
| `test:backend:mariadb` | `python -m pytest tests/backend -m mariadb` |

### Verification wrappers

| Script | Runs |
|---|---|
| `verify:php` | `node tests/support/prepare-test-app.mjs && set "API_CONTRACT_TARGET=php"&& playwright test --reporter=line` |
| `verify:fastapi` | `powershell -ExecutionPolicy Bypass -NoProfile -File .\Tools\verify-fastapi-contract.ps1` |
| `verify:fastapi:mariadb` | `powershell -ExecutionPolicy Bypass -NoProfile -File .\Tools\verify-fastapi-mariadb-contract.ps1` |
| `verify:fastapi:e2e` | `set "PLAYWRIGHT_REUSE_EXISTING_SERVER=0"&& npm run test:e2e:fastapi -- --reporter=line` |
| `verify:fastapi:mariadb:e2e` | `powershell -ExecutionPolicy Bypass -NoProfile -File .\Tools\verify-fastapi-mariadb-e2e.ps1` |
| `verify:container` | `node tests/support/verify-container-runtime.mjs` |

### Local serving / test harness

| Script | Runs |
|---|---|
| `serve:php` | `npm run prepare:test-app && npm run _serve:php` |
| `serve:fastapi` | `npm run prepare:test-app && npm run _serve:fastapi` |
| `serve:api:fastapi` | `npm run prepare:test-app && set "FLEET_DATA_DIR=%cd%\tests\runtime-app\data"&& .\.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001` |
| `serve:test:docker` | `npm run _serve:php` |
| `serve:test:fastapi` | `npm run _serve:fastapi` |
| `fastapi:serve` | `npm run serve:api:fastapi` |
| `prepare:test-app` | `node tests/support/prepare-test-app.mjs` |
| `prepare:mariadb:test-db` | `powershell -ExecutionPolicy Bypass -NoProfile -File .\Tools\prepare-mariadb-test-db.ps1 -ClearData -SeedFixtures` |
| `_serve:php` | `docker run --rm -p 8011:8011 -v "%cd%\tests\runtime-app:/app" -w /app php:8.3-cli php -S 0.0.0.0:8011` |
| `_serve:fastapi` | `node tests/support/serve-fastapi-test-app.mjs` |

### Container runtime

| Script | Runs |
|---|---|
| `container:prepare-data` | `node tests/support/prepare-test-app.mjs` |
| `container:build` | `docker compose build fastapi-json` |
| `container:save` | `docker save clash-fleet-manager-fastapi-json:local -o clash-fleet-manager-fastapi-json-local.tar` |
| `container:run` | `npm run container:prepare-data && docker compose up -d fastapi-json` |
| `container:stop` | `docker compose down` |
| `container:logs` | `docker compose logs -f fastapi-json` |

### AI review packaging

| Script | Runs |
|---|---|
| `ai:zip` | `python Tools/make-ai-review-zip.py` |
| `ai:zip:dry` | `python Tools/make-ai-review-zip.py --dry-run` |
| `ai:zip:db` | `python Tools/make-ai-review-zip.py --include-db-poc` |
| `ai:zip:tools` | `python Tools/make-ai-review-zip.py --include-tools` |
| `ai:json` | `python Tools/make-ai-review-zip.py --output-format json` |
| `ai:json:tools` | `python Tools/make-ai-review-zip.py --include-tools --output-format json` |
| `ai:both` | `python Tools/make-ai-review-zip.py --output-format both` |
| `ai:both:tools` | `python Tools/make-ai-review-zip.py --include-tools --output-format both` |
| `ai:gemini` | `python Tools/make-ai-review-zip.py --max-files-per-zip 10` |
| `ai:gemini:tools` | `python Tools/make-ai-review-zip.py --include-tools --max-files-per-zip 10` |
| `ai:zip:gemini` | `npm run ai:gemini` |
| `ai:zip:gemini:tools` | `npm run ai:gemini:tools` |
| `ai:both:gemini` | `python Tools/make-ai-review-zip.py --output-format both --max-files-per-zip 10` |
| `ai:both:gemini:tools` | `python Tools/make-ai-review-zip.py --include-tools --output-format both --max-files-per-zip 10` |

### Deployment

| Script | Runs |
|---|---|
| `deploy:nas` | `powershell -ExecutionPolicy Bypass -File .\Tools\deploy-to-nas.ps1` |
| `deploy:nas:fastapi` | `powershell -ExecutionPolicy Bypass -NoProfile -File .\Tools\deploy-fastapi-container-to-nas.ps1 -NasHost 192.168.2.252 -NasUser lincoln -SshPort 34222 -Yes` |
| `deploy:nas:fastapi:dry` | `powershell -ExecutionPolicy Bypass -NoProfile -File .\Tools\deploy-fastapi-container-to-nas.ps1 -NasHost 192.168.2.252 -NasUser lincoln -SshPort 34222 -DryRun` |
| `deploy:nas:fastapi:reuse-image` | `powershell -ExecutionPolicy Bypass -NoProfile -File .\Tools\deploy-fastapi-container-to-nas.ps1 -NasHost 192.168.2.252 -NasUser lincoln -SshPort 34222 -SkipBuild -SkipSave -Yes` |

## Naming notes

- `php` means the current/status-quo backend path.
- `fastapi` means the new backend path being used for the strangler migration.
- `container:*` scripts are for the Dockerized FastAPI + JSON runtime shape.
- `_serve:*` scripts are internal helpers. Prefer the friendlier `serve:*` commands unless Playwright or another wrapper needs the old name.
- `serve:test:*` aliases are intentionally preserved because Playwright configuration may still call those names.
- `deploy:nas` is the older static/PHP NAS deployment path.
- `deploy:nas:fastapi*` commands are the newer FastAPI container deployment path.

## Optional MariaDB validation

The default FastAPI contract verifier also forces `FLEET_STORE_BACKEND=json`, which keeps stale MariaDB shell variables from changing the normal FastAPI path by accident.

JSON remains the default store. The normal backend test command does not require MariaDB:

```bash
npm run test:backend
```

MariaDB integration tests and verification wrappers are opt-in and require explicit disposable test database variables plus `FLEET_ALLOW_MARIADB_TEST_WRITES=1`:

```powershell
$env:FLEET_TEST_MARIADB_HOST = "127.0.0.1"
$env:FLEET_TEST_MARIADB_PORT = "3306"
$env:FLEET_TEST_MARIADB_DATABASE = "clash_fleet_manager_test"
$env:FLEET_TEST_MARIADB_USER = "fleet_test_user"
$env:FLEET_TEST_MARIADB_PASSWORD = "..."
$env:FLEET_ALLOW_MARIADB_TEST_WRITES = "1"
```

The database name must contain `test`. Do not use production credentials.

```bash
npm run prepare:mariadb:test-db
npm run test:backend:mariadb
npm run verify:fastapi:mariadb
```

Optional full browser E2E proof against MariaDB:

```bash
npm run verify:fastapi:mariadb:e2e
```

These commands apply `backend/db/mariadb_schema.sql` to the disposable test database and seed the API/E2E verification path from `tests/fixtures/data`. They do not make MariaDB the default and they do not migrate production data.
