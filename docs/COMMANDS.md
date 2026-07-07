# Clash Fleet Manager Commands

A low-cognitive-load command reference for the project. Keep this file open in VS Code instead of hunting through `package.json`.

## Critical day-to-day commands

| Purpose | Command | Notes |
|---|---|---|
| Status quo / PHP full E2E | `npm test` | Default test command. Runs the PHP/status-quo E2E path. |
| Status quo / PHP full E2E | `npm run test:e2e` | Same practical target as `npm test`; explicit E2E name. |
| FastAPI full E2E | `npm run test:e2e:fastapi` | Runs the same app E2E suite against the FastAPI path. |
| PHP verification | `npm run verify:php` | Prepares the runtime app and runs the PHP/status-quo suite with line output. |
| FastAPI contract verification | `npm run verify:fastapi` | Runs the PowerShell FastAPI contract verification wrapper using the default JSON store. |
| FastAPI MariaDB contract verification | `npm run verify:fastapi:mariadb` | Opt-in only. Requires disposable MariaDB test database variables. |
| FastAPI E2E verification | `npm run verify:fastapi:e2e` | Runs the FastAPI E2E path with line output using the default JSON store. |
| FastAPI MariaDB E2E verification | `npm run verify:fastapi:mariadb:e2e` | Optional full browser suite against FastAPI + MariaDB test DB. |
| AI review zip | `npm run ai:zip` | Creates the normal AI review zip. |
| AI review JSON | `npm run ai:json` | Creates structured JSON output for AI review. |
| Gemini-friendly package | `npm run ai:gemini` | Creates split zip files with a 10-file-per-zip limit. |
| Gemini-friendly package with tools | `npm run ai:gemini:tools` | Creates split zip files and includes Tools. |
| Deploy to NAS | `npm run deploy:nas` | Runs the NAS deployment PowerShell script. |

## Practical workflow

### Normal status-quo check

```bash
npm test
```

### FastAPI check

```bash
npm run test:e2e:fastapi
```

### Optional MariaDB FastAPI contract check

Set the disposable `FLEET_TEST_MARIADB_*` variables first, then run:

```bash
npm run verify:fastapi:mariadb
```

### Create an AI review package

```bash
npm run ai:zip
```

### Create a Gemini-friendly AI review package

```bash
npm run ai:gemini
```

### Deploy to NAS

```bash
npm run deploy:nas
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

### Verification wrappers

| Script | Runs |
|---|---|
| `verify:php` | `node tests/support/prepare-test-app.mjs && set "API_CONTRACT_TARGET=php"&& playwright test --reporter=line` |
| `verify:fastapi` | `powershell -ExecutionPolicy Bypass -NoProfile -File .\Tools\verify-fastapi-contract.ps1` |
| `verify:fastapi:mariadb` | `powershell -ExecutionPolicy Bypass -NoProfile -File .\Tools\verify-fastapi-mariadb-contract.ps1` |
| `verify:fastapi:e2e` | `npm run test:e2e:fastapi -- --reporter=line` |
| `verify:fastapi:mariadb:e2e` | `powershell -ExecutionPolicy Bypass -NoProfile -File .\Tools\verify-fastapi-mariadb-e2e.ps1` |

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


## Naming notes

- `php` means the current/status-quo backend path.
- `fastapi` means the new backend path being used for the strangler migration.
- `_serve:*` scripts are internal helpers. Prefer the friendlier `serve:*` commands unless Playwright or another wrapper needs the old name.
- `serve:test:*` aliases are intentionally preserved because Playwright configuration may still call those names.

## Optional MariaDB validation

JSON remains the default store. The normal backend test command does not require
MariaDB:

```bash
npm run test:backend
```

MariaDB integration tests and verification wrappers are opt-in and require
explicit disposable test database variables plus `FLEET_ALLOW_MARIADB_TEST_WRITES=1`:

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

These commands apply `backend/db/mariadb_schema.sql` to the disposable test
database and seed the API/E2E verification path from `tests/fixtures/data`.
They do not make MariaDB the default and they do not migrate production data.
