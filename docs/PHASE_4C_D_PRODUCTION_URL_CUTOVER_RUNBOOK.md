# Phase 4C-D Production URL Cutover Planning / Final Cutover Runbook

This runbook documents the final production URL cutover decision for the Clash Fleet Manager FastAPI JSON migration.

Phase 4C-D is a planning/runbook phase. It does **not** perform the production URL cutover. It does **not** change Synology Web Station, Synology reverse proxy, DNS, router/firewall rules, or the existing PHP rollback path.

## Purpose

The FastAPI JSON runtime has already been proven against live production JSON data on a separate LAN-only port. The remaining decision is how the normal app address should eventually reach that proven FastAPI runtime.

Current normal app address:

```text
http://192.168.2.252/clash-timers/
```

Current FastAPI live-data candidate address:

```text
http://192.168.2.252:8004
```

Plain-language problem:

```text
The app runtime is proven on FastAPI.
The data mount is proven against live production JSON.
The remaining question is address routing: should users keep using the old Web Station path, switch to the FastAPI port, or rehearse a same-URL reverse-proxy cutover later?
```

## Current state

### Current production / rollback path

```text
Browser on LAN
  -> http://192.168.2.252/clash-timers/
  -> Synology Web Station / PHP
  -> api.php
  -> live JSON files
```

This path remains the rollback path and must not be removed during Phase 4C-D.

### Proven FastAPI production-candidate path

```text
Browser on LAN
  -> http://192.168.2.252:8004
  -> Synology Docker FastAPI container
  -> static frontend served by FastAPI
  -> /api.php compatibility route served by FastAPI
  -> JsonFileStore
  -> live production JSON files
```

Candidate container:

```text
clash-fleet-manager-fastapi-json-production-candidate
```

Live production JSON folder:

```text
/volume1/web/clash-timers/data
```

Container mount:

```text
/volume1/web/clash-timers/data -> /data
```

Backend mode:

```text
FLEET_STORE_BACKEND=json
```

FastAPI container port mapping:

```text
Host port:       8004
Container port:  8001
```

## Validated Phase 4C-C candidate state

Phase 4C-C proved the live-data candidate without changing the production URL:

- `/api.php?action=load` worked through the FastAPI candidate.
- `/api.php?action=loadViews` worked through the FastAPI candidate.
- Static frontend loaded through the FastAPI candidate.
- Original PHP/Web Station production URL still worked.
- Controlled live-data write test succeeded.
- Write survived browser refresh.
- PHP/Web Station URL saw the same live-data change.
- Candidate stop made the candidate URL unavailable.
- Candidate restart preserved data.
- Test timer was deleted.
- PHP/Web Station URL saw deletion.
- No DNS, reverse proxy, router, firewall, or Web Station cutover was attempted.
- MariaDB remained parked.

Phase 4C-C backup location recorded:

```text
\\192.168.2.252\web\backups\clashtimers\
```

Backup included at least:

```text
timers.json
account_views.json
```

## Runtime facts confirmed from repo/docs

The repo supports the current production-candidate shape:

- `Dockerfile` sets `FLEET_STORE_BACKEND=json`, `FLEET_DATA_DIR=/data`, `FLEET_SERVE_APP=1`, and `FLEET_APP_DIR=/app`.
- `Dockerfile` exposes container port `8001` and starts uvicorn on `0.0.0.0:8001`.
- `backend/main.py` serves the `/api.php` compatibility route for `load`, `loadViews`, `save`, and `saveViews`.
- `backend/main.py` mounts static frontend files when `FLEET_SERVE_APP=1`.
- `backend/store_factory.py` defaults to JSON and only uses MariaDB when `FLEET_STORE_BACKEND=mariadb` is explicitly selected.
- `docker-compose.synology.production-candidate.example.yml` maps host port `8004` to container port `8001` and mounts `/volume1/web/clash-timers/data` to `/data`.
- `tests/support/verify-container-runtime.mjs` supports read-only smoke tests against any base URL and checks `/`, `/api.php?action=load`, and `/api.php?action=loadViews`.

No backend default needs to change for Phase 4C-D.

## Phase 4C-D decision

Recommended approach:

```text
Operational cutover to the proven FastAPI candidate URL on port 8004.
```

Meaning:

```text
Start treating http://192.168.2.252:8004 as the active app URL by operating procedure.
Stop using http://192.168.2.252/clash-timers/ for edits.
Leave the PHP/Web Station app intact as rollback.
```

This is the safest next step because the candidate URL already works, it avoids same-URL routing complexity, and rollback is simply returning to the existing PHP/Web Station URL.

Same-URL cutover is explicitly deferred. Do not make `http://192.168.2.252/clash-timers/` route to FastAPI until a separate reverse-proxy/path-prefix rehearsal proves that Synology can handle the path safely.

## Cutover options considered

### Option A — Keep FastAPI on separate port and declare new operational production URL

Target:

```text
http://192.168.2.252:8004
```

Pros:

- Already proven in Phase 4C-C.
- Lowest technical risk.
- Does not touch Web Station.
- Does not require Synology reverse proxy.
- Does not require DNS, router, firewall, or nginx changes.
- Rollback is simple: return to `http://192.168.2.252/clash-timers/`.

Cons:

- URL changes.
- Bookmarks/devices must be updated manually.
- Not a true same-URL cutover.

Decision:

```text
Recommended now.
```

### Option B — Synology reverse proxy from existing path to FastAPI candidate

Potential target:

```text
http://192.168.2.252/clash-timers/ -> http://127.0.0.1:8004/
```

Pros:

- Could preserve the existing URL.
- Keeps FastAPI in Docker.
- Rollback might be disabling the proxy rule, if Synology supports the rule cleanly.

Cons / unknowns:

- Synology reverse proxy path handling must be proven.
- `/clash-timers/` prefix may need stripping or rewriting.
- FastAPI static asset behavior behind a path prefix is unproven.
- Relative frontend asset paths may behave differently.
- `/api.php` resolution from the app must be checked behind the prefix.
- Could conflict with Web Station handling of the existing `/clash-timers/` path.
- Older Synology Docker/Web Station behavior may differ from newer Container Manager examples.

Decision:

```text
Deferred. Only attempt after a dedicated same-URL/reverse-proxy rehearsal that does not disturb the current production URL.
```

### Option C — Move FastAPI candidate host port to port 80

Potential target:

```text
http://192.168.2.252/ -> FastAPI
```

Pros:

- Simple HTTP shape if port 80 were free.

Cons:

- Port 80 is likely owned by Web Station.
- Could disrupt other Synology-hosted apps.
- Rollback is more disruptive.
- Does not preserve `/clash-timers/` cleanly by itself.

Decision:

```text
Rejected for now.
```

### Option D — Replace or alter Web Station app files

Potential idea:

```text
Use the existing Web Station folder as a redirect or proxy shim to FastAPI.
```

Pros:

- Might preserve a familiar entry point.

Cons:

- Touches the current production app folder.
- Weakens the clean PHP rollback path.
- Could require PHP proxy behavior.
- Adds complexity where the separate-port candidate already works.

Decision:

```text
Rejected for now.
```

### Option E — Transitional cutover / new bookmark window

Target:

```text
Use http://192.168.2.252:8004 as the primary app URL.
Leave http://192.168.2.252/clash-timers/ intact as rollback for an observation window.
```

Pros:

- Safe and easy to understand.
- No Synology routing changes.
- Keeps rollback clean.
- Lets the FastAPI runtime run as primary before any same-URL complexity.

Cons:

- Not a true same-URL cutover.
- Requires discipline: only one URL should be used for edits.

Decision:

```text
Recommended operational shape for the next execution phase.
```

## What production cutover means for the next phase

Use this definition:

```text
Operational cutover:
  The active app URL becomes http://192.168.2.252:8004 by operating procedure.
  The old URL remains available but is treated as rollback only.
```

Do not use this definition yet:

```text
Same-URL cutover:
  http://192.168.2.252/clash-timers/ itself routes to FastAPI.
```

Same-URL cutover may be a later phase only after a separate reverse-proxy/path-prefix rehearsal.

## Out of scope for Phase 4C-D

Do not do any of these in Phase 4C-D:

- Cut over the production URL.
- Change DNS.
- Change router/firewall rules.
- Port-forward the container.
- Expose the app to the internet.
- Change Synology reverse proxy.
- Change Web Station configuration.
- Replace or delete the Web Station/PHP app.
- Delete production JSON files.
- Move production JSON files.
- Rename `/api.php`.
- Remove the PHP rollback path.
- Start MariaDB production migration.
- Add nginx.
- Add authentication.
- Refactor frontend code.
- Use Synology Container Manager-only instructions; the NAS uses the older Synology Docker package.
- Commit secrets, screenshots with secrets, Synology credentials, or Docker image tar files.

## Pre-cutover checklist for Phase 4C-E operational cutover

Complete this immediately before any operational cutover:

```text
PHP/Web Station production URL loads: http://192.168.2.252/clash-timers/       ⬜
FastAPI candidate URL loads: http://192.168.2.252:8004                         ⬜
Both show same live production data                                             ⬜
FastAPI candidate container is running                                          ⬜
FastAPI candidate logs show: Using FastAPI store backend: json                  ⬜
/api.php?action=load works on candidate                                         ⬜
/api.php?action=loadViews works on candidate                                    ⬜
Live JSON folder confirmed: /volume1/web/clash-timers/data                      ⬜
timers.json present/readable/non-empty                                          ⬜
account_views.json present/readable/non-empty                                   ⬜
Final backup created                                                            ⬜
Final backup verified                                                           ⬜
Edit freeze announced                                                           ⬜
Only one active writer selected                                                 ⬜
Rollback path reviewed                                                          ⬜
No Synology Web Station/reverse-proxy/DNS/router/firewall change planned        ⬜
```

## Final pre-cutover backup procedure

Before operational cutover, create a fresh backup separate from the Phase 4C-C backup.

Backup source:

```text
/volume1/web/clash-timers/data
```

Backup destination:

```text
\\192.168.2.252\web\backups\clashtimers\phase-4c-e-before-operational-cutover-YYYYMMDD-HHMMSS\
```

At minimum, copy:

```text
timers.json
account_views.json
```

Verification checklist:

```text
Backup folder exists                                                           ⬜
timers.json exists in backup folder                                            ⬜
timers.json is non-zero size                                                   ⬜
timers.json opens as readable JSON/text                                        ⬜
account_views.json exists in backup folder                                     ⬜
account_views.json is non-zero size                                            ⬜
account_views.json opens as readable JSON/text                                 ⬜
Backup folder timestamp is correct                                             ⬜
Backup folder is not one of the active live JSON folders                       ⬜
```

Do not proceed with operational cutover unless the backup is verified.

## Edit-freeze / single-writer rule

During backup and cutover:

```text
No edits from http://192.168.2.252/clash-timers/
No edits from http://192.168.2.252:8004
No edits from any phone/tablet/PC until the active URL is declared.
```

After operational cutover:

```text
Use http://192.168.2.252:8004 for edits.
Do not use http://192.168.2.252/clash-timers/ for edits unless rolling back.
```

Reason:

```text
Both runtimes write the same live JSON files.
The app has stale-data protection, but concurrent human/device edits are still unnecessary migration risk.
```

## Exact operational cutover steps

Only do these after explicit approval in the execution phase.

1. Announce edit freeze.
2. Confirm current PHP/Web Station production URL loads:

```text
http://192.168.2.252/clash-timers/
```

3. Confirm FastAPI candidate URL loads:

```text
http://192.168.2.252:8004
```

4. Confirm both show the same live production data.
5. Create the final pre-cutover backup.
6. Verify the final backup.
7. Confirm candidate logs show:

```text
Using FastAPI store backend: json
```

8. Confirm candidate API read endpoints:

```text
http://192.168.2.252:8004/api.php?action=load
http://192.168.2.252:8004/api.php?action=loadViews
```

9. Declare the active app URL:

```text
http://192.168.2.252:8004
```

10. Stop using this URL for edits:

```text
http://192.168.2.252/clash-timers/
```

11. Update bookmarks/devices manually.
12. Leave PHP/Web Station app intact as rollback.
13. Run post-cutover smoke tests.

## Post-cutover smoke tests

Run these manually against the active FastAPI URL:

```text
http://192.168.2.252:8004
```

Checklist:

```text
App loads                                                                      ⬜
Timers load                                                                    ⬜
Saved Views load                                                               ⬜
Counts look plausible                                                          ⬜
/api.php?action=load returns timers JSON                                       ⬜
/api.php?action=loadViews returns views JSON                                   ⬜
Create one tiny clearly named test timer                                       ⬜
Refresh browser and confirm test timer persists                                ⬜
Delete test timer                                                              ⬜
Refresh browser and confirm deletion persists                                  ⬜
Do not use PHP/Web Station URL for edits unless rolling back                    ⬜
```

Optional read-only smoke test from development PC:

```powershell
node tests/support/verify-container-runtime.mjs --base-url http://192.168.2.252:8004
```

Do not run broad mutation-heavy E2E tests against live production data.

## Rollback triggers

Rollback if any of these happen:

- FastAPI candidate URL does not load.
- Timers or Saved Views do not load.
- `/api.php?action=load` or `/api.php?action=loadViews` fails.
- Saves fail or produce stale-data errors that do not make sense.
- Data looks wrong or incomplete.
- Browser refresh loses a controlled write.
- Multiple devices appear to be fighting over the same JSON state.
- The user loses confidence in the migration.

## Exact rollback steps

Normal rollback:

1. Stop using the FastAPI candidate URL:

```text
http://192.168.2.252:8004
```

2. Return to the PHP/Web Station production URL:

```text
http://192.168.2.252/clash-timers/
```

3. Stop the FastAPI candidate container if desired:

```text
clash-fleet-manager-fastapi-json-production-candidate
```

4. Confirm the PHP/Web Station app loads.
5. Confirm timers load.
6. Confirm Saved Views load.
7. Continue using PHP/Web Station until the issue is understood.
8. Do not change MariaDB settings.
9. Do not delete production JSON files.

File restore rollback, only if active JSON data is damaged or intentionally being reverted:

1. Stop using both URLs temporarily.
2. Stop the FastAPI candidate container.
3. Copy verified backup files back into the live production JSON folder:

```text
backup/timers.json -> /volume1/web/clash-timers/data/timers.json
backup/account_views.json -> /volume1/web/clash-timers/data/account_views.json
```

4. Confirm restored files are readable and non-empty.
5. Open the PHP/Web Station production URL.
6. Confirm timers and Saved Views load.
7. Keep the final backup folder until the migration is fully stable.

## Post-rollback smoke tests

Run these against:

```text
http://192.168.2.252/clash-timers/
```

Checklist:

```text
PHP/Web Station app loads                                                      ⬜
Timers load                                                                    ⬜
Saved Views load                                                               ⬜
Counts look plausible                                                          ⬜
/api.php?action=load works through PHP/Web Station                             ⬜
/api.php?action=loadViews works through PHP/Web Station                        ⬜
Create a tiny rollback test timer only if needed                               ⬜
Refresh and confirm persistence only if rollback write test is performed        ⬜
Delete rollback test timer if created                                          ⬜
FastAPI candidate is stopped or treated as read-only until issue is understood  ⬜
```

## What to leave running

During operational cutover:

```text
Leave Synology Web Station/PHP app intact.
Leave live JSON files in place.
Leave PHP rollback path available.
Leave FastAPI candidate container running if it is the active URL.
```

## What to stop or disable

For the recommended operational cutover:

```text
Do not stop Web Station.
Do not disable PHP app files.
Do not disable the PHP rollback URL.
Do not stop the FastAPI candidate if it is the active URL.
```

Only stop the FastAPI candidate container if rolling back or troubleshooting.

## What not to delete

Do not delete:

```text
/volume1/web/clash-timers/data/timers.json
/volume1/web/clash-timers/data/account_views.json
/volume1/web/clash-timers/data/backups/
\\192.168.2.252\web\backups\clashtimers\
Existing Web Station/PHP app files
api.php
FastAPI candidate documentation
```

## Same-URL cutover is deferred

Do not route this URL to FastAPI yet:

```text
http://192.168.2.252/clash-timers/
```

Before attempting a same-URL cutover, run a dedicated rehearsal that answers these questions without disturbing the current production URL:

```text
Can Synology reverse proxy route a path prefix like /clash-timers/ to port 8004?
Does it strip /clash-timers/ or forward it?
Does FastAPI serve static assets correctly behind that prefix?
Do relative frontend asset paths still resolve?
Does /api.php resolve correctly from the app when served behind /clash-timers/?
Does Web Station conflict with the reverse proxy rule?
Can the rule be disabled quickly for rollback?
```

Suggested next phase if same-URL cutover is desired later:

```text
Phase 4C-E — Same-URL Reverse Proxy Rehearsal
```

That phase should use a non-production path or alternate host/port first, not the existing `/clash-timers/` production path.

## Open risks / caveats

- Operational cutover changes the app URL from a path-based Web Station URL to a port-based FastAPI URL.
- Users/devices must update bookmarks manually.
- Both URLs can still write to the same JSON files, so operational discipline matters.
- The FastAPI candidate container restart policy is currently manual/no automatic restart in the example. Decide whether to keep manual restart or later set a restart policy after confidence.
- Same-URL reverse proxy behavior remains unproven and should not be mixed into the operational cutover.
- Backups generated by the app inside the data folder are useful, but they are not a substitute for the final pre-cutover backup.

## Phase 4C-D start-of-session checklist result

```text
Repo inspected                                                               ✅
Current git status checked                                                    ⚠️ zip has no .git metadata
Phase 4B tag checked, if repo metadata available                              ⚠️ unavailable from zip
Phase 4C-B tag checked, if repo metadata available                            ⚠️ unavailable from zip
Phase 4C-C tag checked, if repo metadata available                            ⚠️ unavailable from zip
Phase 4C docs/runbooks inspected                                              ✅
FastAPI production candidate docs inspected                                   ✅
Existing production PHP/Web Station URL confirmed from session prompt          ✅ http://192.168.2.252/clash-timers/
FastAPI candidate URL confirmed from session prompt                            ✅ http://192.168.2.252:8004
Live production JSON folder confirmed from session prompt/docs                 ✅ /volume1/web/clash-timers/data
Live production JSON files confirmed from session prompt                       ✅ timers.json and account_views.json
Phase 4C-C backup location recorded                                            ✅ \\192.168.2.252\web\backups\clashtimers\
FastAPI candidate container status confirmed                                   ⚠️ not checked live from zip/session
FastAPI candidate backend mode confirmed as JSON                               ✅ from Phase 4C-C notes and compose/docs
Candidate read smoke tests confirmed or repeated                               ✅ confirmed from Phase 4C-C notes; not repeated live
Candidate controlled write result recorded                                     ✅ confirmed from Phase 4C-C notes
No MariaDB work planned                                                        ✅
No router/firewall exposure planned                                            ✅
No production URL cutover performed without explicit approval                  ✅
Cutover options identified                                                     ✅
Recommended cutover option selected                                            ✅ operational cutover to port 8004
Why other cutover options were rejected or deferred                            ✅
Final pre-cutover backup procedure documented                                  ✅
Single-writer / edit-freeze procedure documented                               ✅
Exact cutover steps documented                                                 ✅
Exact rollback steps documented                                                ✅
Post-cutover smoke tests documented                                            ✅
Post-rollback smoke tests documented                                           ✅
What to stop/disable/leave running documented                                  ✅
Runbook updated                                                                ✅
Local validations run if repo files changed                                    ⬜ pending after doc edit
Phase 4C-D complete or deferred with clear reason                              ✅ complete as planning/runbook phase
```

## Phase 4C-D definition of done result

```text
Current production PHP/Web Station URL is documented                            ✅
Current FastAPI candidate URL is documented                                     ✅
Current live JSON path is documented                                           ✅
Phase 4C-C validation is summarized                                             ✅
Cutover options are identified and compared                                     ✅
A recommended cutover approach is selected                                      ✅
Same-URL cutover is explicitly deferred with a rehearsal plan                   ✅
Final backup procedure is documented                                            ✅
Edit-freeze / single-writer rule is documented                                  ✅
Exact cutover steps are documented                                              ✅
Exact rollback steps are documented                                             ✅
Post-cutover smoke tests are documented                                         ✅
Post-rollback smoke tests are documented                                        ✅
Runbook is created                                                              ✅
No unapproved production URL cutover is performed                               ✅
No unapproved DNS/reverse-proxy/router/firewall/Web Station changes performed   ✅
MariaDB remains parked                                                          ✅
PHP/Web Station rollback path remains available                                 ✅
Repo changes are documentation-only                                             ✅
```

## Suggested git tag if Phase 4C-D is accepted

Tag name:

```text
phase-4c-d-production-url-cutover-runbook-complete
```

Tag message:

```text
Phase 4C-D complete: production URL cutover runbook documented

Documented the final production URL cutover planning for the Clash Fleet Manager FastAPI JSON migration.

Captured:
- current PHP/Web Station production URL
- current FastAPI JSON production candidate URL
- live production JSON folder and backup location
- Phase 4C-C validation summary
- cutover options considered
- recommended operational cutover approach to port 8004
- final backup procedure
- edit-freeze and single-writer rule
- exact cutover steps
- exact rollback steps
- post-cutover and post-rollback smoke tests
- explicit deferral and rehearsal plan for same-URL cutover
- MariaDB remains parked
- PHP/Web Station rollback path remains available
```

## Recommended next phase

Do not start without explicit approval.

Recommended next phase:

```text
Phase 4C-E — Operational Cutover to FastAPI Candidate URL
```

Purpose:

```text
Execute the short controlled operational cutover where http://192.168.2.252:8004 becomes the active app URL by procedure, with PHP/Web Station retained as rollback.
```
