from __future__ import annotations

from typing import Any, Protocol


class FleetStore(Protocol):
    """Backend-facing persistence contract for the compatibility API."""

    def load_timers(self) -> dict[str, Any]:
        ...

    def save_timers(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...

    def load_account_views(self) -> dict[str, Any]:
        ...

    def save_account_views(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...
