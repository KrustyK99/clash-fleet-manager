# Snapshot SQLite POC

This is an isolated proof-of-concept for storing Clash of Clans account snapshot JSON in SQLite through a small PHP API.

## Files

- `snapshot_sqlite_poc.html` - isolated browser page for pasting/dropping snapshot JSON, validating it, saving it, listing saved snapshots, loading saved raw JSON, and deleting test snapshots.
- `snapshot_sqlite_api_poc.php` - standalone PHP API that creates and writes to `data/snapshots.sqlite`.

## Deploy

Put both files in the same folder on the web server, for example beside the current `index.html` and `api.php`.

Open:

```text
snapshot_sqlite_poc.html
```

The page defaults to this API endpoint:

```text
snapshot_sqlite_api_poc.php
```

The API creates the SQLite database automatically at:

```text
data/snapshots.sqlite
```

## API actions

```text
GET  snapshot_sqlite_api_poc.php?action=health
POST snapshot_sqlite_api_poc.php?action=saveSnapshot
GET  snapshot_sqlite_api_poc.php?action=listSnapshots
GET  snapshot_sqlite_api_poc.php?action=getSnapshot&id=1
POST snapshot_sqlite_api_poc.php?action=deleteSnapshot
```

## saveSnapshot payload

```json
{
  "accountName": "Heisenberg",
  "source": "manual-paste",
  "notes": "Optional note",
  "snapshotJson": "{...raw Clash snapshot JSON...}"
}
```

## Database tables

```sql
snapshots
snapshot_timer_candidates
```

`snapshots` stores the raw JSON, account name, player tag, snapshot timestamp, import timestamp, SHA-256 hash, raw size, notes, source, and parsed summary JSON.

`snapshot_timer_candidates` stores one row for each object found in the snapshot that has a positive `timer` value.

## PHP requirement

The PHP environment must have the PDO SQLite driver enabled. The health endpoint will return a clear error if SQLite is unavailable.
