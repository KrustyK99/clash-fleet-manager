from __future__ import annotations

import os

from .store import FleetStore
from .stores.json_file_store import JsonFileStore


def create_store() -> FleetStore:
    """Return the active backend store implementation.

    JSON remains the default/status-quo store. MariaDB is opt-in only so the
    FastAPI route layer can keep the existing /api.php compatibility contract.
    """

    backend = os.environ.get("FLEET_STORE_BACKEND", "json").strip().lower()
    print(f"Using FastAPI store backend: {backend or 'json'}")

    if backend in ("", "json"):
        return JsonFileStore()

    if backend == "mariadb":
        from .stores.mariadb_store import MariaDbStore

        return MariaDbStore()

    raise RuntimeError(
        f"Unknown FLEET_STORE_BACKEND '{backend}'. Expected 'json' or 'mariadb'."
    )
