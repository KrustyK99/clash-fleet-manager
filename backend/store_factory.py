from __future__ import annotations

from .store import FleetStore
from .stores.json_file_store import JsonFileStore


def create_store() -> FleetStore:
    """Return the active backend store implementation.

    For now the only real implementation is JSON-file-backed storage. A future
    MariaDB pass can extend this factory without changing the route layer.
    """

    return JsonFileStore()
