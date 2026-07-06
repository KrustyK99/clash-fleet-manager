# FastAPI compatibility backend

This backend is a backend strangler target for Clash Fleet Manager. It
intentionally preserves the existing legacy browser-facing contract instead of
introducing a new API shape.

The production app still uses `api.php` by default. This FastAPI app is an
alternate compatibility target for API contract tests only.

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
backend/stores/json_file_store.py
```

For now, `JsonFileStore` is the only real implementation. The seam exists so a
future MariaDB-backed store can be introduced without changing the `/api.php`
compatibility route contract.

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

## Default PHP-backed app tests

PHP remains the default app backend and default test target:

```powershell
node tests/support/prepare-test-app.mjs
npm.cmd run test:e2e -- --reporter=line
```

The browser-facing frontend contract remains unchanged.
