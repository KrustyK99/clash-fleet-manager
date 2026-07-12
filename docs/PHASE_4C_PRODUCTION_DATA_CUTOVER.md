# Phase 4C Production-Copy, Production Data Mount, and Controlled Cutover Plan

This runbook is for the controlled Phase 4C steps after the Phase 4B Synology Docker rehearsal. It covers the safer production-copy rehearsal before any real production-data mount.

Phase 4C does **not** cut over the production URL. It does **not** change DNS, router rules, reverse proxy settings, Web Station configuration, or MariaDB production state.

The goal is to decide safely whether the proven FastAPI JSON container can run against production-shaped JSON data, while keeping the existing Web Station/PHP app available as rollback.

## Current known state from the repo

Proven rollback/status-quo path:

```text
Frontend -> PHP compatibility endpoint -> JSON files
```

Proven FastAPI JSON path:

```text
Frontend -> FastAPI compatibility endpoint -> JsonFileStore -> JSON files
```

Synology Phase 4B proved the same container shape against disposable NAS-mounted JSON data:

```text
Browser on LAN
  -> http://<synology-host-or-ip>:8002
  -> Synology Docker container
  -> FastAPI serving static frontend and /api.php
  -> JsonFileStore
  -> disposable JSON folder mounted at /data
```

The container image listens on container port `8001`. The Synology rehearsal used host port `8002`. Phase 4C-B used host port `8003` for the production-copy rehearsal. Phase 4C-C should use a separate production-candidate host port, normally `8004`, so live production data is clearly separated from copied production data.

Phase 4C-B has its own copied-data template:

```text
docker-compose.synology.production-copy.example.yml
```

That template is intentionally separate from:

```text
docker-compose.synology.production-candidate.example.yml
```

The production-copy template mounts `/volume1/docker/clash-fleet-manager-production-copy/data` to `/data`. The production-candidate template is reserved for the later real production-data mount after backups and explicit approval.

## Hard stop gates

Do not mount the real production JSON folder read/write into a container until all of these are true:

- [ ] Exact production Web Station/PHP app URL identified.
- [ ] Exact production app folder identified.
- [ ] Exact production JSON folder identified.
- [ ] Production `timers.json` path identified.
- [ ] Production `account_views.json` path identified.
- [ ] Any other production JSON files used by the app identified.
- [ ] Backup destination chosen.
- [ ] Backup completed.
- [ ] Backup verified as readable and non-empty.
- [ ] Rollback procedure reviewed.
- [ ] Concurrent-writer risk reviewed.
- [ ] Explicit approval received to mount production data.

If any item is unknown, stop and use Strategy A or Strategy B instead.

## Strategy choice

### Strategy A — planning only

Use this when the production URL or production JSON folder is not yet confirmed, or when you do not want to touch production data.

Outcome:

- Runbook exists.
- Production-specific fields are filled in later.
- No production data is copied, mounted, or modified.

### Strategy B — production-copy rehearsal

Use this when you want to prove the current production data shape without touching live production files.

Outcome:

- Copy production JSON files into a separate NAS folder.
- Mount the copy into the FastAPI container at `/data`.
- Test reads and optional writes against the copy only.
- Production Web Station/PHP data remains untouched.
- The container volume must point at the copied folder, not the live production folder.

Suggested copy folder:

```text
/volume1/docker/clash-fleet-manager-production-copy/data
```

Suggested container name:

```text
clash-fleet-manager-fastapi-json-prod-copy
```

Suggested URL:

```text
http://<synology-host-or-ip>:8003
```

### Strategy C — production-candidate real data mount

Use this only after the hard stop gates are complete.

Outcome:

- Real production JSON folder is mounted read/write into the FastAPI container at `/data`.
- Container is exposed only on a separate LAN-only port.
- Current production Web Station/PHP URL remains unchanged and available for rollback.
- Only one app is used as a writer during the test.

Suggested URL:

```text
http://<synology-host-or-ip>:8004
```

### Strategy D — production URL cutover

Do not do this in Phase 4C by default.

Changing Web Station, reverse proxy, DNS, router, or the public/normal production URL belongs in a later phase.

## Production data discovery worksheet

Fill these in before Strategy C:

| Field | Value |
|---|---|
| Synology host/IP | `TODO` |
| Current production Web Station/PHP URL | `TODO` |
| Current production app folder | `TODO` |
| Current production JSON folder | `/volume1/web/clash-timers/data` |
| Production `timers.json` path | `/volume1/web/clash-timers/data/timers.json` |
| Production `account_views.json` path | `/volume1/web/clash-timers/data/account_views.json` |
| Other JSON files used by production app | `TODO` |
| FastAPI production-candidate host port | `8004` unless unavailable |
| FastAPI production-candidate URL | `http://<synology-host-or-ip>:8004` |

Expected production JSON files based on the current app contract:

```text
timers.json
account_views.json
```

The app may also create a `backups/` folder inside the mounted data folder when writes occur. Those runtime backups are not a replacement for the pre-test production backup.

## Backup procedure before any real production mount

Preferred backup destination:

```text
/volume1/web/clash-timers/data/backups/phase-4c-c-before-fastapi-live-data-mount-YYYYMMDD-HHMMSS/
```

At minimum, copy:

```text
<production-json-folder>/timers.json
<production-json-folder>/account_views.json
```

Also copy any other JSON files identified in the production app folder.

Verification checklist:

- [ ] Backup folder exists.
- [ ] `timers.json` exists in the backup folder.
- [ ] `timers.json` size is non-zero.
- [ ] `timers.json` opens as readable JSON/text.
- [ ] `account_views.json` exists in the backup folder.
- [ ] `account_views.json` size is non-zero.
- [ ] `account_views.json` opens as readable JSON/text.
- [ ] Backup timestamps make sense.
- [ ] Backup folder is timestamped and not one of the active live JSON files.

Do not continue to Strategy C until this verification is complete.

## Concurrent-writer rule

When the FastAPI production-candidate container is mounted to real production JSON data, there must be only one active writer.

Do not make edits from both URLs at the same time:

```text
Old PHP/Web Station production URL
FastAPI production-candidate URL
```

During a Strategy C test, treat the old PHP/Web Station URL as rollback only. Use the FastAPI production-candidate URL for the test, or stop the FastAPI container and return to the PHP URL. Do not alternate writes between both.

This matters because both runtimes write the same JSON files. The app has stale-data protection, but concurrent human/device edits still create avoidable risk during a production migration test.

## Production-copy container settings

Use these settings for Strategy B / Phase 4C-B. This container is intentionally separate from both the Phase 4B disposable rehearsal container and the later Strategy C real-data production-candidate container.

| Setting | Value |
|---|---|
| Image | `clash-fleet-manager-fastapi-json:local` |
| Container name | `clash-fleet-manager-fastapi-json-prod-copy` |
| Host port | `8003` |
| Container port | `8001` |
| Host data path | `/volume1/docker/clash-fleet-manager-production-copy/data` |
| Container data path | `/data` |
| Volume mode | Read/write |
| Restart policy | Manual / no automatic restart for rehearsal |

Environment variables:

| Name | Value |
|---|---|
| `FLEET_STORE_BACKEND` | `json` |
| `FLEET_DATA_DIR` | `/data` |
| `FLEET_SERVE_APP` | `1` |
| `FLEET_APP_DIR` | `/app` |

Do not set MariaDB variables. Do not mount the live production JSON folder.

Reference file:

```text
docker-compose.synology.production-copy.example.yml
```

## Production-candidate container settings

Create a separate container from the Phase 4B rehearsal container.

Suggested settings:

| Setting | Value |
|---|---|
| Image | `clash-fleet-manager-fastapi-json:local` |
| Container name | `clash-fleet-manager-fastapi-json-production-candidate` |
| Host port | `8004` |
| Container port | `8001` |
| Host data path | `/volume1/web/clash-timers/data` |
| Container data path | `/data` |
| Volume mode | Read/write |
| Restart policy | Manual / no automatic restart for candidate test |

Environment variables:

| Name | Value |
|---|---|
| `FLEET_STORE_BACKEND` | `json` |
| `FLEET_DATA_DIR` | `/data` |
| `FLEET_SERVE_APP` | `1` |
| `FLEET_APP_DIR` | `/app` |

Do not set MariaDB variables for Phase 4C:

```text
FLEET_STORE_BACKEND=mariadb
FLEET_MARIADB_HOST
FLEET_MARIADB_PORT
FLEET_MARIADB_DATABASE
FLEET_MARIADB_USER
FLEET_MARIADB_PASSWORD
```

## Strategy B production-copy rehearsal steps

Use the older Synology **Docker** package vocabulary for the NAS UI. Do not treat this as a Web Station cutover and do not mount the live production folder.

1. Confirm the current production Web Station/PHP URL.
2. Confirm the exact production JSON folder. The current PHP fallback code expects a `data` folder beside `api.php`, with at least `timers.json` and `account_views.json`, but verify the actual NAS paths before copying.
3. In File Station, create the copy folder:

```text
/volume1/docker/clash-fleet-manager-production-copy/data
```

4. Copy production JSON files into the copy folder. At minimum copy:

```text
timers.json
account_views.json
```

Also copy any other JSON files the production app actually uses. Do not copy secrets into the repo or screenshots.

5. Confirm copied files are readable and non-empty:

```text
/volume1/docker/clash-fleet-manager-production-copy/data/timers.json
/volume1/docker/clash-fleet-manager-production-copy/data/account_views.json
```

6. In Synology Docker, confirm the imported image exists:

```text
clash-fleet-manager-fastapi-json:local
```

7. Create a separate container from that image:

```text
Container name:  clash-fleet-manager-fastapi-json-prod-copy
Host port:       8003
Container port:  8001
Host data path:  /volume1/docker/clash-fleet-manager-production-copy/data
Container path:  /data
Volume mode:     read/write
```

8. Set environment variables exactly:

```text
FLEET_STORE_BACKEND=json
FLEET_DATA_DIR=/data
FLEET_SERVE_APP=1
FLEET_APP_DIR=/app
```

9. Start the container.
10. Confirm logs show:

```text
Using FastAPI store backend: json
Uvicorn running on http://0.0.0.0:8001
```

11. Open the read endpoints:

```text
http://<synology-host-or-ip>:8004/api.php?action=load
http://<synology-host-or-ip>:8004/api.php?action=loadViews
```

Expected:

- `load` returns JSON with a `timers` array from the copied folder.
- `loadViews` returns JSON with a `views` array from the copied folder.

12. Open the static app:

```text
http://<synology-host-or-ip>:8003
```

Confirm timers, account views, and counts look plausible.

13. Optional read-only smoke test from the development PC:

```powershell
node tests/support/verify-container-runtime.mjs --base-url http://<synology-host-or-ip>:8003
```

This script checks `/`, `/api.php?action=load`, and `/api.php?action=loadViews`. It should be pointed only at the production-copy container URL.

14. Small copied-data write test:

```text
Create one timer named: Phase 4C-B production-copy FastAPI test
```

Verify:

- [ ] Browser refresh keeps the timer.
- [ ] Container stop/start keeps the timer.
- [ ] Copied `timers.json` modified timestamp changed.
- [ ] Existing PHP/Web Station production app remains untouched.

After verification, decide whether to leave or delete the test timer from the copied data. Do not silently delete it.

### Strategy B rollback / cleanup

Because Strategy B uses copied data only, rollback is simple:

1. Stop `clash-fleet-manager-fastapi-json-prod-copy` in Synology Docker.
2. Delete the production-copy container if desired.
3. Keep or delete `/volume1/docker/clash-fleet-manager-production-copy/data` as desired.
4. Continue using the existing Web Station/PHP production URL.

No production restore should be required because the live production JSON folder was not mounted.

## Strategy C real production data mount steps

Before starting, read this aloud in your own words:

```text
This will mount real production JSON data read/write into the FastAPI container.
A verified backup exists.
Only the FastAPI production-candidate URL will be used for edits during the test.
The PHP/Web Station URL remains available for rollback, but it will not be used as a concurrent writer.
Rollback normally means stopping the FastAPI candidate container and returning to the existing PHP/Web Station URL.
Backup restore is only needed for corruption, bad writes, or user choice.
```

Then proceed only after explicit approval.

1. Create the production backup and verify it.
2. Create a separate Synology Docker container:

```text
Container name:  clash-fleet-manager-fastapi-json-production-candidate
Host port:       8004
Container port:  8001
Host data path:  /volume1/web/clash-timers/data
Container path:  /data
Volume mode:     read/write
```

3. Set environment variables exactly:

```text
FLEET_STORE_BACKEND=json
FLEET_DATA_DIR=/data
FLEET_SERVE_APP=1
FLEET_APP_DIR=/app
```

4. Start the container.
5. Confirm logs show:

```text
Using FastAPI store backend: json
Uvicorn running on http://0.0.0.0:8001
```

6. API read checks:

```text
http://<synology-host-or-ip>:8004/api.php?action=load
http://<synology-host-or-ip>:8004/api.php?action=loadViews
```

Expected:

- `load` returns JSON with a `timers` array.
- `loadViews` returns JSON with a `views` array.

7. Static frontend read-only visual check:

```text
http://<synology-host-or-ip>:8004
```

Confirm:

- App loads.
- Timers appear.
- Saved Views appear.
- Counts look plausible.
- Browser URL is the production-candidate port, not the existing production PHP URL.

8. Optional read-only smoke test:

```powershell
node tests/support/verify-container-runtime.mjs --base-url http://<synology-host-or-ip>:8004
```

This script is read-only. It checks `/`, `load`, and `loadViews`. Run it against live production data only with explicit approval.

## Optional production write test

Do not perform this unless explicitly approved after the read-only checks pass.

Before the write test, restate:

```text
This writes to real production JSON data.
The backup has been verified.
Do not use the PHP/Web Station URL as a writer during this test.
```

Smallest write:

```text
Create one clearly named test timer: Phase 4C-C FastAPI live-data mount test
```

Verify:

- [ ] Refresh the FastAPI production-candidate page; timer remains.
- [ ] Stop the FastAPI production-candidate container.
- [ ] Start the FastAPI production-candidate container.
- [ ] Reopen the FastAPI production-candidate URL; timer remains.
- [ ] Production `timers.json` modified timestamp changed.
- [ ] The old PHP/Web Station app can still read the updated JSON if rollback is needed.

After verification, decide whether to leave or delete the test timer. Do not silently delete it.

## Rollback procedure

Normal rollback:

1. Stop `clash-fleet-manager-fastapi-json-production-candidate` in Synology Docker.
2. Return to the existing Web Station/PHP production URL.
3. Confirm the PHP app loads.
4. Confirm timers load.
5. Confirm saved views load.
6. Do not change MariaDB settings.
7. Do not restore files unless the active JSON files are corrupt, bad, or intentionally being reverted.

File restore rollback, only if needed:

1. Stop the FastAPI production-candidate container.
2. Stop using the PHP/Web Station URL temporarily.
3. Copy the verified backup files back into the production JSON folder:

```text
backup/timers.json -> production-json-folder/timers.json
backup/account_views.json -> production-json-folder/account_views.json
```

4. Confirm restored files are readable and non-empty.
5. Open the Web Station/PHP production URL.
6. Confirm timers and saved views load.

## Phase 4C execution checklist

```text
Repo inspected                                                       ✅
Phase 4B docs/container setup understood                              ✅
Phase 4C runbook inspected                                            ✅
Current git status checked                                            ⚠️ zip has no .git metadata
Phase 4B tag confirmed                                                ⚠️ cannot confirm from zip without .git metadata
Current production Web Station/PHP app URL identified                 ⬜
Current production JSON folder identified                             ✅ /volume1/web/clash-timers/data
Production JSON files identified                                      ✅ timers.json and account_views.json
No production URL cutover planned                                    ✅
No MariaDB production work added                                      ✅
No reverse proxy/nginx/DNS/router change planned                      ✅
Production-copy target folder chosen                                  ✅ /volume1/docker/clash-fleet-manager-production-copy/data
Phase 4C-B production-copy rehearsal completed externally              ✅ per session notes
Candidate container name chosen                                       ✅ clash-fleet-manager-fastapi-json-production-candidate
Candidate host port chosen                                            ✅ 8004 unless unavailable
Production backup folder chosen                                       ⬜ pending timestamped folder creation
Production JSON backup created                                        ⬜ runtime step pending
Backup files verified/readable/non-zero                               ⬜ runtime step pending
Live JSON folder mounted read/write to /data                          ⬜ runtime step pending
FastAPI backend mode confirmed as JSON                                ⬜ runtime check pending
/api.php?action=load works against live production data                ⬜ runtime check pending
/api.php?action=loadViews works against live production data           ⬜ runtime check pending
Static frontend works against live production data                     ⬜ runtime check pending
Visual sanity check completed                                         ⬜
Controlled live-data write test explicitly approved                    ⬜
Controlled live-data write test completed, if approved                 ⬜
Existing Web Station/PHP production app confirmed still works          ⬜ runtime check pending
Runbook updated, if useful                                            ✅
Local validations run if repo files changed                           ⬜
Phase 4C-C complete or deferred with clear reason                      ⬜
```

## Definition of done

### Plan-only done

- [ ] Production Web Station/PHP URL identified.
- [ ] Production JSON location identified.
- [x] Backup procedure documented.
- [x] Rollback procedure documented.
- [x] Production-candidate container settings documented.
- [x] Cutover sequence documented.
- [x] No production data touched.

### Production-copy rehearsal done

- [ ] Production JSON copied to a separate rehearsal folder.
- [ ] FastAPI container runs against the production copy.
- [ ] Static frontend works.
- [ ] `/api.php?action=load` works.
- [ ] `/api.php?action=loadViews` works.
- [ ] Small copied-data write test works against copy only.
- [ ] Persistence survives refresh and container restart.
- [ ] No live production data touched.

### Real production-data mount done

- [ ] Production JSON folder identified.
- [ ] Production JSON backup completed and verified.
- [ ] FastAPI production-candidate container created on separate LAN-only port.
- [ ] Production JSON folder mounted to `/data`.
- [ ] FastAPI backend confirmed as JSON.
- [ ] MariaDB not used.
- [ ] `/api.php?action=load` works through the production-candidate container.
- [ ] Static frontend works through the production-candidate container.
- [ ] Optional write test completed only with explicit approval.
- [ ] Persistence survives refresh and container restart, if write test performed.
- [ ] Existing Web Station/PHP production path remains available.
- [ ] No production URL cutover attempted unless explicitly approved.
- [ ] Rollback procedure documented.
