# Clash Fleet Manager Commands

A low-cognitive-load command reference for the project. Keep this file open in VS Code instead of hunting through `package.json`.

## Critical day-to-day commands

| Purpose | Command | Notes |
|---|---|---|
| Status quo / PHP full E2E | `npm test` | Default test command. Runs the PHP/status-quo E2E path. |
| Status quo / PHP full E2E | `npm run test:e2e` | Same practical target as `npm test`; explicit E2E name. |
| FastAPI full E2E | `npm run test:e2e:fastapi` | Runs the same app E2E suite against the FastAPI path. |
| PHP verification | `npm run verify:php` | Prepares the runtime app and runs the PHP/status-quo suite with line output. |
| FastAPI contract verification | `npm run verify:fastapi` | Runs the PowerShell FastAPI contract verification wrapper. |
| FastAPI E2E verification | `npm run verify:fastapi:e2e` | Runs the FastAPI E2E path with line output. |
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
| `verify:fastapi:e2e` | `npm run test:e2e:fastapi -- --reporter=line` |

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
