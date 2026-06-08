PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_tag TEXT NOT NULL UNIQUE,
    account_name TEXT NOT NULL,
    short_name TEXT,
    abbreviated_name TEXT,
    in_game_name TEXT,

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    category TEXT NOT NULL,
    data_id INTEGER NOT NULL,

    object_name TEXT NOT NULL,
    short_name TEXT,
    abbreviated_name TEXT,

    village TEXT NOT NULL DEFAULT 'home',
    object_type TEXT,

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (category, data_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    account_id INTEGER,
    account_name TEXT NOT NULL,
    player_tag TEXT,

    snapshot_timestamp INTEGER,
    imported_at TEXT NOT NULL,

    source TEXT NOT NULL DEFAULT 'manual',
    notes TEXT NOT NULL DEFAULT '',

    raw_json TEXT NOT NULL,
    raw_sha256 TEXT NOT NULL,
    raw_size_bytes INTEGER NOT NULL,

    parsed_summary_json TEXT NOT NULL DEFAULT '{}',

    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS snapshot_timer_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    snapshot_id INTEGER NOT NULL,

    category TEXT NOT NULL,
    json_path TEXT NOT NULL,

    data_id INTEGER,
    level INTEGER,
    timer_seconds INTEGER NOT NULL,
    quantity INTEGER,

    label TEXT NOT NULL,
    raw_item_json TEXT NOT NULL,

    FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_accounts_account_name
ON accounts(account_name);

CREATE INDEX IF NOT EXISTS idx_accounts_short_name
ON accounts(short_name);

CREATE INDEX IF NOT EXISTS idx_accounts_abbreviated_name
ON accounts(abbreviated_name);

CREATE INDEX IF NOT EXISTS idx_game_objects_name
ON game_objects(object_name);

CREATE INDEX IF NOT EXISTS idx_game_objects_short_name
ON game_objects(short_name);

CREATE INDEX IF NOT EXISTS idx_game_objects_abbreviated_name
ON game_objects(abbreviated_name);

CREATE INDEX IF NOT EXISTS idx_game_objects_category_data
ON game_objects(category, data_id);

CREATE INDEX IF NOT EXISTS idx_game_objects_category_name
ON game_objects(category, object_name);

CREATE INDEX IF NOT EXISTS idx_snapshots_account_imported
ON snapshots(account_name, imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_player_tag
ON snapshots(player_tag);

CREATE INDEX IF NOT EXISTS idx_snapshots_account_id_imported
ON snapshots(account_id, imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_raw_sha256
ON snapshots(raw_sha256);

CREATE INDEX IF NOT EXISTS idx_candidates_snapshot
ON snapshot_timer_candidates(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_candidates_category_data
ON snapshot_timer_candidates(category, data_id);