# Clash Fleet Manager API Contract

## Purpose

This document records the current browser-facing contract for `api.php`. It is a practical reference for tests and future backend work, not a full backend design document.

The current app still uses classic browser scripts and a PHP JSON-file backend. The browser transport boundary is isolated in `app-api-client.js` through `window.FleetApiClient`. UI code should continue calling that client instead of calling `api.php` directly.

## Why this matters

A future backend strangler can safely replace the PHP/file-backed API only if the replacement preserves the contract the browser already depends on. The future backend can either implement this contract directly or adapt a different backend shape inside `app-api-client.js`, without forcing unrelated UI changes.

## Browser-facing client boundary

`app-api-client.js` exposes the current API surface:

- `window.FleetApiClient.loadTimers()`
- `window.FleetApiClient.saveTimers(payload)`
- `window.FleetApiClient.loadAccountViews()`
- `window.FleetApiClient.saveAccountViews(payload)`

These methods call `api.php?action=...` and return parsed JSON. Non-2xx responses are converted into thrown errors with `status`, `code`, and `payload` fields when provided by the API.

## Endpoints

### `GET api.php?action=load`

Loads timer data.

Response shape:

```json
{
  "schemaVersion": 2,
  "lastUpdated": "string or null",
  "timers": [],
  "accountSnapshotMeta": {}
}
```

Notes:

- `timers` is always expected to be an array.
- `accountSnapshotMeta` is expected to be an object, even when empty.
- If the timer data file is invalid, the API returns an error response.

### `POST api.php?action=save`

Saves the full timer list.

Request shape:

```json
{
  "lastKnownLastUpdated": "string or null",
  "timers": [],
  "accountSnapshotMeta": {}
}
```

Required fields:

- `timers` must be an array.

Compatibility behavior:

- Older clients may omit `accountSnapshotMeta`.
- When omitted, the API preserves the existing server-side `accountSnapshotMeta` instead of replacing it with an empty object.

Stale-data behavior:

- The API compares `lastKnownLastUpdated` with the current server `lastUpdated`.
- If the current server value exists and does not match the incoming value, the save is rejected with HTTP `409`.

Stale response shape:

```json
{
  "error": "Timer data changed on another device. Reload before saving.",
  "code": "STALE_DATA",
  "currentLastUpdated": "string",
  "lastKnownLastUpdated": "string or null"
}
```

Success response shape:

```json
{
  "ok": true,
  "lastUpdated": "string",
  "backupCreated": "string or null"
}
```

Backup behavior:

- Before overwriting an existing timer file, the API creates a backup in `data/backups`.
- Timer backup filenames use the `timers-` prefix.
- `backupCreated` contains the backup basename when a backup was created.

Method and payload errors:

- Non-POST requests return HTTP `405`.
- Invalid JSON returns HTTP `400`.
- Payloads without a `timers` array return HTTP `400`.

### `GET api.php?action=loadViews`

Loads saved account views and shared app settings.

Response shape:

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

System view normalization:

The first/system view is normalized to:

```json
{
  "id": "all",
  "label": "All Accounts",
  "accounts": null,
  "system": true
}
```

Notes:

- `views` is expected to be an array.
- `snapshotFreshnessSettings` is expected to be an object.
- `freshHours` and `agingHours` are numbers, and `agingHours` should be greater than `freshHours`.
- `accountTagMap` is expected to be an object.
- If the saved-view data file is invalid, the API returns an error response.

### `POST api.php?action=saveViews`

Saves account views and shared app settings.

Request shape:

```json
{
  "lastKnownLastUpdated": "string or null",
  "views": [],
  "snapshotFreshnessSettings": {
    "freshHours": 24,
    "agingHours": 72
  },
  "accountTagMap": {}
}
```

Required fields:

- `views` must be an array.

Compatibility behavior:

- Older clients may omit `snapshotFreshnessSettings`.
- Older clients may omit `accountTagMap`.
- When either field is omitted, the API preserves the existing server-side value instead of replacing it with defaults or an empty object.

Stale-data behavior:

- The API compares `lastKnownLastUpdated` with the current server `lastUpdated`.
- If the current server value exists and does not match the incoming value, the save is rejected with HTTP `409`.

Stale response shape:

```json
{
  "error": "Saved Views changed on another device. Reload before saving.",
  "code": "STALE_VIEWS",
  "currentLastUpdated": "string",
  "lastKnownLastUpdated": "string or null"
}
```

Success response shape:

```json
{
  "ok": true,
  "lastUpdated": "string",
  "backupCreated": "string or null"
}
```

Backup behavior:

- Before overwriting an existing saved-view file, the API creates a backup in `data/backups`.
- Saved-view backup filenames use the `account-views-` prefix.
- `backupCreated` contains the backup basename when a backup was created.

Method and payload errors:

- Non-POST requests return HTTP `405`.
- Invalid JSON returns HTTP `400`.
- Payloads without a `views` array return HTTP `400`.

## Unknown actions and errors

Unknown `action` values return an error response. The current PHP API returns HTTP `400` for unsupported actions.

Error responses are JSON and include an `error` string. Some conflict responses also include a stable `code` field that client code can use for specific handling.

## Future migration note

When FastAPI or another backend is introduced, keep the UI stable by preserving this contract at the boundary. The preferred options are:

1. Implement these endpoint contracts directly in the new backend.
2. Adapt any new backend shape inside `app-api-client.js` while leaving the rest of the browser code unchanged.

A backend strangler should be able to pass the API contract tests before the UI is pointed at it.
