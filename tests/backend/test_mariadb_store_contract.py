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


def test_load_timers_initializes_default_document(store):
    payload = store.load_timers()

    assert payload == {
        "schemaVersion": 2,
        "lastUpdated": None,
        "timers": [],
        "accountSnapshotMeta": {},
    }


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


def test_save_account_views_requires_views_array(store):
    with pytest.raises(BadPayloadError):
        store.save_account_views({"lastKnownLastUpdated": None})
