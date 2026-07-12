# API parity map: PHP and FastAPI compatibility route

## Scope

This document maps the current browser-facing `/api.php?action=...` API surface across the PHP backend, the FastAPI strangler backend, the frontend API client, and the current test coverage.

This is a behaviour-parity record, not a redesign. PHP remains the default/status quo backend. FastAPI remains a compatibility backend that exposes the same `/api.php?action=...` route and still uses JSON-file persistence.

## Summary

- PHP remains the default backend.
- PHP currently supports 4 known actions: `load`, `save`, `loadViews`, and `saveViews`.
- FastAPI currently implements all 4 known PHP actions through `backend/main.py` and the JSON-file store.
- `app-api-client.js` calls all 4 actions and is the intended browser API boundary.
- API contract coverage exists for all 4 actions.
- The full browser E2E path directly covers app startup/loading and saved-view loading. Timer/view saves are covered mainly by focused API contract tests and the isolated API client tests, not by broad duplicate full-app save flows.
- No database work is part of this parity pass.

## Action parity table

| Action | PHP | FastAPI | Frontend caller | Contract tested | E2E covered | Notes |
| ------ | --- | ------- | --------------- | --------------- | ----------- | ----- |
| `load` | yes | yes | `window.FleetApiClient.loadTimers()` in `app-api-client.js`; called by `load()` in `app-main.js` | yes | yes | Reads `data/timers.json`; response includes `schemaVersion`, `lastUpdated`, `timers`, and `accountSnapshotMeta`. FastAPI normalizes missing/invalid `timers` and `accountSnapshotMeta` more defensively, but preserves the browser-visible contract for valid app data. |
| `save` | yes | yes | `window.FleetApiClient.saveTimers(payload)` in `app-api-client.js`; called by `save()` in `app-main.js` | yes | limited | Requires POST and a `timers` array. Uses `lastKnownLastUpdated` stale-write protection. Preserves existing `accountSnapshotMeta` when older clients omit it. Creates `timers-*.json` backups before overwriting existing data. |
| `loadViews` | yes | yes | `window.FleetApiClient.loadAccountViews()` in `app-api-client.js`; called by `loadAccountViews()` in `app-main.js` | yes | yes | Reads `data/account_views.json`; normalizes the required system `all` view, snapshot freshness settings, and account tag map. Supports legacy nested `settings` values for freshness/tag-map data. |
| `saveViews` | yes | yes | `window.FleetApiClient.saveAccountViews(payload)` in `app-api-client.js`; called by `saveAccountViews()` in `app-main.js` | yes | limited | Requires POST and a `views` array. Uses `lastKnownLastUpdated` stale-write protection. Preserves existing freshness settings and account tag map when older clients omit them. Creates `account-views-*.json` backups before overwriting existing data. |
| unknown action | yes | yes | not called by frontend | yes | no | Returns JSON error with HTTP `400`. The frontend should not call unsupported actions. |

## Detailed action inventory

### `GET /api.php?action=load`

- **Purpose:** Load timer data for the app.
- **PHP implementation:** `api.php` action branch `load`.
- **FastAPI implementation:** `backend/main.py` route branch `action == "load"`, delegated to `JsonFileStore.load_timers()`.
- **Request parameters:** Query string `action=load` only.
- **Request body:** none.
- **Response shape:**

```json
{
  "schemaVersion": 2,
  "lastUpdated": "string or null",
  "timers": [],
  "accountSnapshotMeta": {}
}
```

- **Files read:** `data/timers.json`.
- **Files written:** none during the load action itself. Both backends create default store files during bootstrap/ensure-file setup if the data file is missing.
- **Backup behaviour:** none.
- **Stale-write behaviour:** none.
- **Error behaviour:** invalid timer data returns JSON with an `error` string and HTTP `500`.
- **Frontend caller:** `window.FleetApiClient.loadTimers()`; used by `load()` in `app-main.js`.
- **Contract tests:** `tests/e2e/api-contract.spec.js` verifies status, schema version, `timers` array, `accountSnapshotMeta` object, and `lastUpdated` type.
- **E2E coverage:** full app startup depends on it; `baseline.spec.js` also directly checks the endpoint.

### `POST /api.php?action=save`

- **Purpose:** Save the full timer data payload.
- **PHP implementation:** `api.php` action branch `save`.
- **FastAPI implementation:** `backend/main.py` route branch `action == "save"`, delegated to `JsonFileStore.save_timers()`.
- **Request parameters:** Query string `action=save`.
- **Request body shape:**

```json
{
  "schemaVersion": 2,
  "lastKnownLastUpdated": "string or null",
  "timers": [],
  "accountSnapshotMeta": {}
}
```

- **Required fields:** `timers` must be an array.
- **Response shape on success:**

```json
{
  "ok": true,
  "lastUpdated": "string",
  "backupCreated": "string or null"
}
```

- **Files read:** `data/timers.json`.
- **Files written:** `data/timers.json`; backup file in `data/backups` when existing data is overwritten.
- **Backup behaviour:** creates `timers-YYYYMMDD-HHMMSS-micros.json`; prunes old timer backups after the configured max.
- **Stale-write behaviour:** rejects the save with HTTP `409` and code `STALE_DATA` when current server `lastUpdated` is non-empty and differs from incoming `lastKnownLastUpdated`.
- **Compatibility behaviour:** if `accountSnapshotMeta` is omitted by an older client, the backend preserves the existing server-side metadata. Legacy `snapshotMeta` is also accepted as a fallback source while normalizing existing metadata.
- **Error behaviour:**
  - non-POST returns HTTP `405` with JSON `error`.
  - invalid JSON returns HTTP `400` with JSON `error`.
  - missing/non-array `timers` returns HTTP `400` with JSON `error`.
  - invalid current data file returns HTTP `500` and cancels the save.
- **Frontend caller:** `window.FleetApiClient.saveTimers(payload)`; used by `save()` in `app-main.js`.
- **Contract tests:** stale rejection, required payload, invalid JSON, successful save response, backup prefix, and older-client metadata preservation.
- **E2E coverage:** isolated API client test verifies the browser client sends POST to `?action=save`; full broad E2E does not duplicate a separate user save workflow for this contract.

### `GET /api.php?action=loadViews`

- **Purpose:** Load saved account views and shared app settings.
- **PHP implementation:** `api.php` action branch `loadViews`.
- **FastAPI implementation:** `backend/main.py` route branch `action == "loadViews"`, delegated to `JsonFileStore.load_account_views()`.
- **Request parameters:** Query string `action=loadViews` only.
- **Request body:** none.
- **Response shape:**

```json
{
  "schemaVersion": 3,
  "lastUpdated": "string or null",
  "views": [],
  "snapshotFreshnessSettings": {
    "freshHours": 24,
    "agingHours": 72
  },
  "accountTagMap": {}
}
```

- **Files read:** `data/account_views.json`.
- **Files written:** none during the load action itself. Both backends create default store files during bootstrap/ensure-file setup if the views file is missing.
- **Backup behaviour:** none.
- **Stale-write behaviour:** none.
- **Compatibility behaviour:** normalizes the required `all` system view; accepts legacy nested `settings.snapshotFreshnessSettings` and `settings.accountTagMap` as fallbacks.
- **Error behaviour:** invalid saved-view data returns JSON with an `error` string and HTTP `500`.
- **Frontend caller:** `window.FleetApiClient.loadAccountViews()`; used by `loadAccountViews()` in `app-main.js`.
- **Contract tests:** status, schema version, system view, freshness settings shape, settings ordering rule, and account tag map object.
- **E2E coverage:** full app startup/saved-view UI depends on it; `baseline.spec.js` directly checks the endpoint and saved-view scoping.

### `POST /api.php?action=saveViews`

- **Purpose:** Save account views and shared app settings.
- **PHP implementation:** `api.php` action branch `saveViews`.
- **FastAPI implementation:** `backend/main.py` route branch `action == "saveViews"`, delegated to `JsonFileStore.save_account_views()`.
- **Request parameters:** Query string `action=saveViews`.
- **Request body shape:**

```json
{
  "schemaVersion": 3,
  "lastKnownLastUpdated": "string or null",
  "views": [],
  "snapshotFreshnessSettings": {
    "freshHours": 24,
    "agingHours": 72
  },
  "accountTagMap": {}
}
```

- **Required fields:** `views` must be an array.
- **Response shape on success:**

```json
{
  "ok": true,
  "lastUpdated": "string",
  "backupCreated": "string or null"
}
```

- **Files read:** `data/account_views.json`.
- **Files written:** `data/account_views.json`; backup file in `data/backups` when existing data is overwritten.
- **Backup behaviour:** creates `account-views-YYYYMMDD-HHMMSS-micros.json`; prunes old account-view backups after the configured max.
- **Stale-write behaviour:** rejects the save with HTTP `409` and code `STALE_VIEWS` when current server `lastUpdated` is non-empty and differs from incoming `lastKnownLastUpdated`.
- **Compatibility behaviour:** if `snapshotFreshnessSettings` or `accountTagMap` is omitted by an older client, the backend preserves the existing server-side values. Legacy nested `settings` values are also used as fallbacks.
- **Normalization behaviour:** normalizes the `all` system view, trims labels/accounts, deduplicates view IDs and accounts, clamps freshness settings, and normalizes account tag map keys.
- **Error behaviour:**
  - non-POST returns HTTP `405` with JSON `error`.
  - invalid JSON returns HTTP `400` with JSON `error`.
  - missing/non-array `views` returns HTTP `400` with JSON `error`.
  - invalid current views file returns HTTP `500` and cancels the save.
- **Frontend caller:** `window.FleetApiClient.saveAccountViews(payload)`; used by `saveAccountViews()` and quiet account-tag-map saves in `app-main.js`.
- **Contract tests:** stale rejection, required payload, invalid JSON, successful save response, backup prefix, older-client setting preservation, and normalization of views/freshness settings/account tag map.
- **E2E coverage:** isolated API client test verifies the browser client sends POST to `?action=saveViews`; full broad E2E covers saved-view UI loading/scoping but does not duplicate a separate saved-view write workflow for this contract.

## PHP/FastAPI parity notes

- **Route shape:** both backends intentionally expose `/api.php?action=...` for compatibility.
- **Default action:** both treat omitted `action` as `load`.
- **Known actions:** both support exactly the current browser API surface: `load`, `save`, `loadViews`, and `saveViews`.
- **Unknown action:** both return HTTP `400` with a JSON `error` field.
- **Write methods:** both require POST for `save` and `saveViews`; GET write attempts return HTTP `405` with a JSON `error` field.
- **Stale writes:** both use `lastKnownLastUpdated` against the current file `lastUpdated` and return HTTP `409` with stable `code`, `currentLastUpdated`, and `lastKnownLastUpdated` fields.
- **Backups:** both create file backups before overwriting existing JSON files and return the backup basename in `backupCreated`.
- **JSON store:** both currently use JSON files. FastAPI has a store seam for future backend replacement, but MariaDB/database work is intentionally out of scope here.
- **Small implementation differences:** FastAPI defensively normalizes some loaded timer defaults (`schemaVersion`, `timers`, `accountSnapshotMeta`) before returning valid app data. For the current browser contract and fixtures, this is compatible with PHP behaviour. Backup failure wording is not identical in every low-level failure path, but those paths are not part of the browser-visible happy-path contract and were not changed in this pass.

## How to run

PHP/status quo full browser E2E:

```bash
npm run test:e2e
```

FastAPI full browser E2E:

```bash
npm run test:e2e:fastapi
```

FastAPI contract tests:

```bash
npm run verify:fastapi
```

or, with a FastAPI server already running on port `8001`:

```bash
npm run test:contract:fastapi
```

PHP contract tests:

```bash
npm run test:contract:php
```

The default full-app E2E path remains PHP/status quo. The FastAPI path remains explicit.
