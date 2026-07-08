# Phase 4B Synology Docker Rehearsal

This runbook is for the Phase 4B Synology Docker rehearsal only.

It proves this shape on the Synology NAS without replacing the current Web Station/PHP deployment:

```text
Browser on LAN
  -> http://<synology-host-or-ip>:8002
  -> FastAPI container in Synology Docker
  -> static app files served by FastAPI
  -> /api.php compatibility route served by FastAPI
  -> JsonFileStore
  -> mounted disposable Synology JSON data folder
```

It does **not** cut over production. It does **not** change the production app URL. It does **not** migrate persistence to MariaDB. It does **not** expose the app to the internet. It does **not** mount production JSON data.

## Chosen rehearsal strategy

Use the existing Phase 4A Dockerfile/image shape.

Run one FastAPI JSON container in Synology Docker:

- Same-origin browser app: `/`, app scripts, styles, and `/api.php` all come from the FastAPI container.
- Container port: `8001`.
- Suggested Synology host port: `8002`.
- Container JSON path: `/data`.
- Synology disposable JSON folder: `/volume1/docker/clash-fleet-manager-rehearsal/data`.
- Backend mode: `FLEET_STORE_BACKEND=json`.
- No MariaDB variables.
- No reverse proxy, nginx, CORS, DNS, router, or Web Station changes.

If port `8002` is already in use on the NAS, choose another LAN-only rehearsal port and use that same port in the smoke tests.

## Safety boundaries

Do not mount any production folder, including:

```text
The existing Web Station app folder
The live production data folder
The live timers.json folder
Any folder used by the current PHP deployment
```

Use disposable data only. The recommended source data is the repo test fixture data:

```text
tests/fixtures/data/timers.json
tests/fixtures/data/account_views.json
```

## Files used by this rehearsal

- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml` for local Phase 4A validation
- `docker-compose.synology.example.yml` as a compose reference if needed
- `tests/support/verify-container-runtime.mjs` for read-only HTTP smoke testing
- `docs/SYNOLOGY_CONTAINER_REHEARSAL.md` for this runbook

## Environment variables

Set these safe non-secret values in Synology Docker:

```text
FLEET_STORE_BACKEND=json
FLEET_DATA_DIR=/data
FLEET_SERVE_APP=1
FLEET_APP_DIR=/app
```

Do not set:

```text
FLEET_STORE_BACKEND=mariadb
FLEET_MARIADB_HOST
FLEET_MARIADB_PORT
FLEET_MARIADB_DATABASE
FLEET_MARIADB_USER
FLEET_MARIADB_PASSWORD
```

The container logs should include:

```text
Using FastAPI store backend: json
```

## Option A: build locally, export image, import into Synology

This is the preferred low-risk path when you already have Docker Desktop working locally and do not want to build on the NAS.

From the project root on the development PC:

```powershell
npm run container:build
npm run container:save
```

This creates:

```text
clash-fleet-manager-fastapi-json-local.tar
```

Upload/import that tar file into Synology Docker as an image. Keep the image name/tag as:

```text
clash-fleet-manager-fastapi-json:local
```

If Synology displays the imported image without the expected tag, retag it in Docker if the UI allows it, or select the imported image directly when creating the container.

## Option B: compose YAML reference

Use this only if the source files or imported image are already available to a compose-capable setup. For the older Synology Docker package UI, the main path is to create the container manually from the imported image.

Start from:

```text
docker-compose.synology.example.yml
```

Before using the compose reference, confirm the host volume path and host port:

```yaml
ports:
  - "8002:8001"
volumes:
  - /volume1/docker/clash-fleet-manager-rehearsal/data:/data
```

The example compose file assumes the image already exists on Synology as:

```text
clash-fleet-manager-fastapi-json:local
```

Do not point the compose volume at production data.

## Create the disposable NAS data folder

In Synology File Station or another safe NAS file-management method, create:

```text
/volume1/docker/clash-fleet-manager-rehearsal/data
```

Copy only these disposable fixture files into that folder:

```text
tests/fixtures/data/timers.json
tests/fixtures/data/account_views.json
```

After copying, the NAS folder should contain:

```text
/volume1/docker/clash-fleet-manager-rehearsal/data/timers.json
/volume1/docker/clash-fleet-manager-rehearsal/data/account_views.json
```

The app may create a `backups` folder inside the disposable data folder after write tests. That is expected.

## Create the Synology container in the UI

Use Synology Docker to create a container from the imported image.

Recommended settings:

| Setting | Value |
|---|---|
| Image | `clash-fleet-manager-fastapi-json:local` |
| Container name | `clash-fleet-manager-fastapi-json-rehearsal` |
| Local port / host port | `8002` |
| Container port | `8001` |
| Volume host path | `/volume1/docker/clash-fleet-manager-rehearsal/data` |
| Volume container path | `/data` |
| Volume mode | Read/write |
| Restart policy | Manual / no automatic restart for rehearsal |

Environment variables:

| Name | Value |
|---|---|
| `FLEET_STORE_BACKEND` | `json` |
| `FLEET_DATA_DIR` | `/data` |
| `FLEET_SERVE_APP` | `1` |
| `FLEET_APP_DIR` | `/app` |

Do not add MariaDB variables.

## Start and inspect logs

Start the container, then open the container logs.

Expected signs:

```text
Using FastAPI store backend: json
Uvicorn running on http://0.0.0.0:8001
```

If the container exits immediately, check these first:

1. The image was imported correctly.
2. The container port is `8001`.
3. The volume mount target is `/data`.
4. The environment variable `FLEET_APP_DIR` is `/app`.
5. The environment variable `FLEET_SERVE_APP` is `1`.

## Browser smoke test

From a browser on the LAN, open:

```text
http://<synology-host-or-ip>:8002
```

Confirm:

1. The app loads.
2. Timers load.
3. Saved Views load.
4. The browser URL is the Synology host and rehearsal port, not the production app URL.

Manual API checks:

```text
http://<synology-host-or-ip>:8002/api.php?action=load
http://<synology-host-or-ip>:8002/api.php?action=loadViews
```

Expected results:

- `load` returns JSON with a `timers` array.
- `loadViews` returns JSON with a `views` array.

## Automated read-only smoke test from the development PC

The container smoke test accepts any base URL:

```powershell
node tests/support/verify-container-runtime.mjs --base-url http://<synology-host-or-ip>:8002
```

Equivalent environment-variable form:

```powershell
$env:CONTAINER_BASE_URL = "http://<synology-host-or-ip>:8002"
node tests/support/verify-container-runtime.mjs
Remove-Item Env:\CONTAINER_BASE_URL
```

This test is read-only. It checks:

- `/` serves app HTML.
- `/api.php?action=load` returns a timers array.
- `/api.php?action=loadViews` returns a views array.

## Disposable persistence test

Use the browser app through the Synology rehearsal URL only:

```text
http://<synology-host-or-ip>:8002
```

Then:

1. Create or edit one clearly disposable timer.
2. Refresh the browser page.
3. Confirm the change remains.
4. Stop the container in Synology Docker.
5. Start the container again.
6. Reopen the Synology rehearsal URL.
7. Confirm the change still remains.
8. Inspect `/volume1/docker/clash-fleet-manager-rehearsal/data/timers.json` and confirm the disposable JSON changed there.

Do not perform this test against production data.

## Stop the rehearsal

Stop the container in Synology Docker.

Stopping this container must not affect the production PHP/Web Station app. The PHP rollback path remains the existing production path because this rehearsal uses a separate Synology port and a separate disposable data folder.

## Local validation after repo changes

When repo files change, rerun the local protection ladder from the project root:

```powershell
npm run container:build
npm run container:run
npm run verify:container
npm run container:stop
npm run verify:php
npm run verify:fastapi
npm run verify:fastapi:e2e
```

If `8001` is already in use locally, stop the process using that port before treating any failure as an app problem.

## Definition of done for Phase 4B

Phase 4B is complete only when all of these are true:

- The FastAPI JSON image runs under Synology Docker.
- Logs confirm `Using FastAPI store backend: json`.
- No MariaDB variables are set.
- The container does not mount production JSON data.
- The existing Web Station/PHP deployment remains untouched.
- The app loads from `http://<synology-host-or-ip>:8002` or the chosen rehearsal port.
- `/api.php?action=load` works through the Synology container.
- `/api.php?action=loadViews` works through the Synology container.
- A disposable write persists after refresh.
- The same disposable write persists after container restart.
- The changed JSON file is in the disposable Synology data folder.
- Local validations still pass after repo changes.

## What not to do yet

Do not:

- Cut over production.
- Change production DNS or app URL.
- Change router/firewall rules.
- Port-forward this rehearsal container.
- Replace the existing Web Station/PHP app.
- Mount production JSON data.
- Install FastAPI directly on the NAS.
- Start MariaDB production migration.
- Add nginx or Synology reverse proxy.
- Add authentication.
- Add CORS complexity.
- Rename `/api.php`.
- Remove the PHP rollback path.
