from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, TypeVar

from ..errors import BadPayloadError, StaleDataError, StoreError
from .json_file_store import (
    DEFAULT_ACCOUNT_VIEWS,
    DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS,
    normalize_account_snapshot_meta,
    normalize_account_tag_map,
    normalize_account_views,
    normalize_snapshot_freshness_settings,
    now_iso_utc,
)

DOC_TIMERS = "timers"
DOC_ACCOUNT_VIEWS = "account_views"

T = TypeVar("T")


@dataclass(frozen=True)
class MariaDbConfig:
    host: str
    port: int
    database: str
    user: str
    password: str

    @classmethod
    def from_env(cls, prefix: str = "FLEET_MARIADB_") -> "MariaDbConfig":
        host = _required_env(f"{prefix}HOST")
        database = _required_env(f"{prefix}DATABASE")
        user = _required_env(f"{prefix}USER")
        password = _required_env(f"{prefix}PASSWORD")
        port_raw = os.environ.get(f"{prefix}PORT", "3306")

        try:
            port = int(port_raw)
        except ValueError as exc:
            raise StoreError(f"{prefix}PORT must be an integer") from exc

        return cls(host=host, port=port, database=database, user=user, password=password)


class MariaDbStore:
    """MariaDB-backed implementation of the FleetStore contract.

    This implementation deliberately stores the existing aggregate API payloads
    as JSON documents. It is an opt-in Phase 3B bridge, not a normalized domain
    model or production migration.
    """

    def __init__(self, config: MariaDbConfig | None = None):
        self.config = config or MariaDbConfig.from_env()

    def load_timers(self) -> dict[str, Any]:
        return self._run(lambda connection: self._load_timers(connection))

    def save_timers(self, incoming: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(incoming.get("timers"), list):
            raise BadPayloadError("Payload must include timers array")

        def operation(connection: Any) -> dict[str, Any]:
            current_data, current_raw = self._load_document_for_update(connection, DOC_TIMERS)
            current_last_updated = current_data.get("lastUpdated")
            incoming_last_known = incoming.get("lastKnownLastUpdated")

            if current_last_updated not in (None, "") and incoming_last_known != current_last_updated:
                raise StaleDataError(
                    "Timer data changed on another device. Reload before saving.",
                    "STALE_DATA",
                    current_last_updated,
                    incoming_last_known,
                )

            if "accountSnapshotMeta" in incoming:
                account_snapshot_meta = normalize_account_snapshot_meta(
                    incoming.get("accountSnapshotMeta"),
                    current_data.get("accountSnapshotMeta") or current_data.get("snapshotMeta"),
                )
            else:
                account_snapshot_meta = normalize_account_snapshot_meta(
                    current_data.get("accountSnapshotMeta") or current_data.get("snapshotMeta")
                )

            payload = {
                "schemaVersion": 2,
                "lastUpdated": now_iso_utc(),
                "timers": incoming["timers"],
                "accountSnapshotMeta": account_snapshot_meta,
            }

            backup_name = self._create_backup(connection, DOC_TIMERS, "timers", current_data, current_raw)
            self._write_document(connection, DOC_TIMERS, payload)

            return {
                "ok": True,
                "lastUpdated": payload["lastUpdated"],
                "backupCreated": backup_name,
            }

        return self._run(operation)

    def load_account_views(self) -> dict[str, Any]:
        return self._run(lambda connection: self._load_account_views(connection))

    def save_account_views(self, incoming: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(incoming.get("views"), list):
            raise BadPayloadError("Payload must include views array")

        def operation(connection: Any) -> dict[str, Any]:
            current_data, current_raw = self._load_document_for_update(connection, DOC_ACCOUNT_VIEWS)
            current_last_updated = current_data.get("lastUpdated")
            incoming_last_known = incoming.get("lastKnownLastUpdated")

            if current_last_updated not in (None, "") and incoming_last_known != current_last_updated:
                raise StaleDataError(
                    "Saved Views changed on another device. Reload before saving.",
                    "STALE_VIEWS",
                    current_last_updated,
                    incoming_last_known,
                )

            if "snapshotFreshnessSettings" in incoming:
                snapshot_freshness_settings = normalize_snapshot_freshness_settings(
                    incoming.get("snapshotFreshnessSettings")
                )
            else:
                fallback_settings = current_data.get("snapshotFreshnessSettings")
                if fallback_settings is None and isinstance(current_data.get("settings"), dict):
                    fallback_settings = current_data["settings"].get("snapshotFreshnessSettings")
                snapshot_freshness_settings = normalize_snapshot_freshness_settings(fallback_settings)

            if "accountTagMap" in incoming:
                account_tag_map = normalize_account_tag_map(incoming.get("accountTagMap"))
            else:
                fallback_tag_map = current_data.get("accountTagMap")
                if fallback_tag_map is None and isinstance(current_data.get("settings"), dict):
                    fallback_tag_map = current_data["settings"].get("accountTagMap")
                account_tag_map = normalize_account_tag_map(fallback_tag_map)

            payload = {
                "schemaVersion": 3,
                "lastUpdated": now_iso_utc(),
                "views": normalize_account_views(incoming["views"]),
                "snapshotFreshnessSettings": snapshot_freshness_settings,
                "accountTagMap": account_tag_map,
            }

            backup_name = self._create_backup(
                connection,
                DOC_ACCOUNT_VIEWS,
                "account-views",
                current_data,
                current_raw,
            )
            self._write_document(connection, DOC_ACCOUNT_VIEWS, payload)

            return {
                "ok": True,
                "lastUpdated": payload["lastUpdated"],
                "backupCreated": backup_name,
            }

        return self._run(operation)

    def _load_timers(self, connection: Any) -> dict[str, Any]:
        data = self._load_document(connection, DOC_TIMERS)

        if not isinstance(data.get("timers"), list):
            data["timers"] = []

        if not isinstance(data.get("accountSnapshotMeta"), dict):
            data["accountSnapshotMeta"] = {}

        data["schemaVersion"] = 2
        data.setdefault("lastUpdated", None)

        return data

    def _load_account_views(self, connection: Any) -> dict[str, Any]:
        data = self._load_document(connection, DOC_ACCOUNT_VIEWS)

        views = data.get("views") if isinstance(data.get("views"), list) else DEFAULT_ACCOUNT_VIEWS
        settings = data.get("snapshotFreshnessSettings")
        if settings is None and isinstance(data.get("settings"), dict):
            settings = data["settings"].get("snapshotFreshnessSettings")

        account_tag_map = data.get("accountTagMap")
        if account_tag_map is None and isinstance(data.get("settings"), dict):
            account_tag_map = data["settings"].get("accountTagMap")

        return {
            "schemaVersion": 3,
            "lastUpdated": data.get("lastUpdated"),
            "views": normalize_account_views(views),
            "snapshotFreshnessSettings": normalize_snapshot_freshness_settings(settings),
            "accountTagMap": normalize_account_tag_map(account_tag_map),
        }

    def _run(self, operation: Callable[[Any], T]) -> T:
        pymysql = _import_pymysql()
        connection = None

        try:
            connection = pymysql.connect(
                host=self.config.host,
                port=self.config.port,
                database=self.config.database,
                user=self.config.user,
                password=self.config.password,
                charset="utf8mb4",
                cursorclass=pymysql.cursors.DictCursor,
                autocommit=False,
            )
            result = operation(connection)
            connection.commit()
            return result
        except (BadPayloadError, StaleDataError):
            if connection is not None:
                connection.rollback()
            raise
        except StoreError:
            if connection is not None:
                connection.rollback()
            raise
        except pymysql.MySQLError as exc:
            if connection is not None:
                connection.rollback()
            raise StoreError("MariaDB store operation failed. Check connection, schema, and permissions.") from exc
        finally:
            if connection is not None:
                connection.close()

    def _load_document(self, connection: Any, doc_key: str) -> dict[str, Any]:
        data, _raw = self._load_document_row(connection, doc_key, for_update=False)
        return data

    def _load_document_for_update(self, connection: Any, doc_key: str) -> tuple[dict[str, Any], str]:
        return self._load_document_row(connection, doc_key, for_update=True)

    def _load_document_row(self, connection: Any, doc_key: str, for_update: bool) -> tuple[dict[str, Any], str]:
        self._ensure_document(connection, doc_key)
        sql = "SELECT payload_json FROM fleet_documents WHERE doc_key = %s"
        if for_update:
            sql = f"{sql} FOR UPDATE"

        with connection.cursor() as cursor:
            cursor.execute(sql, (doc_key,))
            row = cursor.fetchone()

        if not row:
            raise StoreError(f"MariaDB document '{doc_key}' could not be initialized")

        raw = row.get("payload_json")
        if not isinstance(raw, str):
            raise StoreError(f"MariaDB document '{doc_key}' is invalid")

        return _decode_payload_json(raw, f"Invalid MariaDB document '{doc_key}'. Save cancelled."), raw

    def _ensure_document(self, connection: Any, doc_key: str) -> None:
        payload = _default_payload(doc_key)
        payload_json = _json_dumps(payload)

        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT IGNORE INTO fleet_documents
                    (doc_key, schema_version, last_updated, payload_json)
                VALUES
                    (%s, %s, %s, %s)
                """,
                (
                    doc_key,
                    payload["schemaVersion"],
                    payload.get("lastUpdated"),
                    payload_json,
                ),
            )

    def _write_document(self, connection: Any, doc_key: str, payload: dict[str, Any]) -> None:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE fleet_documents
                SET schema_version = %s,
                    last_updated = %s,
                    payload_json = %s
                WHERE doc_key = %s
                """,
                (
                    payload["schemaVersion"],
                    payload.get("lastUpdated"),
                    _json_dumps(payload),
                    doc_key,
                ),
            )

            if cursor.rowcount != 1:
                raise StoreError(f"MariaDB document '{doc_key}' could not be saved")

    def _create_backup(
        self,
        connection: Any,
        doc_key: str,
        prefix: str,
        current_data: dict[str, Any],
        current_raw: str,
    ) -> str | None:
        if current_raw.strip() == "":
            return None

        backup_name = _backup_name(prefix)
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO fleet_document_backups
                    (doc_key, backup_name, previous_last_updated, payload_json)
                VALUES
                    (%s, %s, %s, %s)
                """,
                (
                    doc_key,
                    backup_name,
                    current_data.get("lastUpdated"),
                    current_raw,
                ),
            )

        return backup_name


# Backwards-compatible all-caps DB spelling for callers that search that variant.
MariaDBStore = MariaDbStore


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        raise StoreError(f"{name} is required when FLEET_STORE_BACKEND=mariadb")
    return value


def _import_pymysql() -> Any:
    try:
        import pymysql
    except ImportError as exc:
        raise StoreError("PyMySQL is required when FLEET_STORE_BACKEND=mariadb") from exc
    return pymysql


def _default_payload(doc_key: str) -> dict[str, Any]:
    if doc_key == DOC_TIMERS:
        return {
            "schemaVersion": 2,
            "lastUpdated": None,
            "timers": [],
            "accountSnapshotMeta": {},
        }

    if doc_key == DOC_ACCOUNT_VIEWS:
        return {
            "schemaVersion": 3,
            "lastUpdated": None,
            "views": DEFAULT_ACCOUNT_VIEWS,
            "snapshotFreshnessSettings": DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS,
            "accountTagMap": {},
        }

    raise StoreError(f"Unknown MariaDB document key '{doc_key}'")


def _decode_payload_json(raw: str, invalid_message: str) -> dict[str, Any]:
    if raw.strip() == "":
        return {}

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise StoreError(invalid_message) from exc

    if not isinstance(data, dict):
        raise StoreError(invalid_message)

    return data


def _json_dumps(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _backup_name(prefix: str) -> str:
    now = datetime.now(timezone.utc)
    return f"{prefix}-{now.strftime('%Y%m%d-%H%M%S')}-{now.microsecond:06d}.json"
