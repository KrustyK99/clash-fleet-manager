/* ============================================================
   Clash Snapshot / Timer / Event Tracking Database
   ============================================================

   Purpose:
   This database supports two related but separate workflows:

   1. Snapshot / timer workflow:
      - Store raw Clash account snapshot JSON.
      - Extract active timer candidates from the raw snapshot.
      - Preserve raw evidence even when object mappings are incomplete.

   2. Event tracking workflow:
      - Track game events once.
      - Track each managed account's status for each event.
      - Auto-create account status rows for most events.

   Design principle:
   The accounts table is the shared identity spine. Snapshot data and
   event status data hang off accounts, but do not depend on each other.
   ============================================================ */

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

/* ------------------------------------------------------------
   Timestamp conventions:
   - created_at / updated_at columns store ISO-8601 text via
     strftime('%Y-%m-%dT%H:%M:%fZ', 'now') and are maintained by triggers below.
   - snapshot_timestamp stores epoch SECONDS (INTEGER) as taken
     from the source snapshot JSON, NOT ISO text. Convert with
     datetime(snapshot_timestamp, 'unixepoch') when comparing to
     the text timestamp columns.
   ------------------------------------------------------------ */


/* ============================================================
   accounts
   ============================================================

   One row per Clash account managed by the app.

   This is the shared parent table for both major branches:
   - snapshot imports
   - event completion/status tracking

   player_tag is the stable Clash identifier when available.
   account_name is the friendly name used in the app.
   short_name and abbreviated_name support compact/mobile display.
   is_active lets the app exclude retired/inactive accounts from
   future auto-generated event status rows without deleting history.
   ============================================================ */

CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_tag TEXT NOT NULL UNIQUE,
    account_name TEXT NOT NULL,
    short_name TEXT,
    abbreviated_name TEXT,
    in_game_name TEXT,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);


/* ============================================================
   game_areas
   ============================================================

   Lookup table for major "forks" or areas of the game.

   Examples:
   - Home Village
   - Builder Base
   - Clan Capital

   This avoids burying game-area meaning inside category names and
   gives the app a consistent way to group objects, timers, and events.
   The 'unknown' row allows imports to continue even when the parser
   cannot confidently classify the source area.
   ============================================================ */

CREATE TABLE IF NOT EXISTS game_areas (
    area_code TEXT PRIMARY KEY,

    area_name TEXT NOT NULL,
    short_name TEXT,
    abbreviated_name TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO game_areas (
    area_code,
    area_name,
    short_name,
    abbreviated_name,
    sort_order
) VALUES
    ('unknown', 'Unknown Area', 'Unknown', '?', 0),
    ('home', 'Home Village', 'Home', 'HV', 10),
    ('builder_base', 'Builder Base', 'Builder', 'BB', 20),
    ('clan_capital', 'Clan Capital', 'Capital', 'CC', 30);


/* ============================================================
   snapshots
   ============================================================

   One row per imported raw Clash account snapshot.

   This table preserves the original JSON payload as the source of truth.
   Parsed/extracted data can be regenerated or improved later because the
   raw_json is kept.

   account_id links to the managed account when known.
   account_name and player_tag are also stored directly to preserve the
   import-time metadata and make snapshot records readable on their own.

   raw_sha256 is a fingerprint of the exact raw JSON payload. It can be
   used to identify exact duplicate imports or support integrity checks.

   parsed_summary_json stores lightweight derived summary data for quick
   display, without replacing the raw JSON.
   ============================================================ */

CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    account_id INTEGER,
    account_name TEXT NOT NULL,
    player_tag TEXT,

    snapshot_timestamp INTEGER CHECK (snapshot_timestamp IS NULL OR snapshot_timestamp >= 0),
    imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    source TEXT NOT NULL DEFAULT 'manual',
    notes TEXT NOT NULL DEFAULT '',

    raw_json TEXT NOT NULL,
    raw_sha256 TEXT NOT NULL UNIQUE,
    raw_size_bytes INTEGER NOT NULL CHECK (raw_size_bytes >= 0),

    parsed_summary_json TEXT NOT NULL DEFAULT '{}',

    FOREIGN KEY (account_id) REFERENCES accounts(id)
);


/* ============================================================
   game_objects
   ============================================================

   Reusable lookup / enrichment table for Clash object IDs.

   This table maps internal game object identifiers to human-readable
   names, such as buildings, troops, spells, heroes, pets, traps, etc.

   The lookup key is:
       game_area_code + category + data_id

   This is intentionally not dependent on timer candidates. Game objects
   are reference data discovered from snapshot JSON and improved over time.

   Unknown mappings are allowed and expected. The app should create
   placeholder rows when it sees an unmapped object ID, then continue the
   workflow. Mapping maintenance is optional cleanup, not a blocker.

   mapping_status examples:
   - unknown
   - candidate
   - verified
   - ignored

   mapping_confidence examples:
   - unverified
   - inferred
   - community
   - manual

   first_seen_snapshot_id and last_seen_snapshot_id provide lightweight
   maintenance/audit clues showing where an object mapping first and most
   recently appeared.
   ============================================================ */

CREATE TABLE IF NOT EXISTS game_objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    game_area_code TEXT NOT NULL DEFAULT 'unknown',

    category TEXT NOT NULL,
    data_id INTEGER NOT NULL,

    object_name TEXT NOT NULL,
    short_name TEXT,
    abbreviated_name TEXT,

    object_type TEXT,

    mapping_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (mapping_status IN ('unknown', 'candidate', 'verified', 'ignored')),
    mapping_source TEXT,
    mapping_confidence TEXT NOT NULL DEFAULT 'unverified'
        CHECK (mapping_confidence IN ('unverified', 'inferred', 'community', 'manual')),

    first_seen_snapshot_id INTEGER,
    last_seen_snapshot_id INTEGER,

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    FOREIGN KEY (game_area_code) REFERENCES game_areas(area_code),
    FOREIGN KEY (first_seen_snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL,
    FOREIGN KEY (last_seen_snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL,

    UNIQUE (game_area_code, category, data_id)
);


/* ============================================================
   snapshot_timer_candidates
   ============================================================

   Timer-like records extracted from one raw snapshot.

   These rows are operational facts discovered during parsing:
   "this snapshot contains something with a positive timer value."

   The table intentionally stores raw identifiers and raw item JSON so the
   timer is still useful even when the friendly game object name is unknown.

   game_area_code + category + data_id can be used to join to game_objects
   for display names, but the timer candidate remains valid even without a
   successful object mapping.

   Deleting a snapshot deletes its extracted candidates because candidates
   are derived directly from that snapshot.
   ============================================================ */

CREATE TABLE IF NOT EXISTS snapshot_timer_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    snapshot_id INTEGER NOT NULL,

    game_area_code TEXT NOT NULL DEFAULT 'unknown',

    category TEXT NOT NULL,
    json_path TEXT NOT NULL,

    data_id INTEGER CHECK (data_id IS NULL OR data_id >= 0),
    level INTEGER CHECK (level IS NULL OR level >= 0),
    timer_seconds INTEGER NOT NULL CHECK (timer_seconds >= 0),
    quantity INTEGER CHECK (quantity IS NULL OR quantity >= 0),

    label TEXT NOT NULL,
    raw_item_json TEXT NOT NULL,

    FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE,
    FOREIGN KEY (game_area_code) REFERENCES game_areas(area_code)
);


/* ============================================================
   Snapshot / object indexes
   ============================================================

   These indexes support common lookup and display paths:
   - case-insensitive account name uniqueness/filtering
   - compact-name lookup
   - object lookup by area/category/data ID
   - unknown mapping maintenance
   - snapshot browsing by account/import time
   - candidate lookup by snapshot
   ============================================================ */

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_account_name_unique
ON accounts(account_name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_accounts_short_name
ON accounts(short_name);

CREATE INDEX IF NOT EXISTS idx_accounts_abbreviated_name
ON accounts(abbreviated_name);

CREATE INDEX IF NOT EXISTS idx_accounts_active
ON accounts(is_active, account_name);

CREATE INDEX IF NOT EXISTS idx_game_areas_sort_order
ON game_areas(sort_order);

CREATE INDEX IF NOT EXISTS idx_game_objects_name
ON game_objects(object_name);

CREATE INDEX IF NOT EXISTS idx_game_objects_short_name
ON game_objects(short_name);

CREATE INDEX IF NOT EXISTS idx_game_objects_abbreviated_name
ON game_objects(abbreviated_name);

CREATE INDEX IF NOT EXISTS idx_game_objects_area_category_data
ON game_objects(game_area_code, category, data_id);

CREATE INDEX IF NOT EXISTS idx_game_objects_area_category_name
ON game_objects(game_area_code, category, object_name);

CREATE INDEX IF NOT EXISTS idx_game_objects_mapping_status
ON game_objects(mapping_status);

CREATE INDEX IF NOT EXISTS idx_game_objects_mapping_confidence
ON game_objects(mapping_confidence);

CREATE INDEX IF NOT EXISTS idx_snapshots_account_imported
ON snapshots(account_name, imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_player_tag
ON snapshots(player_tag);

CREATE INDEX IF NOT EXISTS idx_snapshots_account_id_imported
ON snapshots(account_id, imported_at DESC);

/* idx_snapshots_raw_sha256 removed: the UNIQUE constraint on
   snapshots.raw_sha256 creates its own index, making a separate
   index redundant. */

CREATE INDEX IF NOT EXISTS idx_candidates_snapshot
ON snapshot_timer_candidates(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_candidates_area_category_data
ON snapshot_timer_candidates(game_area_code, category, data_id);


/* ============================================================
   Triggers: snapshot import -> account spine link
   ============================================================

   When a snapshot with a player_tag is imported, keep accounts as the
   shared identity spine without making the importer do extra work.

   SQLite cannot directly assign NEW.account_id inside a BEFORE INSERT
   trigger, so this is split into two steps:
   - BEFORE INSERT: make sure an account row exists for the snapshot tag.
   - AFTER INSERT: back-fill snapshots.account_id to the matching account.

   If a placeholder account already exists with the same account_name but
   a fake/temporary player_tag, the BEFORE trigger replaces that tag with
   the real snapshot tag. This supports manual account setup before the
   real Clash tag is known.
   ============================================================ */

CREATE TRIGGER IF NOT EXISTS trg_snapshots_ensure_account
BEFORE INSERT ON snapshots
WHEN NEW.player_tag IS NOT NULL AND trim(NEW.player_tag) <> ''
BEGIN
    UPDATE accounts
    SET
        player_tag = NEW.player_tag,
        in_game_name = COALESCE(NULLIF(in_game_name, ''), NEW.account_name),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE account_name COLLATE NOCASE = NEW.account_name
      AND NOT EXISTS (
          SELECT 1
          FROM accounts existing
          WHERE existing.player_tag = NEW.player_tag
      );

    INSERT INTO accounts (
        player_tag,
        account_name,
        in_game_name,
        notes,
        created_at,
        updated_at
    )
    SELECT
        NEW.player_tag,
        NEW.account_name,
        NEW.account_name,
        'Auto-created from snapshot import.',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE NOT EXISTS (
          SELECT 1
          FROM accounts existing
          WHERE existing.player_tag = NEW.player_tag
      )
      AND NOT EXISTS (
          SELECT 1
          FROM accounts existing
          WHERE existing.account_name COLLATE NOCASE = NEW.account_name
      );
END;

CREATE TRIGGER IF NOT EXISTS trg_snapshots_link_account
AFTER INSERT ON snapshots
WHEN NEW.account_id IS NULL
  AND NEW.player_tag IS NOT NULL
  AND trim(NEW.player_tag) <> ''
BEGIN
    UPDATE snapshots
    SET account_id = (
        SELECT a.id
        FROM accounts a
        WHERE a.player_tag = NEW.player_tag
    )
    WHERE id = NEW.id
      AND EXISTS (
          SELECT 1
          FROM accounts a
          WHERE a.player_tag = NEW.player_tag
      );
END;


/* ============================================================
   event_types
   ============================================================

   Lookup table for reusable categories of events.

   Examples:
   - Clan Games
   - Season Challenge
   - Raid Weekend
   - Clan War League

   An event type describes what kind of event something is. The events
   table stores the actual specific instance, such as "Clan Games - June
   2026". This keeps event categorization consistent and avoids free-text
   drift.
   ============================================================ */

CREATE TABLE IF NOT EXISTS event_types (
    event_type_code TEXT PRIMARY KEY,

    event_type_name TEXT NOT NULL,
    short_name TEXT,
    abbreviated_name TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO event_types (
    event_type_code,
    event_type_name,
    short_name,
    abbreviated_name,
    sort_order
) VALUES
    ('unknown', 'Unknown Event Type', 'Unknown', '?', 0),
    ('clan_games', 'Clan Games', 'Clan Games', 'CG', 10),
    ('season_challenge', 'Season Challenge', 'Season', 'SC', 20),
    ('event_track', 'Event Track', 'Event Track', 'ET', 30),
    ('raid_weekend', 'Raid Weekend', 'Raid', 'RW', 40),
    ('clan_war_league', 'Clan War League', 'CWL', 'CWL', 50),
    ('temporary_event', 'Temporary Event', 'Temp Event', 'EVT', 60);


/* ============================================================
   events
   ============================================================

   One row per specific game event to be tracked.

   Examples:
   - Clan Games - June 2026
   - Season Challenge - June 2026
   - Raid Weekend - 2026-06-12

   This table defines the event itself. It does not store which accounts
   have completed the event; that belongs in account_event_statuses.

   auto_create_statuses controls whether creating the event should
   automatically create one status row for each active account. This should
   be enabled for most checklist-style events and disabled for special cases
   where account rows should be created manually.
   ============================================================ */

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    event_type_code TEXT NOT NULL DEFAULT 'unknown',
    game_area_code TEXT,

    event_name TEXT NOT NULL,
    short_name TEXT,
    abbreviated_name TEXT,

    starts_at TEXT,
    ends_at TEXT,

    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    auto_create_statuses INTEGER NOT NULL DEFAULT 1 CHECK (auto_create_statuses IN (0, 1)),

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    FOREIGN KEY (event_type_code) REFERENCES event_types(event_type_code),
    FOREIGN KEY (game_area_code) REFERENCES game_areas(area_code)
);


/* ============================================================
   account_event_statuses
   ============================================================

   Per-account status for a specific event.

   This table resolves the many-to-many relationship between accounts and
   events:
       one account can have many event statuses
       one event can have many account statuses

   The main operational question answered by this table is:
       "For this event, which of my accounts still need attention?"

   status examples:
   - not_started
   - in_progress
   - complete
   - skipped
   - not_applicable

   progress_value and progress_target are optional numeric fields for
   events with measurable progress, such as Clan Games points.

   Foreign keys intentionally do not use ON DELETE CASCADE. Account/event
   history should be protected; retire accounts/events with is_active = 0
   instead of deleting rows that already have status history.
   ============================================================ */

CREATE TABLE IF NOT EXISTS account_event_statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    account_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'complete', 'skipped', 'not_applicable')),

    progress_value INTEGER CHECK (progress_value IS NULL OR progress_value >= 0),
    progress_target INTEGER CHECK (progress_target IS NULL OR progress_target >= 0),

    completed_at TEXT,
    skipped_at TEXT,

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    /* When both are set, progress cannot exceed the target. Either being
       NULL skips the check (events without a measurable target). */
    CHECK (
        progress_value IS NULL
        OR progress_target IS NULL
        OR progress_value <= progress_target
    ),

    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (event_id) REFERENCES events(id),

    UNIQUE (account_id, event_id)
);


/* ============================================================
   Event indexes
   ============================================================

   These indexes support:
   - listing active event types in a stable order
   - filtering active events
   - preventing duplicate real-world event names within an event type
   - joining statuses by account or event
   - finding incomplete/complete rows for dashboard summaries
   ============================================================ */

CREATE INDEX IF NOT EXISTS idx_event_types_sort_order
ON event_types(sort_order);

CREATE INDEX IF NOT EXISTS idx_event_types_active
ON event_types(is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_events_event_type
ON events(event_type_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_type_name_unique
ON events(event_type_code, event_name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_events_game_area
ON events(game_area_code);

CREATE INDEX IF NOT EXISTS idx_events_active
ON events(is_active, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_events_auto_create_statuses
ON events(auto_create_statuses);

CREATE INDEX IF NOT EXISTS idx_account_event_statuses_account
ON account_event_statuses(account_id);

CREATE INDEX IF NOT EXISTS idx_account_event_statuses_event
ON account_event_statuses(event_id);

CREATE INDEX IF NOT EXISTS idx_account_event_statuses_status
ON account_event_statuses(status);

CREATE INDEX IF NOT EXISTS idx_account_event_statuses_account_status
ON account_event_statuses(account_id, status);

CREATE INDEX IF NOT EXISTS idx_account_event_statuses_event_status
ON account_event_statuses(event_id, status);


/* ============================================================
   Trigger: new event -> status rows for active accounts
   ============================================================

   When a new active event is created and auto_create_statuses = 1,
   automatically create one not_started status row for each active account.

   This supports the 18-account workflow by making event creation behave
   like checklist creation.
   ============================================================ */

CREATE TRIGGER IF NOT EXISTS trg_events_create_account_statuses
AFTER INSERT ON events
WHEN NEW.auto_create_statuses = 1 AND NEW.is_active = 1
BEGIN
    INSERT OR IGNORE INTO account_event_statuses (
        account_id,
        event_id,
        status,
        created_at,
        updated_at
    )
    SELECT
        a.id,
        NEW.id,
        'not_started',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM accounts a
    WHERE a.is_active = 1;
END;


/* ============================================================
   Trigger: new active account -> rows for active auto events
   ============================================================

   When a new active account is created, automatically create missing
   not_started rows for existing active events that use auto-created
   statuses.
   ============================================================ */

CREATE TRIGGER IF NOT EXISTS trg_accounts_create_active_event_statuses
AFTER INSERT ON accounts
WHEN NEW.is_active = 1
BEGIN
    INSERT OR IGNORE INTO account_event_statuses (
        account_id,
        event_id,
        status,
        created_at,
        updated_at
    )
    SELECT
        NEW.id,
        e.id,
        'not_started',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM events e
    WHERE e.is_active = 1
      AND e.auto_create_statuses = 1;
END;


/* ============================================================
   Trigger: reactivated account -> catch up event rows
   ============================================================

   When an inactive account is reactivated, automatically create any
   missing not_started rows for active auto-tracked events.

   This avoids manual repair work when an account comes back into rotation.
   ============================================================ */

CREATE TRIGGER IF NOT EXISTS trg_accounts_reactivated_create_event_statuses
AFTER UPDATE OF is_active ON accounts
WHEN OLD.is_active <> 1 AND NEW.is_active = 1
BEGIN
    INSERT OR IGNORE INTO account_event_statuses (
        account_id,
        event_id,
        status,
        created_at,
        updated_at
    )
    SELECT
        NEW.id,
        e.id,
        'not_started',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM events e
    WHERE e.is_active = 1
      AND e.auto_create_statuses = 1;
END;


/* ============================================================
   Trigger: event switched to auto-create -> fill missing rows
   ============================================================

   If an active event was originally created as manual and is later changed
   to auto_create_statuses = 1, create missing not_started rows for active
   accounts.

   INSERT OR IGNORE prevents duplicate rows because account_event_statuses
   has a UNIQUE constraint on account_id + event_id.
   ============================================================ */

CREATE TRIGGER IF NOT EXISTS trg_events_auto_create_enabled
AFTER UPDATE OF auto_create_statuses ON events
WHEN OLD.auto_create_statuses <> 1
  AND NEW.auto_create_statuses = 1
  AND NEW.is_active = 1
BEGIN
    INSERT OR IGNORE INTO account_event_statuses (
        account_id,
        event_id,
        status,
        created_at,
        updated_at
    )
    SELECT
        a.id,
        NEW.id,
        'not_started',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM accounts a
    WHERE a.is_active = 1;
END;


/* ============================================================
   Trigger: activated event -> fill missing account rows
   ============================================================

   If an event was created inactive and is later activated, create missing
   not_started rows for active accounts when auto_create_statuses = 1.

   This keeps inactive/draft events from creating checklist noise while
   still making activation behave like event launch.
   ============================================================ */

CREATE TRIGGER IF NOT EXISTS trg_events_activated_create_account_statuses
AFTER UPDATE OF is_active ON events
WHEN OLD.is_active <> 1
  AND NEW.is_active = 1
  AND NEW.auto_create_statuses = 1
BEGIN
    INSERT OR IGNORE INTO account_event_statuses (
        account_id,
        event_id,
        status,
        created_at,
        updated_at
    )
    SELECT
        a.id,
        NEW.id,
        'not_started',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM accounts a
    WHERE a.is_active = 1;
END;


/* ============================================================
   Triggers: maintain updated_at on row changes
   ============================================================

   SQLite does not update updated_at automatically. These AFTER
   UPDATE triggers keep it current. Each guards against recursion
   by firing only when updated_at was not already changed in the
   same statement (WHEN OLD.updated_at = NEW.updated_at), so an
   explicit updated_at write is respected and the trigger won't
   loop.

   snapshots is intentionally excluded: it is append-only and
   tracks time via imported_at.
   ============================================================ */

CREATE TRIGGER IF NOT EXISTS trg_accounts_updated_at
AFTER UPDATE ON accounts
WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE accounts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_game_areas_updated_at
AFTER UPDATE ON game_areas
WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE game_areas SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE area_code = NEW.area_code;
END;

CREATE TRIGGER IF NOT EXISTS trg_game_objects_updated_at
AFTER UPDATE ON game_objects
WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE game_objects SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_event_types_updated_at
AFTER UPDATE ON event_types
WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE event_types SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE event_type_code = NEW.event_type_code;
END;

CREATE TRIGGER IF NOT EXISTS trg_events_updated_at
AFTER UPDATE ON events
WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE events SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_account_event_statuses_updated_at
AFTER UPDATE ON account_event_statuses
WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE account_event_statuses SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
