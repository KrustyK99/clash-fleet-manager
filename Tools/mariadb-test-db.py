from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

REQUIRED_ENV = [
    "FLEET_TEST_MARIADB_HOST",
    "FLEET_TEST_MARIADB_DATABASE",
    "FLEET_TEST_MARIADB_USER",
    "FLEET_TEST_MARIADB_PASSWORD",
]

DOC_FIXTURES = {
    "timers": Path("tests/fixtures/data/timers.json"),
    "account_views": Path("tests/fixtures/data/account_views.json"),
}


def project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def require_test_config() -> dict[str, Any]:
    missing = [name for name in REQUIRED_ENV if not os.environ.get(name)]
    if missing:
        raise RuntimeError(
            "MariaDB test environment is not configured. Missing: " + ", ".join(missing)
        )

    if os.environ.get("FLEET_ALLOW_MARIADB_TEST_WRITES") != "1":
        raise RuntimeError("Set FLEET_ALLOW_MARIADB_TEST_WRITES=1 to allow MariaDB test writes.")

    database = os.environ["FLEET_TEST_MARIADB_DATABASE"].strip()
    database_lower = database.lower()
    if "test" not in database_lower:
        raise RuntimeError("Refusing to write: FLEET_TEST_MARIADB_DATABASE must contain 'test'.")

    production_markers = {"prod", "production", "live"}
    database_tokens = {token for token in re.split(r"[^a-z0-9]+", database_lower) if token}
    if production_markers.intersection(database_tokens):
        raise RuntimeError(
            "Refusing to write: FLEET_TEST_MARIADB_DATABASE looks production-like. "
            "Use a disposable database whose name contains 'test'."
        )

    port_raw = os.environ.get("FLEET_TEST_MARIADB_PORT", "3306")
    try:
        port = int(port_raw)
    except ValueError as exc:
        raise RuntimeError("FLEET_TEST_MARIADB_PORT must be an integer.") from exc

    return {
        "host": os.environ["FLEET_TEST_MARIADB_HOST"],
        "port": port,
        "database": database,
        "user": os.environ["FLEET_TEST_MARIADB_USER"],
        "password": os.environ["FLEET_TEST_MARIADB_PASSWORD"],
    }


def connect(config: dict[str, Any]) -> Any:
    try:
        import pymysql
    except ImportError as exc:
        raise RuntimeError(
            "PyMySQL is required. Install backend requirements with: "
            "python -m pip install -r backend/requirements.txt"
        ) from exc

    return pymysql.connect(
        host=config["host"],
        port=config["port"],
        database=config["database"],
        user=config["user"],
        password=config["password"],
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def apply_schema(connection: Any, root: Path) -> None:
    schema_path = root / "backend" / "db" / "mariadb_schema.sql"
    statements = [part.strip() for part in schema_path.read_text(encoding="utf-8").split(";")]

    with connection.cursor() as cursor:
        for statement in statements:
            if statement:
                cursor.execute(statement)

    connection.commit()


def clear_store_tables(connection: Any) -> None:
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM fleet_document_backups")
        cursor.execute("DELETE FROM fleet_documents")
    connection.commit()


def seed_fixture_documents(connection: Any, root: Path) -> None:
    with connection.cursor() as cursor:
        for doc_key, fixture_relative_path in DOC_FIXTURES.items():
            fixture_path = root / fixture_relative_path
            payload = json.loads(fixture_path.read_text(encoding="utf-8"))
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare a disposable MariaDB test database for Clash Fleet Manager."
    )
    parser.add_argument("--apply-schema", action="store_true", help="Apply backend/db/mariadb_schema.sql.")
    parser.add_argument("--clear", action="store_true", help="Clear only the FleetStore test tables.")
    parser.add_argument(
        "--seed-fixtures",
        action="store_true",
        help="Seed fleet_documents from tests/fixtures/data for API/E2E verification.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = project_root()
    config = require_test_config()

    connection = connect(config)
    try:
        if args.apply_schema or not (args.clear or args.seed_fixtures):
            apply_schema(connection, root)
            print("Applied MariaDB schema to disposable test database.")

        if args.clear:
            clear_store_tables(connection)
            print("Cleared FleetStore MariaDB test tables.")

        if args.seed_fixtures:
            seed_fixture_documents(connection, root)
            print("Seeded MariaDB test database from tests/fixtures/data.")
    finally:
        connection.close()

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
