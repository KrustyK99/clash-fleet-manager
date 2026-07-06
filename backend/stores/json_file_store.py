from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..errors import BadPayloadError, StoreError as JsonStoreError, StaleDataError

DEFAULT_ACCOUNT_VIEWS: list[dict[str, Any]] = [
    {
        "id": "all",
        "label": "All Accounts",
        "accounts": None,
        "system": True,
    },
    {
        "id": "view-1",
        "label": "View 1",
        "accounts": ["Heisenberg", "Jesse Pinkman", "Dark Lord"],
    },
    {
        "id": "view-2",
        "label": "View 2",
        "accounts": ["Felicity", "Isabella", "Lady Scarlett"],
    },
]

DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS = {
    "freshHours": 24,
    "agingHours": 72,
}

MAX_BACKUPS = 50


_path_locks: dict[Path, threading.Lock] = {}
_path_locks_guard = threading.Lock()


def _lock_for(path: Path) -> threading.Lock:
    resolved = path.resolve()
    with _path_locks_guard:
        if resolved not in _path_locks:
            _path_locks[resolved] = threading.Lock()
        return _path_locks[resolved]


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def resolve_data_dir() -> Path:
    configured = os.environ.get("FLEET_DATA_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return project_root() / "data"


class JsonFileStore:
    """JSON-file-backed implementation of the FleetStore contract."""

    def load_timers(self) -> dict[str, Any]:
        return load_timers()

    def save_timers(self, payload: dict[str, Any]) -> dict[str, Any]:
        return save_timers(payload)

    def load_account_views(self) -> dict[str, Any]:
        return load_account_views()

    def save_account_views(self, payload: dict[str, Any]) -> dict[str, Any]:
        return save_account_views(payload)


def ensure_store_files() -> None:
    data_dir = resolve_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "backups").mkdir(parents=True, exist_ok=True)

    timers_file = data_dir / "timers.json"
    if not timers_file.exists():
        _write_json(
            timers_file,
            {
                "schemaVersion": 2,
                "lastUpdated": None,
                "timers": [],
                "accountSnapshotMeta": {},
            },
        )

    views_file = data_dir / "account_views.json"
    if not views_file.exists():
        _write_json(
            views_file,
            {
                "schemaVersion": 3,
                "lastUpdated": None,
                "views": DEFAULT_ACCOUNT_VIEWS,
                "snapshotFreshnessSettings": DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS,
                "accountTagMap": {},
            },
        )


def load_timers() -> dict[str, Any]:
    ensure_store_files()
    data = _read_json(resolve_data_dir() / "timers.json", "Invalid data file")

    if not isinstance(data.get("timers"), list):
        data["timers"] = []

    if not isinstance(data.get("accountSnapshotMeta"), dict):
        data["accountSnapshotMeta"] = {}

    data["schemaVersion"] = 2
    data.setdefault("lastUpdated", None)

    return data


def load_account_views() -> dict[str, Any]:
    ensure_store_files()
    data = _read_json(resolve_data_dir() / "account_views.json", "Invalid views file")

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


def save_timers(incoming: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(incoming.get("timers"), list):
        raise BadPayloadError("Payload must include timers array")

    ensure_store_files()
    path = resolve_data_dir() / "timers.json"

    with _lock_for(path):
        current_raw = _read_text(path)
        current_data = _decode_current_json(current_raw, "Invalid current data file. Save cancelled.")
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

        backup_path = _create_backup(current_raw, "timers")
        _write_json(path, payload)
        _prune_backups("timers")

    return {
        "ok": True,
        "lastUpdated": payload["lastUpdated"],
        "backupCreated": backup_path.name if backup_path else None,
    }


def save_account_views(incoming: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(incoming.get("views"), list):
        raise BadPayloadError("Payload must include views array")

    ensure_store_files()
    path = resolve_data_dir() / "account_views.json"

    with _lock_for(path):
        current_raw = _read_text(path)
        current_data = _decode_current_json(current_raw, "Invalid current views file. Save cancelled.")
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

        backup_path = _create_backup(current_raw, "account-views")
        _write_json(path, payload)
        _prune_backups("account-views")

    return {
        "ok": True,
        "lastUpdated": payload["lastUpdated"],
        "backupCreated": backup_path.name if backup_path else None,
    }


def normalize_account_name(value: Any) -> str | None:
    if not isinstance(value, (str, int, float, bool)):
        return None
    name = str(value).strip()
    return name or None


def normalize_player_tag(value: Any) -> str | None:
    if not isinstance(value, (str, int, float, bool)):
        return None
    clean = "".join(str(value).strip().upper().split())
    if not clean:
        return None
    if not clean.startswith("#"):
        clean = f"#{clean}"
    return clean


def normalize_account_tag_map(value: Any, fallback: Any = None) -> dict[str, str]:
    source = value if isinstance(value, dict) else fallback if isinstance(fallback, dict) else {}
    normalized: dict[str, str] = {}

    for raw_tag, raw_account in source.items():
        tag = normalize_player_tag(raw_tag)
        account = normalize_account_name(raw_account)
        if tag is None or account is None:
            continue
        normalized[tag] = account

    return dict(sorted(normalized.items(), key=lambda item: item[0].casefold()))


def normalize_account_views(views: list[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    def add_view(raw: dict[str, Any]) -> None:
        raw_id = str(raw.get("id", "")).strip() if isinstance(raw.get("id", ""), (str, int, float, bool)) else ""
        is_system = raw.get("system") is True or raw_id == "all"
        view_id = "all" if is_system else raw_id

        if not view_id or view_id in seen_ids:
            return

        label = str(raw.get("label", "")).strip() if isinstance(raw.get("label", ""), (str, int, float, bool)) else ""
        if is_system:
            label = "All Accounts"

        if not label:
            return

        accounts = None
        if not is_system:
            accounts = []
            if "accounts" in raw and raw["accounts"] is None:
                accounts = None
            elif isinstance(raw.get("accounts"), list):
                seen_accounts: set[str] = set()
                for account in raw["accounts"]:
                    name = normalize_account_name(account)
                    if name is None or name in seen_accounts:
                        continue
                    seen_accounts.add(name)
                    accounts.append(name)

        view = {
            "id": view_id,
            "label": label,
            "accounts": None if is_system else accounts,
        }
        if is_system:
            view["system"] = True

        seen_ids.add(view_id)
        normalized.append(view)

    add_view({"id": "all", "label": "All Accounts", "accounts": None, "system": True})

    for raw_view in views:
        if isinstance(raw_view, dict):
            add_view(raw_view)

    return normalized


def normalize_snapshot_freshness_settings(settings: Any) -> dict[str, int]:
    defaults = DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS

    if not isinstance(settings, dict):
        return dict(defaults)

    fresh_hours = _rounded_int(settings.get("freshHours"), defaults["freshHours"])
    aging_hours = _rounded_int(settings.get("agingHours"), defaults["agingHours"])

    fresh_hours = max(1, min(720, fresh_hours))
    aging_hours = max(2, min(720, aging_hours))

    if aging_hours <= fresh_hours:
        aging_hours = min(720, fresh_hours + 1)

    return {
        "freshHours": fresh_hours,
        "agingHours": aging_hours,
    }


def normalize_account_snapshot_meta(meta: Any, existing_meta: Any = None) -> dict[str, dict[str, Any]]:
    if not isinstance(meta, dict):
        return {}

    existing = existing_meta if isinstance(existing_meta, dict) else {}
    normalized: dict[str, dict[str, Any]] = {}

    for account, raw_meta in meta.items():
        name = normalize_account_name(account)
        if name is None or not isinstance(raw_meta, dict):
            continue

        loaded_at = (
            raw_meta.get("lastLoadedAt")
            or raw_meta.get("loadedAt")
            or raw_meta.get("lastSnapshotLoadedAt")
            or raw_meta.get("updatedAt")
        )
        last_loaded_at = normalize_iso_date(loaded_at)
        if last_loaded_at is None:
            continue

        tag = raw_meta.get("tag") if isinstance(raw_meta.get("tag"), (str, int, float, bool)) else ""
        tag = str(tag).strip()

        existing_account_meta = existing.get(name) if isinstance(existing.get(name), dict) else None

        if "builderCapacity" in raw_meta:
            builder_capacity = normalize_builder_capacity(raw_meta.get("builderCapacity"))
        else:
            builder_capacity = normalize_builder_capacity(
                None,
                existing_account_meta.get("builderCapacity") if existing_account_meta else None,
            )

        entry: dict[str, Any] = {
            "lastLoadedAt": last_loaded_at,
            "tag": tag,
            "candidateCount": normalize_non_negative_int(raw_meta.get("candidateCount", 0)),
            "selectedCount": normalize_non_negative_int(raw_meta.get("selectedCount", 0)),
        }

        if builder_capacity is not None:
            entry["builderCapacity"] = builder_capacity

        normalized[name] = entry

    return normalized


def normalize_iso_date(value: Any) -> str | None:
    if not isinstance(value, (str, int, float, bool)):
        return None

    raw = str(value).strip()
    if not raw:
        return None

    try:
        if raw.endswith("Z"):
            raw = f"{raw[:-1]}+00:00"
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_non_negative_int(value: Any) -> int:
    try:
        return max(0, round(float(value)))
    except (TypeError, ValueError):
        return 0


def normalize_optional_non_negative_int(value: Any) -> int | None:
    try:
        return max(0, round(float(value)))
    except (TypeError, ValueError):
        return None


def normalize_builder_capacity(capacity: Any, fallback: Any = None) -> dict[str, int] | None:
    source = capacity if isinstance(capacity, dict) else fallback if isinstance(fallback, dict) else None
    if source is None:
        return None

    home_total = normalize_optional_non_negative_int(source.get("homeTotal"))
    builder_base_total = normalize_optional_non_negative_int(source.get("builderBaseTotal"))

    if home_total is None and builder_base_total is None:
        return None

    normalized: dict[str, int] = {}
    if home_total is not None:
        normalized["homeTotal"] = home_total
    if builder_base_total is not None:
        normalized["builderBaseTotal"] = builder_base_total

    return normalized


def now_iso_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _rounded_int(value: Any, default: int) -> int:
    try:
        return round(float(value))
    except (TypeError, ValueError):
        return default


def _read_json(path: Path, invalid_message: str) -> dict[str, Any]:
    raw = _read_text(path)
    data = _decode_current_json(raw, invalid_message)
    return data


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        raise JsonStoreError(f"Could not read {path.name}") from exc


def _decode_current_json(raw: str, invalid_message: str) -> dict[str, Any]:
    if raw.strip() == "":
        return {}

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise JsonStoreError(invalid_message) from exc

    if not isinstance(data, dict):
        raise JsonStoreError(invalid_message)

    return data


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError as exc:
        raise JsonStoreError(f"Could not write {path.name}") from exc


def _create_backup(current_raw: str, prefix: str) -> Path | None:
    if current_raw.strip() == "":
        return None

    backup_dir = resolve_data_dir() / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    backup_path = backup_dir / f"{prefix}-{now.strftime('%Y%m%d-%H%M%S')}-{now.microsecond:06d}.json"

    try:
        backup_path.write_text(current_raw, encoding="utf-8")
    except OSError as exc:
        raise JsonStoreError("Could not create backup. Save cancelled.") from exc

    return backup_path


def _prune_backups(prefix: str) -> None:
    backup_dir = resolve_data_dir() / "backups"
    files = sorted(
        backup_dir.glob(f"{prefix}-*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )

    for old_file in files[MAX_BACKUPS:]:
        try:
            old_file.unlink()
        except OSError:
            pass
