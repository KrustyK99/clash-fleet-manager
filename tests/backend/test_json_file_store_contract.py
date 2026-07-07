import json
from pathlib import Path

import pytest

from backend.errors import BadPayloadError, StaleDataError
from backend.stores.json_file_store import (
    DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS,
    JsonFileStore,
)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


@pytest.fixture
def isolated_data_dir(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    monkeypatch.setenv("FLEET_DATA_DIR", str(data_dir))
    return data_dir


@pytest.fixture
def store(isolated_data_dir):
    return JsonFileStore()


def read_store_file(data_dir: Path, name: str) -> dict:
    return json.loads((data_dir / name).read_text(encoding="utf-8"))


def test_load_timers_creates_default_file_when_missing(store, isolated_data_dir):
    payload = store.load_timers()

    assert payload == {
        "schemaVersion": 2,
        "lastUpdated": None,
        "timers": [],
        "accountSnapshotMeta": {},
    }
    assert (isolated_data_dir / "timers.json").exists()
    assert (isolated_data_dir / "backups").is_dir()


def test_load_timers_preserves_existing_timer_fields(store, isolated_data_dir):
    timer = {
        "id": "timer-1",
        "account": "Bart",
        "type": "builder",
        "name": "Archer Tower",
        "finishTime": "2026-07-08T10:30:00Z",
        "notes": "Keep this manual note",
        "pinned": True,
        "unknownFutureField": {"preserve": True},
    }
    write_json(
        isolated_data_dir / "timers.json",
        {
            "schemaVersion": 2,
            "lastUpdated": "2026-07-07T10:00:00Z",
            "timers": [timer],
            "accountSnapshotMeta": {
                "Bart": {
                    "lastLoadedAt": "2026-07-07T09:00:00Z",
                    "tag": "#ABC123",
                    "candidateCount": 3,
                    "selectedCount": 2,
                }
            },
        },
    )

    payload = store.load_timers()

    assert payload["schemaVersion"] == 2
    assert payload["lastUpdated"] == "2026-07-07T10:00:00Z"
    assert payload["timers"] == [timer]
    assert payload["accountSnapshotMeta"]["Bart"]["candidateCount"] == 3


def test_load_timers_normalizes_missing_collection_fields(store, isolated_data_dir):
    write_json(
        isolated_data_dir / "timers.json",
        {
            "schemaVersion": 1,
            "lastUpdated": "2026-07-07T10:00:00Z",
            "timers": "not a list",
            "accountSnapshotMeta": "not an object",
        },
    )

    payload = store.load_timers()

    assert payload["schemaVersion"] == 2
    assert payload["lastUpdated"] == "2026-07-07T10:00:00Z"
    assert payload["timers"] == []
    assert payload["accountSnapshotMeta"] == {}


def test_save_timers_writes_payload_creates_backup_and_preserves_timer_fields(store, isolated_data_dir):
    before_payload = {
        "schemaVersion": 2,
        "lastUpdated": "2026-07-07T10:00:00Z",
        "timers": [
            {
                "id": "old-timer",
                "account": "Bart",
                "type": "lab",
                "name": "Old Upgrade",
            }
        ],
        "accountSnapshotMeta": {},
    }
    write_json(isolated_data_dir / "timers.json", before_payload)

    next_timer = {
        "id": "new-timer",
        "account": "Zylink",
        "type": "builder",
        "name": "Cannon",
        "finishTime": "2026-07-09T12:00:00Z",
        "notes": "manual note",
        "pinned": False,
        "unknownFutureField": "still here",
    }
    result = store.save_timers(
        {
            "lastKnownLastUpdated": before_payload["lastUpdated"],
            "timers": [next_timer],
            "accountSnapshotMeta": {
                "Zylink": {
                    "loadedAt": "2026-07-07T11:00:00-04:00",
                    "tag": "  #XYZ999  ",
                    "candidateCount": "4.6",
                    "selectedCount": 2,
                    "builderCapacity": {"homeTotal": "6", "builderBaseTotal": 2.2},
                }
            },
        }
    )

    assert result["ok"] is True
    assert isinstance(result["lastUpdated"], str)
    assert result["lastUpdated"] != before_payload["lastUpdated"]
    assert result["backupCreated"].startswith("timers-")

    saved = read_store_file(isolated_data_dir, "timers.json")
    assert saved["schemaVersion"] == 2
    assert saved["lastUpdated"] == result["lastUpdated"]
    assert saved["timers"] == [next_timer]
    assert saved["accountSnapshotMeta"] == {
        "Zylink": {
            "lastLoadedAt": "2026-07-07T15:00:00Z",
            "tag": "#XYZ999",
            "candidateCount": 5,
            "selectedCount": 2,
            "builderCapacity": {"homeTotal": 6, "builderBaseTotal": 2},
        }
    }

    backup_path = isolated_data_dir / "backups" / result["backupCreated"]
    assert backup_path.exists()
    assert json.loads(backup_path.read_text(encoding="utf-8")) == before_payload


def test_save_timers_succeeds_with_current_last_updated_and_rejects_stale_metadata(store, isolated_data_dir):
    write_json(
        isolated_data_dir / "timers.json",
        {
            "schemaVersion": 2,
            "lastUpdated": "2026-07-07T10:00:00Z",
            "timers": [],
            "accountSnapshotMeta": {},
        },
    )

    success = store.save_timers(
        {
            "lastKnownLastUpdated": "2026-07-07T10:00:00Z",
            "timers": [{"id": "timer-1", "account": "Bart"}],
            "accountSnapshotMeta": {},
        }
    )
    assert success["ok"] is True

    with pytest.raises(StaleDataError) as exc_info:
        store.save_timers(
            {
                "lastKnownLastUpdated": "2026-07-07T10:00:00Z",
                "timers": [{"id": "timer-2", "account": "Bart"}],
                "accountSnapshotMeta": {},
            }
        )

    stale = exc_info.value.to_payload()
    assert stale["code"] == "STALE_DATA"
    assert stale["currentLastUpdated"] == success["lastUpdated"]
    assert stale["lastKnownLastUpdated"] == "2026-07-07T10:00:00Z"


def test_save_timers_preserves_existing_snapshot_meta_when_older_client_omits_it(store, isolated_data_dir):
    existing_meta = {
        "Bart": {
            "lastLoadedAt": "2026-07-07T14:00:00Z",
            "tag": "#BART",
            "candidateCount": 3,
            "selectedCount": 2,
            "builderCapacity": {"homeTotal": 6},
        }
    }
    write_json(
        isolated_data_dir / "timers.json",
        {
            "schemaVersion": 2,
            "lastUpdated": "2026-07-07T10:00:00Z",
            "timers": [],
            "accountSnapshotMeta": existing_meta,
        },
    )

    result = store.save_timers(
        {
            "lastKnownLastUpdated": "2026-07-07T10:00:00Z",
            "timers": [{"id": "timer-1", "account": "Bart"}],
        }
    )

    assert result["ok"] is True
    assert store.load_timers()["accountSnapshotMeta"] == existing_meta


def test_save_timers_requires_timers_array(store):
    with pytest.raises(BadPayloadError):
        store.save_timers({"lastKnownLastUpdated": None})


def test_load_account_views_creates_default_file_when_missing(store, isolated_data_dir):
    payload = store.load_account_views()

    assert payload["schemaVersion"] == 3
    assert payload["lastUpdated"] is None
    assert payload["views"][0] == {
        "id": "all",
        "label": "All Accounts",
        "accounts": None,
        "system": True,
    }
    assert payload["snapshotFreshnessSettings"] == DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS
    assert payload["accountTagMap"] == {}
    assert (isolated_data_dir / "account_views.json").exists()


def test_load_account_views_normalizes_existing_and_legacy_settings(store, isolated_data_dir):
    write_json(
        isolated_data_dir / "account_views.json",
        {
            "schemaVersion": 2,
            "lastUpdated": "2026-07-07T10:00:00Z",
            "views": [
                {
                    "id": "all",
                    "label": "Wrong label",
                    "accounts": ["Should not persist"],
                },
                {
                    "id": "focus",
                    "label": "  Focus Accounts  ",
                    "accounts": ["Bart", "Bart", "", None, "Zylink"],
                },
            ],
            "settings": {
                "snapshotFreshnessSettings": {"freshHours": "6", "agingHours": "24"},
                "accountTagMap": {" abc123 ": " Bart ", "#zzz": "Zylink", "": "ignored"},
            },
        },
    )

    payload = store.load_account_views()

    assert payload["schemaVersion"] == 3
    assert payload["lastUpdated"] == "2026-07-07T10:00:00Z"
    assert payload["views"] == [
        {
            "id": "all",
            "label": "All Accounts",
            "accounts": None,
            "system": True,
        },
        {
            "id": "focus",
            "label": "Focus Accounts",
            "accounts": ["Bart", "Zylink"],
        },
    ]
    assert payload["snapshotFreshnessSettings"] == {"freshHours": 6, "agingHours": 24}
    assert payload["accountTagMap"] == {"#ABC123": "Bart", "#ZZZ": "Zylink"}


def test_save_account_views_writes_payload_creates_backup_and_normalizes_shared_settings(store, isolated_data_dir):
    before_payload = {
        "schemaVersion": 3,
        "lastUpdated": "2026-07-07T10:00:00Z",
        "views": [
            {"id": "all", "label": "All Accounts", "accounts": None, "system": True},
            {"id": "old", "label": "Old View", "accounts": ["Bart"]},
        ],
        "snapshotFreshnessSettings": {"freshHours": 12, "agingHours": 48},
        "accountTagMap": {"#OLD": "Bart"},
    }
    write_json(isolated_data_dir / "account_views.json", before_payload)

    result = store.save_account_views(
        {
            "lastKnownLastUpdated": before_payload["lastUpdated"],
            "views": [
                {"id": "all", "label": "Bad label", "accounts": ["ignored"]},
                {"id": "focus", "label": "  Focus View ", "accounts": ["Bart", "Bart", "Zylink"]},
                {"id": "dupe", "label": "First duplicate wins", "accounts": ["Heisenberg"]},
                {"id": "dupe", "label": "Second duplicate ignored", "accounts": ["Jesse Pinkman"]},
                {"id": "", "label": "Missing id ignored", "accounts": ["Bart"]},
            ],
            "snapshotFreshnessSettings": {"freshHours": 0, "agingHours": 0},
            "accountTagMap": {" abc123 ": " Bart ", "#def456": "", "#AAA": "Zylink"},
        }
    )

    assert result["ok"] is True
    assert isinstance(result["lastUpdated"], str)
    assert result["lastUpdated"] != before_payload["lastUpdated"]
    assert result["backupCreated"].startswith("account-views-")

    saved = read_store_file(isolated_data_dir, "account_views.json")
    assert saved["schemaVersion"] == 3
    assert saved["lastUpdated"] == result["lastUpdated"]
    assert saved["views"] == [
        {"id": "all", "label": "All Accounts", "accounts": None, "system": True},
        {"id": "focus", "label": "Focus View", "accounts": ["Bart", "Zylink"]},
        {"id": "dupe", "label": "First duplicate wins", "accounts": ["Heisenberg"]},
    ]
    assert saved["snapshotFreshnessSettings"] == {"freshHours": 1, "agingHours": 2}
    assert saved["accountTagMap"] == {"#AAA": "Zylink", "#ABC123": "Bart"}

    backup_path = isolated_data_dir / "backups" / result["backupCreated"]
    assert backup_path.exists()
    assert json.loads(backup_path.read_text(encoding="utf-8")) == before_payload


def test_save_account_views_succeeds_with_current_last_updated_and_rejects_stale_metadata(store, isolated_data_dir):
    write_json(
        isolated_data_dir / "account_views.json",
        {
            "schemaVersion": 3,
            "lastUpdated": "2026-07-07T10:00:00Z",
            "views": [{"id": "all", "label": "All Accounts", "accounts": None, "system": True}],
            "snapshotFreshnessSettings": {"freshHours": 24, "agingHours": 72},
            "accountTagMap": {},
        },
    )

    success = store.save_account_views(
        {
            "lastKnownLastUpdated": "2026-07-07T10:00:00Z",
            "views": [
                {"id": "all", "label": "All Accounts", "accounts": None, "system": True},
                {"id": "focus", "label": "Focus", "accounts": ["Bart"]},
            ],
            "snapshotFreshnessSettings": {"freshHours": 24, "agingHours": 72},
            "accountTagMap": {},
        }
    )
    assert success["ok"] is True

    with pytest.raises(StaleDataError) as exc_info:
        store.save_account_views(
            {
                "lastKnownLastUpdated": "2026-07-07T10:00:00Z",
                "views": [{"id": "all", "label": "All Accounts", "accounts": None, "system": True}],
                "snapshotFreshnessSettings": {"freshHours": 24, "agingHours": 72},
                "accountTagMap": {},
            }
        )

    stale = exc_info.value.to_payload()
    assert stale["code"] == "STALE_VIEWS"
    assert stale["currentLastUpdated"] == success["lastUpdated"]
    assert stale["lastKnownLastUpdated"] == "2026-07-07T10:00:00Z"


def test_save_account_views_preserves_shared_settings_when_older_client_omits_them(store, isolated_data_dir):
    existing_settings = {"freshHours": 8, "agingHours": 36}
    existing_tag_map = {"#BART": "Bart", "#ZYLINK": "Zylink"}
    write_json(
        isolated_data_dir / "account_views.json",
        {
            "schemaVersion": 3,
            "lastUpdated": "2026-07-07T10:00:00Z",
            "views": [{"id": "all", "label": "All Accounts", "accounts": None, "system": True}],
            "snapshotFreshnessSettings": existing_settings,
            "accountTagMap": existing_tag_map,
        },
    )

    result = store.save_account_views(
        {
            "lastKnownLastUpdated": "2026-07-07T10:00:00Z",
            "views": [
                {"id": "all", "label": "All Accounts", "accounts": None, "system": True},
                {"id": "focus", "label": "Focus", "accounts": ["Bart"]},
            ],
        }
    )

    assert result["ok"] is True
    payload = store.load_account_views()
    assert payload["snapshotFreshnessSettings"] == existing_settings
    assert payload["accountTagMap"] == existing_tag_map


def test_save_account_views_requires_views_array(store):
    with pytest.raises(BadPayloadError):
        store.save_account_views({"lastKnownLastUpdated": None})
