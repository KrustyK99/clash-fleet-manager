#!/usr/bin/env python3
"""Use-case tests for the Clash SQLite schema.

Run from the project folder containing schema.sql and seed_game_objects.sql:

    python schema_use_case_tests.py

The tests use an in-memory SQLite database and do not touch your real data file.
"""

from __future__ import annotations

import hashlib
import pathlib
import sqlite3
from typing import Callable

BASE_DIR = pathlib.Path(__file__).resolve().parent
SCHEMA_PATH = BASE_DIR / "schema.sql"
SEED_PATH = BASE_DIR / "seed_game_objects.sql"

TestFn = Callable[[], None]
TESTS: list[TestFn] = []


def test(fn: TestFn) -> TestFn:
    TESTS.append(fn)
    return fn


def new_conn(load_seed: bool = False) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.execute("PRAGMA foreign_keys=ON")
    if load_seed:
        conn.executescript(SEED_PATH.read_text(encoding="utf-8"))
    return conn


def q1(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> sqlite3.Row | None:
    return conn.execute(sql, params).fetchone()


def qv(conn: sqlite3.Connection, sql: str, params: tuple = ()):
    row = q1(conn, sql, params)
    assert row is not None, f"No row returned for query: {sql}"
    return row[0]


def qall(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    return list(conn.execute(sql, params).fetchall())


def insert_snapshot(
    conn: sqlite3.Connection,
    account_name: str = "Heisenberg",
    tag: str = "#ABC123",
    raw: str = '{"tag":"#ABC123"}',
    sha: str | None = None,
) -> int:
    if sha is None:
        sha = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    conn.execute(
        """
        INSERT INTO snapshots (
            account_name, player_tag, snapshot_timestamp, source,
            raw_json, raw_sha256, raw_size_bytes, parsed_summary_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (account_name, tag, 1_710_000_000, "test", raw, sha, len(raw), "{}"),
    )
    return int(qv(conn, "SELECT last_insert_rowid()"))


@test
def schema_bootstrap() -> None:
    conn = new_conn()
    tables = {r[0] for r in qall(conn, "SELECT name FROM sqlite_master WHERE type='table'")}
    required = {
        "accounts", "game_areas", "snapshots", "game_objects",
        "snapshot_timer_candidates", "event_types", "events", "account_event_statuses",
    }
    assert not (required - tables), f"missing tables: {required - tables}"
    assert qv(conn, "SELECT COUNT(*) FROM game_areas") >= 4
    assert qv(conn, "SELECT COUNT(*) FROM event_types") >= 7


@test
def seed_game_objects_loads() -> None:
    conn = new_conn(load_seed=True)
    count = qv(conn, "SELECT COUNT(*) FROM game_objects WHERE mapping_source='seed_v1_index_html'")
    assert count > 50, count
    row = q1(conn, """
        SELECT object_name, mapping_status, mapping_confidence
        FROM game_objects
        WHERE game_area_code='home' AND category='buildings' AND data_id=1000021
    """)
    assert row is not None
    assert row["object_name"] == "X-Bow"
    assert row["mapping_status"] == "verified"
    assert row["mapping_confidence"] == "manual"


@test
def snapshot_import_creates_account_and_links() -> None:
    conn = new_conn()
    sid = insert_snapshot(conn, "Heisenberg", "#ABC123")
    acct = q1(conn, "SELECT id, account_name, player_tag FROM accounts WHERE player_tag='#ABC123'")
    assert acct is not None
    assert qv(conn, "SELECT account_id FROM snapshots WHERE id=?", (sid,)) == acct["id"]


@test
def snapshot_import_existing_account_reuses_it() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO accounts(player_tag, account_name) VALUES('#ABC123','Heisenberg')")
    acct_id = qv(conn, "SELECT id FROM accounts WHERE player_tag='#ABC123'")
    sid = insert_snapshot(conn, "Heisenberg", "#ABC123", raw='{"tag":"#ABC123","n":1}')
    assert qv(conn, "SELECT COUNT(*) FROM accounts WHERE player_tag='#ABC123'") == 1
    assert qv(conn, "SELECT account_id FROM snapshots WHERE id=?", (sid,)) == acct_id


@test
def placeholder_account_name_gets_real_tag() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO accounts(player_tag, account_name, notes) VALUES('TEMP-Heisenberg','Heisenberg','placeholder')")
    old_id = qv(conn, "SELECT id FROM accounts WHERE account_name='Heisenberg'")
    sid = insert_snapshot(conn, "Heisenberg", "#REALTAG", raw='{"tag":"#REALTAG"}')
    row = q1(conn, "SELECT id, player_tag FROM accounts WHERE account_name='Heisenberg'")
    assert row is not None
    assert row["id"] == old_id
    assert row["player_tag"] == "#REALTAG"
    assert qv(conn, "SELECT account_id FROM snapshots WHERE id=?", (sid,)) == old_id
    assert qv(conn, "SELECT COUNT(*) FROM accounts") == 1


@test
def exact_duplicate_snapshot_is_rejected() -> None:
    conn = new_conn()
    raw = '{"tag":"#DUP","timestamp":1}'
    insert_snapshot(conn, "Dup", "#DUP", raw)
    try:
        insert_snapshot(conn, "Dup", "#DUP", raw)
    except sqlite3.IntegrityError:
        return
    raise AssertionError("duplicate insert succeeded")


@test
def candidate_known_object_does_not_overwrite_seed() -> None:
    conn = new_conn(load_seed=True)
    sid = insert_snapshot(conn, "Known", "#KNOWN", raw='{"tag":"#KNOWN"}')
    conn.execute(
        """
        INSERT INTO snapshot_timer_candidates(
            snapshot_id, game_area_code, category, json_path, data_id, level,
            timer_seconds, quantity, label, raw_item_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (sid, "home", "buildings", "$.buildings[0]", 1000021, 12, 3600, 1, "X-Bow L12", "{}"),
    )
    row = q1(conn, """
        SELECT object_name, mapping_status, mapping_confidence, first_seen_snapshot_id, last_seen_snapshot_id
        FROM game_objects
        WHERE game_area_code='home' AND category='buildings' AND data_id=1000021
    """)
    assert row is not None
    assert row["object_name"] == "X-Bow"
    assert row["mapping_status"] == "verified"
    assert row["mapping_confidence"] == "manual"
    assert row["first_seen_snapshot_id"] == sid
    assert row["last_seen_snapshot_id"] == sid


@test
def candidate_unknown_object_creates_placeholder() -> None:
    conn = new_conn()
    sid = insert_snapshot(conn, "Unknown", "#UNK", raw='{"tag":"#UNK"}')
    conn.execute(
        """
        INSERT INTO snapshot_timer_candidates(
            snapshot_id, game_area_code, category, json_path, data_id, level,
            timer_seconds, label, raw_item_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (sid, "home", "buildings", "$.buildings[9]", 1000102, 1, 7200, "Building 1000102", "{}"),
    )
    row = q1(conn, "SELECT * FROM game_objects WHERE game_area_code='home' AND category='buildings' AND data_id=1000102")
    assert row is not None
    assert row["object_name"] == "Unknown buildings 1000102"
    assert row["mapping_status"] == "unknown"
    assert row["mapping_source"] == "snapshot_timer_candidate"
    assert row["mapping_confidence"] == "unverified"
    assert row["first_seen_snapshot_id"] == sid
    assert row["last_seen_snapshot_id"] == sid


@test
def candidate_null_data_id_allowed_no_placeholder() -> None:
    conn = new_conn()
    sid = insert_snapshot(conn, "NoObj", "#NOOBJ", raw='{"tag":"#NOOBJ"}')
    conn.execute(
        """
        INSERT INTO snapshot_timer_candidates(
            snapshot_id, game_area_code, category, json_path, data_id, level,
            timer_seconds, label, raw_item_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (sid, "unknown", "helpers", "$.helpers[0]", None, None, 1800, "helper cooldown", "{}"),
    )
    assert qv(conn, "SELECT COUNT(*) FROM snapshot_timer_candidates") == 1
    assert qv(conn, "SELECT COUNT(*) FROM game_objects") == 0


@test
def snapshot_delete_cascades_candidates_and_nulls_seen_refs() -> None:
    conn = new_conn()
    sid = insert_snapshot(conn, "Del", "#DEL", raw='{"tag":"#DEL"}')
    conn.execute(
        """
        INSERT INTO snapshot_timer_candidates(
            snapshot_id, game_area_code, category, json_path, data_id, level,
            timer_seconds, label, raw_item_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (sid, "home", "buildings", "$.buildings[0]", 12345, 1, 3600, "Unknown", "{}"),
    )
    oid = qv(conn, "SELECT id FROM game_objects WHERE data_id=12345")
    conn.execute("DELETE FROM snapshots WHERE id=?", (sid,))
    assert qv(conn, "SELECT COUNT(*) FROM snapshot_timer_candidates WHERE snapshot_id=?", (sid,)) == 0
    row = q1(conn, "SELECT first_seen_snapshot_id,last_seen_snapshot_id FROM game_objects WHERE id=?", (oid,))
    assert row is not None
    assert row["first_seen_snapshot_id"] is None
    assert row["last_seen_snapshot_id"] is None


@test
def create_active_event_autocreates_statuses_for_active_accounts_only() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO accounts(player_tag, account_name, is_active) VALUES('#A','A',1)")
    conn.execute("INSERT INTO accounts(player_tag, account_name, is_active) VALUES('#B','B',1)")
    conn.execute("INSERT INTO accounts(player_tag, account_name, is_active) VALUES('#OLD','Old',0)")
    conn.execute("INSERT INTO events(event_type_code,event_name,is_active,auto_create_statuses) VALUES('clan_games','Clan Games June 2026',1,1)")
    eid = qv(conn, "SELECT id FROM events WHERE event_name='Clan Games June 2026'")
    assert qv(conn, "SELECT COUNT(*) FROM account_event_statuses WHERE event_id=?", (eid,)) == 2


@test
def draft_event_creates_no_statuses_until_activated() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO accounts(player_tag, account_name, is_active) VALUES('#A','A',1)")
    conn.execute("INSERT INTO accounts(player_tag, account_name, is_active) VALUES('#B','B',1)")
    conn.execute("INSERT INTO events(event_type_code,event_name,is_active,auto_create_statuses) VALUES('clan_games','Draft CG',0,1)")
    eid = qv(conn, "SELECT id FROM events WHERE event_name='Draft CG'")
    assert qv(conn, "SELECT COUNT(*) FROM account_event_statuses WHERE event_id=?", (eid,)) == 0
    conn.execute("UPDATE events SET is_active=1 WHERE id=?", (eid,))
    assert qv(conn, "SELECT COUNT(*) FROM account_event_statuses WHERE event_id=?", (eid,)) == 2


@test
def manual_event_auto_create_zero_creates_no_statuses_until_enabled() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO accounts(player_tag, account_name) VALUES('#A','A')")
    conn.execute("INSERT INTO accounts(player_tag, account_name) VALUES('#B','B')")
    conn.execute("INSERT INTO events(event_type_code,event_name,is_active,auto_create_statuses) VALUES('temporary_event','Manual Event',1,0)")
    eid = qv(conn, "SELECT id FROM events WHERE event_name='Manual Event'")
    assert qv(conn, "SELECT COUNT(*) FROM account_event_statuses WHERE event_id=?", (eid,)) == 0
    conn.execute("UPDATE events SET auto_create_statuses=1 WHERE id=?", (eid,))
    assert qv(conn, "SELECT COUNT(*) FROM account_event_statuses WHERE event_id=?", (eid,)) == 2


@test
def adding_active_account_after_event_gets_status() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO events(event_type_code,event_name,is_active,auto_create_statuses) VALUES('season_challenge','Season June 2026',1,1)")
    eid = qv(conn, "SELECT id FROM events WHERE event_name='Season June 2026'")
    conn.execute("INSERT INTO accounts(player_tag, account_name, is_active) VALUES('#NEW','Newbie',1)")
    assert qv(conn, "SELECT COUNT(*) FROM account_event_statuses WHERE event_id=?", (eid,)) == 1


@test
def inactive_account_added_does_not_get_status_until_reactivated() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO events(event_type_code,event_name,is_active,auto_create_statuses) VALUES('season_challenge','Season',1,1)")
    eid = qv(conn, "SELECT id FROM events WHERE event_name='Season'")
    conn.execute("INSERT INTO accounts(player_tag, account_name, is_active) VALUES('#SLEEP','Sleeping',0)")
    aid = qv(conn, "SELECT id FROM accounts WHERE player_tag='#SLEEP'")
    assert qv(conn, "SELECT COUNT(*) FROM account_event_statuses WHERE account_id=? AND event_id=?", (aid, eid)) == 0
    conn.execute("UPDATE accounts SET is_active=1 WHERE id=?", (aid,))
    assert qv(conn, "SELECT COUNT(*) FROM account_event_statuses WHERE account_id=? AND event_id=?", (aid, eid)) == 1


@test
def status_updates_and_progress_checks() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO accounts(player_tag, account_name) VALUES('#A','A')")
    conn.execute("INSERT INTO events(event_type_code,event_name,is_active,auto_create_statuses) VALUES('clan_games','CG',1,1)")
    sid = qv(conn, "SELECT id FROM account_event_statuses")
    conn.execute("UPDATE account_event_statuses SET status='in_progress', progress_value=2500, progress_target=4000 WHERE id=?", (sid,))
    conn.execute("UPDATE account_event_statuses SET status='complete', progress_value=4000, progress_target=4000, completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (sid,))
    try:
        conn.execute("UPDATE account_event_statuses SET progress_value=5000, progress_target=4000 WHERE id=?", (sid,))
    except sqlite3.IntegrityError:
        return
    raise AssertionError("progress > target succeeded")


@test
def duplicate_account_event_status_rejected() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO accounts(player_tag, account_name) VALUES('#A','A')")
    conn.execute("INSERT INTO events(event_type_code,event_name,is_active,auto_create_statuses) VALUES('clan_games','CG',1,1)")
    aid = qv(conn, "SELECT id FROM accounts WHERE player_tag='#A'")
    eid = qv(conn, "SELECT id FROM events WHERE event_name='CG'")
    try:
        conn.execute("INSERT INTO account_event_statuses(account_id,event_id) VALUES(?,?)", (aid, eid))
    except sqlite3.IntegrityError:
        return
    raise AssertionError("duplicate status insert succeeded")


@test
def invalid_reference_and_check_constraints_rejected() -> None:
    conn = new_conn()
    for sql, params, label in [
        (
            "INSERT INTO snapshot_timer_candidates(snapshot_id, game_area_code, category, json_path, timer_seconds, label, raw_item_json) VALUES(999,'home','buildings','$.x',10,'x','{}')",
            (),
            "invalid snapshot FK",
        ),
        (
            "INSERT INTO accounts(player_tag, account_name, is_active) VALUES('#BAD','Bad',2)",
            (),
            "invalid is_active",
        ),
    ]:
        try:
            conn.execute(sql, params)
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError(f"{label} accepted")

    sid = insert_snapshot(conn, "A", "#A", raw='{"tag":"#A"}')
    try:
        conn.execute("INSERT INTO snapshot_timer_candidates(snapshot_id, game_area_code, category, json_path, timer_seconds, label, raw_item_json) VALUES(?,'home','buildings','$.x',-1,'x','{}')", (sid,))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("negative timer accepted")

    conn.execute("INSERT INTO events(event_type_code,event_name,is_active,auto_create_statuses) VALUES('clan_games','CG',1,1)")
    aes = qv(conn, "SELECT id FROM account_event_statuses LIMIT 1")
    try:
        conn.execute("UPDATE account_event_statuses SET status='done' WHERE id=?", (aes,))
    except sqlite3.IntegrityError:
        return
    raise AssertionError("invalid status accepted")


@test
def event_name_unique_within_type_case_insensitive() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO events(event_type_code,event_name) VALUES('clan_games','Clan Games June')")
    try:
        conn.execute("INSERT INTO events(event_type_code,event_name) VALUES('clan_games','clan games june')")
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("case-insensitive duplicate event name accepted")
    conn.execute("INSERT INTO events(event_type_code,event_name) VALUES('season_challenge','clan games june')")


@test
def account_name_unique_case_insensitive() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO accounts(player_tag, account_name) VALUES('#A','Heisenberg')")
    try:
        conn.execute("INSERT INTO accounts(player_tag, account_name) VALUES('#B','heisenberg')")
    except sqlite3.IntegrityError:
        return
    raise AssertionError("case-insensitive duplicate account name accepted")


@test
def delete_account_or_event_with_status_history_is_protected() -> None:
    conn = new_conn()
    conn.execute("INSERT INTO accounts(player_tag, account_name) VALUES('#A','A')")
    conn.execute("INSERT INTO events(event_type_code,event_name,is_active,auto_create_statuses) VALUES('clan_games','CG',1,1)")
    aid = qv(conn, "SELECT id FROM accounts WHERE player_tag='#A'")
    eid = qv(conn, "SELECT id FROM events WHERE event_name='CG'")
    for sql, value, label in [
        ("DELETE FROM accounts WHERE id=?", aid, "delete account with status"),
        ("DELETE FROM events WHERE id=?", eid, "delete event with status"),
    ]:
        try:
            conn.execute(sql, (value,))
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError(f"{label} succeeded")


def main() -> int:
    passed = 0
    failed = 0
    print(f"Running {len(TESTS)} use-case tests against {SCHEMA_PATH}")
    for fn in TESTS:
        try:
            fn()
            passed += 1
            print(f"PASS {fn.__name__}")
        except Exception as exc:  # noqa: BLE001 - small standalone test runner
            failed += 1
            print(f"FAIL {fn.__name__} -- {type(exc).__name__}: {exc}")
    print(f"\nResult: {passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
