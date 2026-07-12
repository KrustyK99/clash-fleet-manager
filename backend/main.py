from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .errors import BadPayloadError, StaleDataError, StoreError
from .store_factory import create_store

app = FastAPI(title="Clash Fleet Manager Compatibility API")
store = create_store()


@app.api_route("/api.php", methods=["GET", "POST"])
async def api_php(request: Request, action: str = "load") -> JSONResponse:
    try:
        if action == "load":
            return json_response(store.load_timers())

        if action == "loadViews":
            return json_response(store.load_account_views())

        if action == "save":
            if request.method != "POST":
                return json_response({"error": "Save requires POST"}, status_code=405)
            incoming = await read_json_payload(request)
            return json_response(store.save_timers(incoming))

        if action == "saveViews":
            if request.method != "POST":
                return json_response({"error": "Save views requires POST"}, status_code=405)
            incoming = await read_json_payload(request)
            return json_response(store.save_account_views(incoming))

        return json_response({"error": "Unknown action"}, status_code=400)
    except StaleDataError as exc:
        return json_response(exc.to_payload(), status_code=exc.status_code)
    except StoreError as exc:
        return json_response({"error": exc.message}, status_code=exc.status_code)


async def read_json_payload(request: Request) -> dict[str, Any]:
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BadPayloadError("Invalid JSON payload") from exc

    if not isinstance(payload, dict):
        raise BadPayloadError("Invalid JSON payload")

    return payload


def json_response(payload: dict[str, Any], status_code: int = 200) -> JSONResponse:
    return JSONResponse(content=payload, status_code=status_code)


def mount_test_app_if_enabled() -> None:
    """Serve browser app files only for the disposable FastAPI E2E harness."""

    if os.environ.get("FLEET_SERVE_APP") != "1":
        return

    configured_app_dir = os.environ.get("FLEET_APP_DIR")
    if not configured_app_dir:
        raise RuntimeError("FLEET_APP_DIR is required when FLEET_SERVE_APP=1")

    app_dir = Path(configured_app_dir).expanduser().resolve()
    index_file = app_dir / "index.html"

    if not index_file.exists():
        raise RuntimeError(f"FastAPI test app index.html was not found at {index_file}")

    app.mount("/", StaticFiles(directory=app_dir, html=True), name="test-app")


mount_test_app_if_enabled()
