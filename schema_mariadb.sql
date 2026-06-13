/* ============================================================
   Clash Snapshot / Timer / Event Tracking Database
   MariaDB version
   ============================================================

   Converted from the SQLite schema.

   Key conversion notes:
   - SQLite PRAGMA statements were removed.
   - INTEGER PRIMARY KEY AUTOINCREMENT became BIGINT UNSIGNED AUTO_INCREMENT.
   - SQLite TEXT affinity was converted to MariaDB VARCHAR/TEXT/LONGTEXT.
   - Boolean flags are stored as TINYINT(1) with CHECK constraints.
   - Timestamp columns use DATETIME(3) with CURRENT_TIMESTAMP(3).
   - SQLite INSERT OR IGNORE became INSERT IGNORE.
   - SQLite ON CONFLICT became ON DUPLICATE KEY UPDATE.
   - SQLite RAISE(ABORT, ...) became SIGNAL SQLSTATE '45000'.
   - SQLite AFTER INSERT snapshot back-fill was replaced with a MariaDB
     BEFORE INSERT trigger that can assign NEW.account_id directly.

   Recommended database defaults:
       CHARACTER SET utf8mb4
       COLLATE utf8mb4_unicode_ci

   The utf8mb4_unicode_ci collation keeps account/event name uniqueness
   case-insensitive, matching the original SQLite COLLATE NOCASE indexes.
   ============================================================ */

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

/* Optional database creation:
CREATE DATABASE IF NOT EXISTS clash_tracker
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE clash_tracker;
*/

/* ============================================================
   accounts
   ============================================================ */

CREATE TABLE IF NOT EXISTS accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    player_tag VARCHAR(64) NULL,
    account_name VARCHAR(255) NOT NULL,
    short_name VARCHAR(255) NULL,
    abbreviated_name VARCHAR(64) NULL,
    in_game_name VARCHAR(255) NULL,

    is_active TINYINT(1) NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    notes VARCHAR(2000) NOT NULL DEFAULT '',

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uk_accounts_player_tag (player_tag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ============================================================
   game_areas
   ============================================================ */

CREATE TABLE IF NOT EXISTS game_areas (
    area_code VARCHAR(64) NOT NULL,

    area_name VARCHAR(255) NOT NULL,
    short_name VARCHAR(255) NULL,
    abbreviated_name VARCHAR(64) NULL,

    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    notes VARCHAR(2000) NOT NULL DEFAULT '',

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (area_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO game_areas (
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
   ============================================================ */

CREATE TABLE IF NOT EXISTS snapshots (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    account_id BIGINT UNSIGNED NULL,
    account_name VARCHAR(255) NOT NULL,
    player_tag VARCHAR(64) NULL,

    snapshot_timestamp BIGINT UNSIGNED NULL CHECK (snapshot_timestamp IS NULL OR snapshot_timestamp >= 0),
    imported_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    source VARCHAR(64) NOT NULL DEFAULT 'manual',
    notes VARCHAR(2000) NOT NULL DEFAULT '',

    raw_json LONGTEXT NOT NULL CHECK (JSON_VALID(raw_json)),
    raw_sha256 CHAR(64) NOT NULL,
    raw_size_bytes BIGINT UNSIGNED NOT NULL CHECK (raw_size_bytes >= 0),

    parsed_summary_json LONGTEXT NOT NULL DEFAULT '{}' CHECK (JSON_VALID(parsed_summary_json)),

    PRIMARY KEY (id),
    UNIQUE KEY uk_snapshots_raw_sha256 (raw_sha256),
    CONSTRAINT fk_snapshots_account
        FOREIGN KEY (account_id) REFERENCES accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ============================================================
   game_objects
   ============================================================ */

CREATE TABLE IF NOT EXISTS game_objects (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    game_area_code VARCHAR(64) NOT NULL DEFAULT 'unknown',

    category VARCHAR(128) NOT NULL,
    data_id INT UNSIGNED NOT NULL,

    object_name VARCHAR(255) NOT NULL,
    short_name VARCHAR(255) NULL,
    abbreviated_name VARCHAR(64) NULL,

    object_type VARCHAR(128) NULL,

    mapping_status VARCHAR(32) NOT NULL DEFAULT 'unknown'
        CHECK (mapping_status IN ('unknown', 'candidate', 'verified', 'ignored')),
    mapping_source VARCHAR(255) NULL,
    mapping_confidence VARCHAR(32) NOT NULL DEFAULT 'unverified'
        CHECK (mapping_confidence IN ('unverified', 'inferred', 'community', 'manual')),

    first_seen_snapshot_id BIGINT UNSIGNED NULL,
    last_seen_snapshot_id BIGINT UNSIGNED NULL,

    notes VARCHAR(2000) NOT NULL DEFAULT '',

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uk_game_objects_identity (game_area_code, category, data_id),
    CONSTRAINT fk_game_objects_game_area
        FOREIGN KEY (game_area_code) REFERENCES game_areas(area_code),
    CONSTRAINT fk_game_objects_first_seen_snapshot
        FOREIGN KEY (first_seen_snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL,
    CONSTRAINT fk_game_objects_last_seen_snapshot
        FOREIGN KEY (last_seen_snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ============================================================
   snapshot_timer_candidates
   ============================================================ */

CREATE TABLE IF NOT EXISTS snapshot_timer_candidates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    snapshot_id BIGINT UNSIGNED NOT NULL,

    game_area_code VARCHAR(64) NOT NULL DEFAULT 'unknown',

    category VARCHAR(128) NOT NULL,
    json_path VARCHAR(1024) NOT NULL,

    data_id INT UNSIGNED NULL CHECK (data_id IS NULL OR data_id >= 0),
    level INT UNSIGNED NULL CHECK (level IS NULL OR level >= 0),
    timer_seconds BIGINT UNSIGNED NOT NULL CHECK (timer_seconds >= 0),
    quantity INT UNSIGNED NULL CHECK (quantity IS NULL OR quantity >= 0),

    label VARCHAR(255) NOT NULL,
    raw_item_json LONGTEXT NOT NULL CHECK (JSON_VALID(raw_item_json)),

    PRIMARY KEY (id),
    CONSTRAINT fk_snapshot_timer_candidates_snapshot
        FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE,
    CONSTRAINT fk_snapshot_timer_candidates_game_area
        FOREIGN KEY (game_area_code) REFERENCES game_areas(area_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ============================================================
   Snapshot / object indexes
   ============================================================ */

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_account_name_unique
ON accounts(account_name);

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

/* The UNIQUE key uk_game_objects_identity already covers
   (game_area_code, category, data_id), so no duplicate non-unique
   index is created for that same column list. */

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

/* uk_snapshots_raw_sha256 already covers raw_sha256. */

CREATE INDEX IF NOT EXISTS idx_candidates_snapshot
ON snapshot_timer_candidates(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_candidates_area_category_data
ON snapshot_timer_candidates(game_area_code, category, data_id);

/* ============================================================
   Trigger: timer candidate -> game object placeholder
   ============================================================ */

DROP TRIGGER IF EXISTS trg_snapshot_timer_candidates_upsert_game_object;
DELIMITER $$
CREATE TRIGGER trg_snapshot_timer_candidates_upsert_game_object
AFTER INSERT ON snapshot_timer_candidates
FOR EACH ROW
BEGIN
    IF NEW.data_id IS NOT NULL THEN
        INSERT INTO game_objects (
            game_area_code,
            category,
            data_id,
            object_name,
            object_type,
            mapping_status,
            mapping_source,
            mapping_confidence,
            first_seen_snapshot_id,
            last_seen_snapshot_id,
            notes,
            created_at,
            updated_at
        ) VALUES (
            NEW.game_area_code,
            NEW.category,
            NEW.data_id,
            CONCAT('Unknown ', NEW.category, ' ', NEW.data_id),
            NEW.category,
            'unknown',
            'snapshot_timer_candidate',
            'unverified',
            NEW.snapshot_id,
            NEW.snapshot_id,
            'Auto-created from snapshot timer candidate.',
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
        )
        ON DUPLICATE KEY UPDATE
            first_seen_snapshot_id = COALESCE(first_seen_snapshot_id, VALUES(first_seen_snapshot_id)),
            last_seen_snapshot_id = VALUES(last_seen_snapshot_id),
            updated_at = CURRENT_TIMESTAMP(3);
    END IF;
END$$
DELIMITER ;

/* ============================================================
   Trigger: corrected timer candidate -> game object placeholder
   ============================================================ */

DROP TRIGGER IF EXISTS trg_snapshot_timer_candidates_update_game_object;
DELIMITER $$
CREATE TRIGGER trg_snapshot_timer_candidates_update_game_object
AFTER UPDATE ON snapshot_timer_candidates
FOR EACH ROW
BEGIN
    IF NEW.data_id IS NOT NULL
       AND (
           OLD.snapshot_id <> NEW.snapshot_id
           OR OLD.game_area_code <> NEW.game_area_code
           OR OLD.category <> NEW.category
           OR OLD.data_id IS NULL
           OR OLD.data_id <> NEW.data_id
       ) THEN
        INSERT INTO game_objects (
            game_area_code,
            category,
            data_id,
            object_name,
            object_type,
            mapping_status,
            mapping_source,
            mapping_confidence,
            first_seen_snapshot_id,
            last_seen_snapshot_id,
            notes,
            created_at,
            updated_at
        ) VALUES (
            NEW.game_area_code,
            NEW.category,
            NEW.data_id,
            CONCAT('Unknown ', NEW.category, ' ', NEW.data_id),
            NEW.category,
            'unknown',
            'snapshot_timer_candidate',
            'unverified',
            NEW.snapshot_id,
            NEW.snapshot_id,
            'Auto-created from updated snapshot timer candidate.',
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
        )
        ON DUPLICATE KEY UPDATE
            first_seen_snapshot_id = COALESCE(first_seen_snapshot_id, VALUES(first_seen_snapshot_id)),
            last_seen_snapshot_id = VALUES(last_seen_snapshot_id),
            updated_at = CURRENT_TIMESTAMP(3);
    END IF;
END$$
DELIMITER ;

/* ============================================================
   Trigger: snapshot import -> account spine link
   ============================================================

   MariaDB can assign NEW.account_id inside a BEFORE INSERT trigger,
   so the original SQLite two-trigger approach is collapsed into one
   trigger here.
   ============================================================ */

DROP TRIGGER IF EXISTS trg_snapshots_ensure_account;
DELIMITER $$
CREATE TRIGGER trg_snapshots_ensure_account
BEFORE INSERT ON snapshots
FOR EACH ROW
BEGIN
    DECLARE v_account_id BIGINT UNSIGNED DEFAULT NULL;

    IF NEW.player_tag IS NOT NULL AND TRIM(NEW.player_tag) <> '' THEN
        IF EXISTS (
            SELECT 1
            FROM accounts existing
            WHERE existing.account_name = NEW.account_name
              AND existing.player_tag IS NOT NULL
              AND TRIM(existing.player_tag) <> ''
              AND existing.player_tag <> NEW.player_tag
        ) THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Snapshot account_name already belongs to a different player_tag';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM accounts existing
            WHERE existing.player_tag = NEW.player_tag
              AND existing.account_name <> NEW.account_name
        ) THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Snapshot player_tag already belongs to a different account_name';
        END IF;

        UPDATE accounts
        SET
            player_tag = NEW.player_tag,
            in_game_name = COALESCE(NULLIF(in_game_name, ''), NEW.account_name)
        WHERE account_name = NEW.account_name
          AND (player_tag IS NULL OR TRIM(player_tag) = '');

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
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
        FROM DUAL
        WHERE NOT EXISTS (
              SELECT 1
              FROM accounts existing
              WHERE existing.player_tag = NEW.player_tag
          )
          AND NOT EXISTS (
              SELECT 1
              FROM accounts existing
              WHERE existing.account_name = NEW.account_name
          );

        SELECT a.id
        INTO v_account_id
        FROM accounts a
        WHERE a.player_tag = NEW.player_tag
        LIMIT 1;

        IF NEW.account_id IS NULL AND v_account_id IS NOT NULL THEN
            SET NEW.account_id = v_account_id;
        END IF;
    END IF;
END$$
DELIMITER ;

/* ============================================================
   event_types
   ============================================================ */

CREATE TABLE IF NOT EXISTS event_types (
    event_type_code VARCHAR(64) NOT NULL,

    event_type_name VARCHAR(255) NOT NULL,
    short_name VARCHAR(255) NULL,
    abbreviated_name VARCHAR(64) NULL,

    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

    notes VARCHAR(2000) NOT NULL DEFAULT '',

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (event_type_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO event_types (
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
   ============================================================ */

CREATE TABLE IF NOT EXISTS events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    event_type_code VARCHAR(64) NOT NULL DEFAULT 'unknown',
    game_area_code VARCHAR(64) NULL,

    event_name VARCHAR(255) NOT NULL,
    short_name VARCHAR(255) NULL,
    abbreviated_name VARCHAR(64) NULL,

    starts_at DATETIME(3) NULL,
    ends_at DATETIME(3) NULL,

    is_active TINYINT(1) NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    auto_create_statuses TINYINT(1) NOT NULL DEFAULT 1 CHECK (auto_create_statuses IN (0, 1)),

    notes VARCHAR(2000) NOT NULL DEFAULT '',

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    CONSTRAINT fk_events_event_type
        FOREIGN KEY (event_type_code) REFERENCES event_types(event_type_code),
    CONSTRAINT fk_events_game_area
        FOREIGN KEY (game_area_code) REFERENCES game_areas(area_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ============================================================
   account_event_statuses
   ============================================================ */

CREATE TABLE IF NOT EXISTS account_event_statuses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    account_id BIGINT UNSIGNED NOT NULL,
    event_id BIGINT UNSIGNED NOT NULL,

    status VARCHAR(32) NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'complete', 'skipped', 'not_applicable')),

    progress_value INT UNSIGNED NULL CHECK (progress_value IS NULL OR progress_value >= 0),
    progress_target INT UNSIGNED NULL CHECK (progress_target IS NULL OR progress_target >= 0),

    completed_at DATETIME(3) NULL,
    skipped_at DATETIME(3) NULL,

    notes VARCHAR(2000) NOT NULL DEFAULT '',

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uk_account_event_statuses_account_event (account_id, event_id),

    CHECK (
        progress_value IS NULL
        OR progress_target IS NULL
        OR progress_value <= progress_target
    ),

    CONSTRAINT fk_account_event_statuses_account
        FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT fk_account_event_statuses_event
        FOREIGN KEY (event_id) REFERENCES events(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ============================================================
   Event indexes
   ============================================================ */

CREATE INDEX IF NOT EXISTS idx_event_types_sort_order
ON event_types(sort_order);

CREATE INDEX IF NOT EXISTS idx_event_types_active
ON event_types(is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_events_event_type
ON events(event_type_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_type_name_unique
ON events(event_type_code, event_name);

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
   ============================================================ */

DROP TRIGGER IF EXISTS trg_events_create_account_statuses;
DELIMITER $$
CREATE TRIGGER trg_events_create_account_statuses
AFTER INSERT ON events
FOR EACH ROW
BEGIN
    IF NEW.auto_create_statuses = 1 AND NEW.is_active = 1 THEN
        INSERT IGNORE INTO account_event_statuses (
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
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
        FROM accounts a
        WHERE a.is_active = 1;
    END IF;
END$$
DELIMITER ;

/* ============================================================
   Trigger: new active account -> rows for active auto events
   ============================================================ */

DROP TRIGGER IF EXISTS trg_accounts_create_active_event_statuses;
DELIMITER $$
CREATE TRIGGER trg_accounts_create_active_event_statuses
AFTER INSERT ON accounts
FOR EACH ROW
BEGIN
    IF NEW.is_active = 1 THEN
        INSERT IGNORE INTO account_event_statuses (
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
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
        FROM events e
        WHERE e.is_active = 1
          AND e.auto_create_statuses = 1;
    END IF;
END$$
DELIMITER ;

/* ============================================================
   Trigger: reactivated account -> catch up event rows
   ============================================================ */

DROP TRIGGER IF EXISTS trg_accounts_reactivated_create_event_statuses;
DELIMITER $$
CREATE TRIGGER trg_accounts_reactivated_create_event_statuses
AFTER UPDATE ON accounts
FOR EACH ROW
BEGIN
    IF OLD.is_active <> 1 AND NEW.is_active = 1 THEN
        INSERT IGNORE INTO account_event_statuses (
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
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
        FROM events e
        WHERE e.is_active = 1
          AND e.auto_create_statuses = 1;
    END IF;
END$$
DELIMITER ;

/* ============================================================
   Trigger: event switched to auto-create -> fill missing rows
   ============================================================ */

DROP TRIGGER IF EXISTS trg_events_auto_create_enabled;
DELIMITER $$
CREATE TRIGGER trg_events_auto_create_enabled
AFTER UPDATE ON events
FOR EACH ROW
BEGIN
    IF OLD.auto_create_statuses <> 1
       AND NEW.auto_create_statuses = 1
       AND NEW.is_active = 1 THEN
        INSERT IGNORE INTO account_event_statuses (
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
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
        FROM accounts a
        WHERE a.is_active = 1;
    END IF;
END$$
DELIMITER ;

/* ============================================================
   Trigger: activated event -> fill missing account rows
   ============================================================ */

DROP TRIGGER IF EXISTS trg_events_activated_create_account_statuses;
DELIMITER $$
CREATE TRIGGER trg_events_activated_create_account_statuses
AFTER UPDATE ON events
FOR EACH ROW
BEGIN
    IF OLD.is_active <> 1
       AND NEW.is_active = 1
       AND NEW.auto_create_statuses = 1 THEN
        INSERT IGNORE INTO account_event_statuses (
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
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
        FROM accounts a
        WHERE a.is_active = 1;
    END IF;
END$$
DELIMITER ;
