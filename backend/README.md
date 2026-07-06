# FastAPI compatibility backend

This backend is the first backend strangler target for Clash Fleet Manager.
It intentionally preserves the existing legacy browser-facing contract instead
of introducing a new API shape.

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

## Data files

By default, the backend reads and writes JSON files from the project `data/`
directory:

```text
data/timers.json
data/account_views.json
```

For disposable contract-test data, point the backend at another directory with:

```text
FLEET_DATA_DIR=tests/runtime-app/data
```

On Windows PowerShell:

```powershell
$env:FLEET_DATA_DIR="tests/runtime-app/data"
```

## Run locally

From the project root:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r backend/requirements.txt
$env:FLEET_DATA_DIR="tests/runtime-app/data"
.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
```

On macOS/Linux shells:

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install -r backend/requirements.txt
export FLEET_DATA_DIR=tests/runtime-app/data
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
```

## Run the contract tests against FastAPI

In another terminal:

```powershell
npm run prepare:test-app
$env:API_CONTRACT_TARGET="fastapi"
$env:API_CONTRACT_FASTAPI_BASE_URL="http://127.0.0.1:8001"
npx playwright test tests/e2e/api-contract.spec.js --project=chromium
```

On macOS/Linux shells:

```sh
npm run prepare:test-app
API_CONTRACT_TARGET=fastapi \
API_CONTRACT_FASTAPI_BASE_URL=http://127.0.0.1:8001 \
npx playwright test tests/e2e/api-contract.spec.js --project=chromium
```

The normal app/test path remains PHP-backed:

```sh
npm run test:e2e
```
