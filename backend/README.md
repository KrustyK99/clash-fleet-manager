# FastAPI compatibility backend

This backend is a backend strangler target for Clash Fleet Manager. It
intentionally preserves the existing legacy browser-facing contract instead of
introducing a new API shape.

The production app still uses `api.php` by default. This FastAPI app is an
alternate compatibility target for API contract tests and the dedicated
FastAPI-backed full-app E2E proof path.

## Runtime readiness runbook

For the PHP/FastAPI command inventory, runtime/test data safety notes, and future cutover rehearsal checklist, see [`FASTAPI_RUNBOOK.md`](FASTAPI_RUNBOOK.md).

## Endpoint

The FastAPI app exposes the same compatibility path as the PHP backend:

```text
/api.php?action=load
/api.php?action=save
/api.php?action=loadViews
/api.php?action=saveViews
```

The odd-looking `/api.php` path is deliberate. It keeps the current browser/API
contract unchanged while proving that a replacement backend can satisfy the same
behavior.

## Store seam

The FastAPI route layer delegates persistence through a small backend-facing
store contract:

```text
backend/main.py
    ↓
backend/store.py
    ↓
backend/store_factory.py
    ↓
backend/stores/json_file_store.py      # default/status quo
backend/stores/mariadb_store.py        # opt-in MariaDB test path
```

`JsonFileStore` remains the default implementation. `MariaDbStore` is an
explicitly selected bridge store for proving MariaDB behind the same `/api.php`
compatibility route. It stores the existing aggregate API documents; it is not a
normalized production data model.

## Data files

By default, the JSON-file store reads and writes JSON files from the project
`data/` directory:

```text
data/timers.json
data/account_views.json
```

For disposable contract-test data, point the FastAPI server at another directory
with `FLEET_DATA_DIR`.

PowerShell:

```powershell
$env:FLEET_DATA_DIR = "$(Get-Location)\tests\runtime-app\data"
```

macOS/Linux shells:

```sh
export FLEET_DATA_DIR="$PWD/tests/runtime-app/data"
```

`FLEET_DATA_DIR` is read by FastAPI. It tells the FastAPI JSON store where to
read and write JSON data.

## Run locally

From the project root:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r backend/requirements.txt
node tests/support/prepare-test-app.mjs
$env:FLEET_DATA_DIR = "$(Get-Location)\tests\runtime-app\data"
.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
```

On macOS/Linux shells:

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install -r backend/requirements.txt
node tests/support/prepare-test-app.mjs
export FLEET_DATA_DIR="$PWD/tests/runtime-app/data"
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
```

## Run the contract tests against FastAPI

Keep the FastAPI server running in one terminal. In another terminal, run:

```powershell
$env:API_CONTRACT_TARGET="fastapi"
$env:API_CONTRACT_FASTAPI_BASE_URL="http://127.0.0.1:8001"
npx playwright test tests/e2e/api-contract.spec.js --project=chromium --reporter=line
```

On macOS/Linux shells:

```sh
API_CONTRACT_TARGET=fastapi \
API_CONTRACT_FASTAPI_BASE_URL=http://127.0.0.1:8001 \
npx playwright test tests/e2e/api-contract.spec.js --project=chromium --reporter=line
```

`API_CONTRACT_TARGET=fastapi` is read by the Playwright contract tests. It tells
the tests to call the running FastAPI server instead of the PHP runtime app.

`API_CONTRACT_FASTAPI_BASE_URL` is also read by Playwright. It tells the tests
where the already-running FastAPI server is listening.

These Playwright settings do not start FastAPI. The FastAPI server must already
be running in a separate terminal.

## Run the full browser app against FastAPI

PHP remains the default/status quo E2E path. To prove the browser app can run
through the FastAPI strangler backend, use the dedicated FastAPI E2E command:

```powershell
npm run test:e2e:fastapi
```

For line output:

```powershell
npm run verify:fastapi:e2e
```

This path still prepares the disposable `tests/runtime-app` directory. It then
starts FastAPI on port `8001` with:

```text
FLEET_DATA_DIR=tests/runtime-app/data
FLEET_SERVE_APP=1
FLEET_APP_DIR=tests/runtime-app
```

`FLEET_SERVE_APP=1` is test-only. It tells FastAPI to serve the prepared browser
app files from `FLEET_APP_DIR` on the same origin as `/api.php?action=...`, so
the browser app can exercise the existing compatibility route without CORS or
production data changes.

## Default PHP-backed app tests

PHP remains the default app backend and default test target:

```powershell
npm run test:e2e
```

For line output:

```powershell
npm run verify:php
```

The browser-facing frontend contract remains unchanged.

## Store backend selection

JSON-file storage remains the default FastAPI backend store. Leaving
`FLEET_STORE_BACKEND` unset uses JSON.

```powershell
$env:FLEET_STORE_BACKEND = "json"
```

MariaDB is opt-in only:

```powershell
$env:FLEET_STORE_BACKEND = "mariadb"
$env:FLEET_MARIADB_HOST = "127.0.0.1"
$env:FLEET_MARIADB_PORT = "3306"
$env:FLEET_MARIADB_DATABASE = "clash_fleet_manager_test"
$env:FLEET_MARIADB_USER = "fleet_test_user"
$env:FLEET_MARIADB_PASSWORD = "..."
```

Apply the schema before starting FastAPI with the MariaDB store:

```text
backend/db/mariadb_schema.sql
```

This schema stores the current aggregate documents (`timers` and
`account_views`) behind the existing `FleetStore` contract. It does not normalize
timers, migrate production data, or change the `/api.php?action=...`
compatibility route.

## Disposable MariaDB test database

MariaDB validation must use a disposable test database. The test database name
must contain `test`, and destructive setup/reset actions require the extra write
allowance variable.

```powershell
$env:FLEET_TEST_MARIADB_HOST = "127.0.0.1"
$env:FLEET_TEST_MARIADB_PORT = "3306"
$env:FLEET_TEST_MARIADB_DATABASE = "clash_fleet_manager_test"
$env:FLEET_TEST_MARIADB_USER = "fleet_test_user"
$env:FLEET_TEST_MARIADB_PASSWORD = "..."
$env:FLEET_ALLOW_MARIADB_TEST_WRITES = "1"
```

Prepare the disposable test database from the project schema and seeded test
fixtures:

```powershell
npm run prepare:mariadb:test-db
```

Run the optional MariaDB backend store contract tests:

```powershell
npm run test:backend:mariadb
```

Run the FastAPI API contract against MariaDB:

```powershell
npm run verify:fastapi:mariadb
```

Optionally run the full FastAPI browser E2E suite against MariaDB:

```powershell
npm run verify:fastapi:mariadb:e2e
```

The existing default JSON safety paths stay unchanged:

```powershell
npm run test:backend
npm run verify:fastapi
npm run verify:fastapi:e2e
```

Do not use production credentials or production-looking database names for any
MariaDB validation command. This phase proves the opt-in store path only; it does
not migrate production data.
