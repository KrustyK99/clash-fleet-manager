# Phase 4A Local FastAPI JSON Container Runtime

This runbook is for the local Phase 4A container rehearsal only.

It proves this shape:

```text
Browser
  -> FastAPI container on http://127.0.0.1:8001
  -> static app files served by FastAPI
  -> /api.php compatibility route served by FastAPI
  -> JsonFileStore
  -> host-mounted disposable JSON data in tests/runtime-app/data
```

It does **not** deploy FastAPI to Synology. It does **not** migrate persistence to MariaDB. It does **not** use production NAS data.

## What this rehearsal uses

- Image: `clash-fleet-manager-fastapi-json:local`
- Exported image tar, when needed for Synology import: `clash-fleet-manager-fastapi-json-local.tar`
- Container: `clash-fleet-manager-fastapi-json`
- Browser URL: `http://127.0.0.1:8001`
- Compatibility route: `http://127.0.0.1:8001/api.php?action=load`
- Store backend: `FLEET_STORE_BACKEND=json`
- Container JSON path: `/data`
- Host JSON path: `tests/runtime-app/data`
- Static app path inside the container: `/app`

The host JSON folder is prepared from test fixtures by `tests/support/prepare-test-app.mjs`. This keeps the container away from real app data and away from NAS production data.

## Complete automated container E2E verification

From the project root, the preferred pre-deployment verification is:

```powershell
npm run verify:fastapi:container:e2e
```

This command:

1. Removes any stale local Compose instance for this project.
2. Builds a fresh `clash-fleet-manager-fastapi-json:local` image.
3. Prepares disposable JSON fixtures under `tests/runtime-app/data`.
4. Starts and health-checks the FastAPI container on port `8001`.
5. Runs the existing read-only container smoke test.
6. Runs the complete Playwright E2E suite against the running container.
7. Prints container logs when verification fails.
8. Stops and removes the disposable container whether the run passes, fails, or is interrupted.

The locally built image remains available after the disposable container is removed.

## Preferred tested-image release flow

Use the following sequence to build once, test the packaged artifact, export that exact image, and deploy it to the NAS without another build:

```powershell
npm run verify:php
npm run verify:fastapi:e2e
npm run verify:fastapi:container:e2e
npm run deploy:nas
npm run container:save
npm run deploy:nas:fastapi:reuse-image
```

The local disposable container is not transferred. `container:save` exports the tested Docker image, and the NAS deployment loads that image and creates a new NAS container with the production data mount and NAS runtime settings. Do not rebuild the image or modify the source between successful container verification and image export when the objective is to promote the exact tested artifact.

The NAS deployment command performs a limited post-deployment smoke check. Full behavioural testing remains in the disposable test environments rather than against production data.

## Build the image manually

For the lower-level manual workflow:

```powershell
npm run container:build
```

## Save the tested image for Synology deployment

After `npm run verify:fastapi:container:e2e` passes, export the image that was used to create the disposable test container:

```powershell
npm run container:save
```

This creates `clash-fleet-manager-fastapi-json-local.tar` from the already-tested `clash-fleet-manager-fastapi-json:local` image. The local test container has been removed, but the image remains in Docker's local image store. The tar contains the image, not the container and not the disposable test data.

## Run the local container

```powershell
npm run container:run
```

This command prepares disposable runtime data in `tests/runtime-app/data`, then starts the FastAPI JSON container through Docker Compose.

Open:

```text
http://127.0.0.1:8001
```

## Smoke test an already-running container

```powershell
npm run verify:container
```

This read-only smoke test checks:

- `/` serves the app HTML.
- `/api.php?action=load` returns a timers array.
- `/api.php?action=loadViews` returns a views array.

The same script can check a Synology rehearsal URL by passing a base URL:

```powershell
node tests/support/verify-container-runtime.mjs --base-url http://<synology-host-or-ip>:8002
```

For a manual browser smoke test:

1. Open `http://127.0.0.1:8001`.
2. Confirm the app loads.
3. Confirm timers load.
4. Confirm saved account views load.
5. If you test edits, change only disposable data created under `tests/runtime-app/data`.
6. Refresh and confirm the disposable change persists.
7. Stop and restart the container, then confirm the disposable change is still present.

Do not perform write tests against production data.

## View logs

```powershell
npm run container:logs
```

Look for normal Uvicorn startup and route access logs. The container environment explicitly sets `FLEET_STORE_BACKEND=json`.

## Stop the container

```powershell
npm run container:stop
```

## Confirm the JSON backend is active

The local container sets:

```text
FLEET_STORE_BACKEND=json
FLEET_DATA_DIR=/data
```

MariaDB is not configured in `docker-compose.yml`. Do not add `FLEET_STORE_BACKEND=mariadb` for Phase 4A.

A quick API check is:

```powershell
npm run verify:container
```

Or manually open:

```text
http://127.0.0.1:8001/api.php?action=load
http://127.0.0.1:8001/api.php?action=loadViews
```

## PHP rollback path

The PHP/status-quo path remains available through the existing validation command:

```powershell
npm run verify:php
```

The browser still calls `api.php`. Rollback means returning to the PHP runtime that serves `api.php` instead of the FastAPI container.

## Phase 3 validation ladder

After container changes, rerun the Phase 3 checks:

```powershell
npm run verify:php
npm run verify:fastapi
npm run verify:fastapi:e2e
```

Then run the full packaged-container verification:

```powershell
npm run verify:fastapi:container:e2e
```

The lower-level build/run/smoke/stop commands remain useful for manual investigation, but the one-command verifier is the preferred final local gate before deployment.

## Synology rehearsal

The Synology Docker rehearsal is documented separately in `docs/SYNOLOGY_CONTAINER_REHEARSAL.md`. It uses the same image shape, a separate Synology LAN-only port, and a disposable Synology JSON folder mounted to `/data`.

## What not to do yet

Do not:

- Cut over production on Synology.
- Change NAS configuration.
- Install FastAPI directly on the NAS.
- Mount production NAS data.
- Start a MariaDB production migration.
- Add nginx, Kubernetes, Docker Swarm, or a reverse proxy.
- Rename `/api.php`.
- Remove the PHP rollback path.
