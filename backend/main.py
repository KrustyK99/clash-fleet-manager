from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .json_store import (
    BadPayloadError,
    JsonStoreError,
    StaleDataError,
    load_account_views,
    load_timers,
    save_account_views,
    save_timers,
)

app = FastAPI(title="Clash Fleet Manager Compatibility API")


@app.api_route("/api.php", methods=["GET", "POST"])
async def api_php(request: Request, action: str = "load") -> JSONResponse:
    try:
        if action == "load":
            return json_response(load_timers())

        if action == "loadViews":
            return json_response(load_account_views())

        if action == "save":
            if request.method != "POST":
                return json_response({"error": "Save requires POST"}, status_code=405)
            incoming = await read_json_payload(request)
            return json_response(save_timers(incoming))

        if action == "saveViews":
            if request.method != "POST":
                return json_response({"error": "Save views requires POST"}, status_code=405)
            incoming = await read_json_payload(request)
            return json_response(save_account_views(incoming))

        return json_response({"error": "Unknown action"}, status_code=400)
    except StaleDataError as exc:
        return json_response(exc.to_payload(), status_code=exc.status_code)
    except JsonStoreError as exc:
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
