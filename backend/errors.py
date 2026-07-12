from __future__ import annotations

from typing import Any


class StoreError(Exception):
    """Base class for backend store errors that should be returned by the API."""

    status_code = 500

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


# Backwards-compatible name for the original JSON-backed implementation.
JsonStoreError = StoreError


class BadPayloadError(StoreError):
    status_code = 400


class StaleDataError(StoreError):
    status_code = 409

    def __init__(
        self,
        message: str,
        code: str,
        current_last_updated: str,
        last_known_last_updated: Any,
    ):
        super().__init__(message)
        self.code = code
        self.current_last_updated = current_last_updated
        self.last_known_last_updated = last_known_last_updated

    def to_payload(self) -> dict[str, Any]:
        return {
            "error": self.message,
            "code": self.code,
            "currentLastUpdated": self.current_last_updated,
            "lastKnownLastUpdated": self.last_known_last_updated,
        }
