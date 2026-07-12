import json
import os
from pathlib import Path
from typing import Any

import pytest

from backend.errors import BadPayloadError, StaleDataError
from backend.stores.json_file_store import DEFAULT_SNAPSHOT_FRESHNESS_SETTINGS
from backend.stores.mariadb_store import MariaDbConfig, MariaDbStore

pytestmark = pytest.mark.mariadb

REQUIRED_ENV = [
    "FLEET_TEST_MARIADB_HOST",
    "FLEET_TEST_MARIADB_DATABASE",
    "FLEET_TEST_MARIADB_USER",
    "FLEET_TEST_MARIADB_PASSWORD",
]


def _require_test_config():
    missing = [name for name in REQUIRED_ENV if not os.environ.get(name)]
    if missing:
        pytest.skip(f"MariaDB test environment not configured: missing {', '.join(missing)}")

    if os.environ.get("FLEET_ALLOW_MARIADB_TEST_WRITES") != "1":
        pytest.skip("Set FLEET_ALLOW_MARIADB_TEST_WRITES=1 to enable MariaDB integration tests")

    database = os.environ["FLEET_TEST_MARIADB_DATABASE"]
    if "test" not in database.lower():
        pytest.skip("MariaDB integration tests require a database name containing 'test'")

    try:
        import pymysql
    except ImportError:
        pytest.skip("PyMySQL is not installed")

    config = MariaDbConfig(
        host=os.environ["FLEET_TEST_MARIADB_HOST"],
        port=int(os.environ.get("FLEET_TEST_MARIADB_PORT", "3306")),
        database=database,
        user=os.environ["FLEET_TEST_MARIADB_USER"],
        password=os.environ["FLEET_TEST_MARIADB_PASSWORD"],
    )
    return pymysql, config


def _apply_schema(connection: Any) -> None:
    schema_path = Path(__file__).resolve().parents[2] / "backend" / "db" / "mariadb_schema.sql"
    statements = [part.strip() for part in schema_path.read_text(encoding="utf-8").split(";")]

    with connection.cursor() as cursor:
        for statement in statements:
            if statement:
                cursor.execute(statement)

    connection.commit()


def _clear_store_tables(connection: Any) -> None:
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM fleet_document_backups")
        cursor.execute("DELETE FROM fleet_documents")
    connection.commit()


@pytest.fixture
def mariadb_connection():
    pymysql, config = _require_test_config()
    connection = pymysql.connect(
        host=config.host,
        port=config.port,
        database=config.database,
        user=config.user,
        password=config.password,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )

    try:
        _apply_schema(connection)
        _clear_store_tables(connection)
        yield connection
    finally:
        _clear_store_tables(connection)
        connection.close()


@pytest.fixture
def store(mariadb_connection):
    return MariaDbStore(
        MariaDbConfig(
            host=os.environ["FLEET_TEST_MARIADB_HOST"],
            port=int(os.environ.get("FLEET_TEST_MARIADB_PORT", "3306")),
            database=os.environ["FLEET_TEST_MARIADB_DATABASE"],
            user=os.environ["FLEET_TEST_MARIADB_USER"],
            password=os.environ["FLEET_TEST_MARIADB_PASSWORD"],
        )
    )


def _backup_count(connection: Any, doc_key: str) -> int:
    with connection.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) AS count FROM fleet_document_backups WHERE doc_key = %s", (doc_key,))
        row = cursor.fetchone()
    return int(row["count"])


def _seed_document(connection: Any, doc_key: str, payload: dict[str, Any]) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO fleet_documents
                (doc_key, schema_version, last_updated, payload_json)
            VALUES
                (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                schema_version = VALUES(schema_version),
                last_updated = VALUES(last_updated),
                payload_json = VALUES(payload_json)
            """,
            (
                doc_key,
                payload["schemaVersion"],
                payload.get("lastUpdated"),
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            ),
        )
    connection.commit()


def test_load_timers_initializes_default_document(store):
    payload = store.load_timers()

    assert payload == {
        "schemaVersion": 2,
        "lastUpdated": None,
        "timers": [],
        "accountSnapshotMeta": {},
    }


def test_load_timers_preserves_existing_timer_fields(store, mariadb_connection):
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
    _seed_document(
        mariadb_connection,
        "timers",
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


def test_load_timers_normalizes_missing_collection_fields(store, mariadb_connection):
    _seed_document(
        mariadb_connection,
        "timers",
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


def test_save_timers_writes_payload_creates_backup_and_rejects_stale_save(store, mariadb_connection):
    result = store.save_timers(
        {
            "lastKnownLastUpdated": None,
            "timers": [
                {
                    "id": "timer-1",
                    "account": "Zylink",
                    "type": "builder",
                    "name": "Cannon",
                    "unknownFutureField": "preserved",
                }
            ],
            "accountSnapshotMeta": {
                "Zylink": {
                    "loadedAt": "2026-07-07T11:00:00-04:00",
                    "tag": " #XYZ999 ",
                    "candidateCount": "4.6",
                    "selectedCount": 2,
                    "builderCapacity": {"homeTotal": "6", "builderBaseTotal": 2.2},
                }
            },
        }
    )

    assert result["ok"] is True
    assert result["backupCreated"].startswith("timers-")
    assert _backup_count(mariadb_connection, "timers") == 1

    saved = store.load_timers()
    assert saved["lastUpdated"] == result["lastUpdated"]
    assert saved["timers"][0]["unknownFutureField"] == "preserved"
    assert saved["accountSnapshotMeta"] == {
        "Zylink": {
            "lastLoadedAt": "2026-07-07T15:00:00Z",
            "tag": "#XYZ999",
            "candidateCount": 5,
            "selectedCount": 2,
            "builderCapacity": {"homeTotal": 6, "builderBaseTotal": 2},
        }
    }

    with pytest.raises(StaleDataError) as exc_info:
        store.save_timers(
            {
                "lastKnownLastUpdated": None,
                "timers": [{"id": "timer-2", "account": "Bart"}],
                "accountSnapshotMeta": {},
            }
        )

    stale = exc_info.value.to_payload()
    assert stale["code"] == "STALE_DATA"
    assert stale["currentLastUpdated"] == result["lastUpdated"]
    assert stale["lastKnownLastUpdated"] is None


def test_save_timers_preserves_existing_snapshot_meta_when_older_client_omits_it(store, mariadb_connection):
    existing_meta = {
        "Bart": {
            "lastLoadedAt": "2026-07-07T14:00:00Z",
            "tag": "#BART",
            "candidateCount": 3,
            "selectedCount": 2,
            "builderCapacity": {"homeTotal": 6},
        }
    }
    _seed_document(
        mariadb_connection,
        "timers",
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


def test_load_account_views_initializes_default_document(store):
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


def test_load_account_views_normalizes_existing_and_legacy_settings(store, mariadb_connection):
    _seed_document(
        mariadb_connection,
        "account_views",
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


def test_save_account_views_normalizes_settings_creates_backup_and_rejects_stale_save(
    store,
    mariadb_connection,
):
    result = store.save_account_views(
        {
            "lastKnownLastUpdated": None,
            "views": [
                {"id": "all", "label": "Wrong label", "accounts": ["ignored"]},
                {"id": "focus", "label": " Focus ", "accounts": ["Bart", "Bart", "Zylink"]},
            ],
            "snapshotFreshnessSettings": {"freshHours": 0, "agingHours": 0},
            "accountTagMap": {" abc123 ": " Bart ", "#AAA": "Zylink"},
        }
    )

    assert result["ok"] is True
    assert result["backupCreated"].startswith("account-views-")
    assert _backup_count(mariadb_connection, "account_views") == 1

    saved = store.load_account_views()
    assert saved["lastUpdated"] == result["lastUpdated"]
    assert saved["views"] == [
        {"id": "all", "label": "All Accounts", "accounts": None, "system": True},
        {"id": "focus", "label": "Focus", "accounts": ["Bart", "Zylink"]},
    ]
    assert saved["snapshotFreshnessSettings"] == {"freshHours": 1, "agingHours": 2}
    assert saved["accountTagMap"] == {"#AAA": "Zylink", "#ABC123": "Bart"}

    with pytest.raises(StaleDataError) as exc_info:
        store.save_account_views(
            {
                "lastKnownLastUpdated": None,
                "views": [{"id": "all", "label": "All Accounts", "accounts": None, "system": True}],
                "snapshotFreshnessSettings": {"freshHours": 24, "agingHours": 72},
                "accountTagMap": {},
            }
        )

    stale = exc_info.value.to_payload()
    assert stale["code"] == "STALE_VIEWS"
    assert stale["currentLastUpdated"] == result["lastUpdated"]
    assert stale["lastKnownLastUpdated"] is None


def test_save_account_views_preserves_shared_settings_when_older_client_omits_them(store, mariadb_connection):
    existing_settings = {"freshHours": 8, "agingHours": 36}
    existing_tag_map = {"#BART": "Bart", "#ZYLINK": "Zylink"}
    _seed_document(
        mariadb_connection,
        "account_views",
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
