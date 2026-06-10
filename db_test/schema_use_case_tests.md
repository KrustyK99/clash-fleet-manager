# Clash SQLite Schema Use-Case Tests

This document defines the practical use-case tests used to validate `schema.sql` for the Clash snapshot, timer candidate, game object, and event tracking database.

The companion script is:

```bash
python schema_use_case_tests.py
```

The tests are designed to run against an in-memory SQLite database. They do not touch the real application database, `timers.json`, or any production data files.

---

## Test Goals

The test suite is intended to prove that the schema supports the normal operating workflows of the app, not merely that the DDL executes successfully.

The main goals are:

1. Confirm the schema bootstraps cleanly.
2. Confirm lookup seed data can be loaded.
3. Validate account identity rules around snapshot imports.
4. Validate raw snapshot preservation and duplicate protection.
5. Validate timer candidate extraction storage behavior.
6. Validate game object placeholder creation and enrichment.
7. Validate event/status automation.
8. Validate history protection and referential integrity.
9. Validate important check constraints and uniqueness rules.

---

## Design Assumptions Being Tested

### Accounts are the identity spine

The `accounts` table is the shared parent for snapshot imports and event tracking. Snapshot data and event status data hang off accounts, but they remain separate workflows.

### Player tags are authoritative when known

A real Clash `player_tag` should not be silently replaced by a snapshot import. A placeholder account may have a `NULL` player tag, but once a real tag is stored, automatic imports must not overwrite it.

### Account names are friendly labels, not proof of identity

A matching account name alone is not enough to replace an existing non-empty player tag.

### Raw snapshots are preserved as source evidence

The raw pasted JSON is stored, hashed, and kept as the source of truth. Parsed data can be improved later because the original payload remains available.

### Unknown game object mappings must not block imports

Timer candidates should be stored even when object names are unknown. Unknown objects can be cleaned up later through `game_objects`.

### Event tracking is checklist-oriented

Most active events should automatically create one status row per active account. Special/manual events can opt out.

---

## Running the Tests

From the folder containing `schema.sql`, `seed_game_objects.sql`, and `schema_use_case_tests.py`:

```bash
python schema_use_case_tests.py
```

Expected successful output ends with:

```text
Result: 23 passed, 0 failed
```

---

## Test Catalogue

### 1. `schema_bootstrap`

**Purpose:** Confirm the schema initializes cleanly.

**Given** a new empty in-memory SQLite database  
**When** `schema.sql` is executed  
**Then** all core tables should exist:

- `accounts`
- `game_areas`
- `snapshots`
- `game_objects`
- `snapshot_timer_candidates`
- `event_types`
- `events`
- `account_event_statuses`

**And** default lookup rows should exist for `game_areas` and `event_types`.

**Proves:** The schema can bootstrap from scratch.

---

### 2. `seed_game_objects_loads`

**Purpose:** Confirm known game object mappings can be seeded.

**Given** a clean schema  
**When** `seed_game_objects.sql` is loaded  
**Then** known mappings should be inserted into `game_objects`.

The test specifically checks that Home Village building `1000021` resolves to:

```text
X-Bow
```

**And** the row is marked:

```text
mapping_status = verified
mapping_confidence = manual
```

**Proves:** Seed data is compatible with the schema and provides useful enrichment before imports.

---

### 3. `snapshot_import_creates_account_and_links`

**Purpose:** Confirm a snapshot import can create a new account automatically.

**Given** no existing account for the incoming player tag  
**When** a snapshot is inserted with `account_name = Heisenberg` and `player_tag = #ABC123`  
**Then** an account row should be created  
**And** the snapshot should link to that account through `snapshots.account_id`.

**Proves:** Snapshot imports are friction-free for first-time accounts.

---

### 4. `snapshot_import_existing_account_reuses_it`

**Purpose:** Confirm a snapshot import reuses an existing account.

**Given** an account already exists with `player_tag = #ABC123`  
**When** a new snapshot arrives with the same player tag  
**Then** no duplicate account should be created  
**And** the new snapshot should link to the existing account.

**Proves:** Repeated imports for the same account preserve account identity.

---

### 5. `placeholder_account_name_with_null_tag_gets_real_tag`

**Purpose:** Confirm placeholder account setup remains supported.

**Given** a manually created account with:

```text
account_name = Heisenberg
player_tag = NULL
```

**When** a snapshot is imported for `Heisenberg` with `player_tag = #REALTAG`  
**Then** the existing placeholder account should be updated with the real tag  
**And** the snapshot should link to that same account  
**And** no duplicate account should be created.

**Proves:** Placeholder accounts work without requiring fake temporary tags.

---

### 6. `snapshot_same_account_name_different_existing_tag_is_rejected`

**Purpose:** Prevent accidental player tag corruption.

**Given** an existing account:

```text
account_name = Heisenberg
player_tag = #OLDTAG
```

**When** a snapshot is imported with:

```text
account_name = Heisenberg
player_tag = #NEWTAG
```

**Then** the insert should fail  
**And** the existing account should keep `#OLDTAG`  
**And** no snapshot should be saved.

**Proves:** Account name alone cannot overwrite a real player tag.

---

### 7. `snapshot_same_player_tag_different_account_name_is_rejected`

**Purpose:** Prevent wrong-account snapshot imports.

**Given** an existing account:

```text
account_name = Heisenberg
player_tag = #REALTAG
```

**When** a snapshot is imported with:

```text
account_name = Wrong Account
player_tag = #REALTAG
```

**Then** the insert should fail  
**And** no snapshot should be saved.

**Proves:** A real player tag cannot be silently attached to a different account name.

---

### 8. `exact_duplicate_snapshot_is_rejected`

**Purpose:** Confirm exact duplicate snapshot protection.

**Given** a snapshot has already been inserted  
**When** the exact same raw JSON is inserted again  
**Then** the second insert should fail because `raw_sha256` is unique.

**Proves:** Exact duplicate imports are blocked at the schema level.

---

### 9. `candidate_known_object_does_not_overwrite_seed`

**Purpose:** Confirm timer candidates enrich known objects without damaging verified mappings.

**Given** seed data contains a verified X-Bow mapping  
**When** a timer candidate is inserted for:

```text
game_area_code = home
category = buildings
data_id = 1000021
```

**Then** the existing `game_objects` row should remain:

```text
object_name = X-Bow
mapping_status = verified
mapping_confidence = manual
```

**And** first/last seen snapshot references should be updated.

**Proves:** Timer candidate triggers do not overwrite trusted mapping data.

---

### 10. `candidate_unknown_object_creates_placeholder`

**Purpose:** Confirm unknown object mappings are created automatically.

**Given** no known `game_objects` row exists for a candidate  
**When** a timer candidate is inserted with:

```text
game_area_code = home
category = buildings
data_id = 1000102
```

**Then** a placeholder game object should be created:

```text
object_name = Unknown buildings 1000102
mapping_status = unknown
mapping_source = snapshot_timer_candidate
mapping_confidence = unverified
```

**And** first/last seen snapshot references should be populated.

**Proves:** Unknown mappings do not block snapshot-derived timer capture.

---

### 11. `candidate_null_data_id_allowed_no_placeholder`

**Purpose:** Confirm partially identified timer candidates are allowed.

**Given** a timer candidate has a positive timer but no `data_id`  
**When** the candidate is inserted with `data_id = NULL`  
**Then** the candidate should be saved  
**And** no `game_objects` placeholder should be created.

**Proves:** The database can store useful timer evidence even when object identity is incomplete.

---

### 12. `snapshot_delete_cascades_candidates_and_nulls_seen_refs`

**Purpose:** Confirm deleting a snapshot cleans up derived candidates without destroying mapping history.

**Given** a snapshot has timer candidates  
**And** a game object points to that snapshot as first/last seen  
**When** the snapshot is deleted  
**Then** its `snapshot_timer_candidates` should be deleted automatically  
**And** related `game_objects.first_seen_snapshot_id` and `last_seen_snapshot_id` should be set to `NULL`.

**Proves:** Snapshot-derived rows cascade correctly, while object mapping rows survive.

---

### 13. `create_active_event_autocreates_statuses_for_active_accounts_only`

**Purpose:** Confirm normal active events create checklist rows.

**Given** two active accounts and one inactive account  
**When** an active event is created with `auto_create_statuses = 1`  
**Then** one `account_event_statuses` row should be created for each active account only.

**Proves:** Event checklist creation respects `accounts.is_active`.

---

### 14. `draft_event_creates_no_statuses_until_activated`

**Purpose:** Confirm draft events do not create status rows until activated.

**Given** active accounts exist  
**When** an event is created with:

```text
is_active = 0
auto_create_statuses = 1
```

**Then** no account status rows should be created.

**When** the event is later updated to `is_active = 1`  
**Then** missing status rows should be created for active accounts.

**Proves:** Events can be staged as drafts without creating checklist noise.

---

### 15. `manual_event_auto_create_zero_creates_no_statuses_until_enabled`

**Purpose:** Confirm manual/special-case events can opt out of automatic account statuses.

**Given** active accounts exist  
**When** an event is created with:

```text
is_active = 1
auto_create_statuses = 0
```

**Then** no status rows should be created.

**When** `auto_create_statuses` is later changed to `1`  
**Then** missing status rows should be created.

**Proves:** Special events can be manually controlled and later converted to automatic tracking.

---

### 16. `adding_active_account_after_event_gets_status`

**Purpose:** Confirm new active accounts catch up to existing active events.

**Given** an active auto-tracked event already exists  
**When** a new active account is inserted  
**Then** a missing `account_event_statuses` row should be created for that account/event pair.

**Proves:** Adding a new account after event creation keeps checklists complete.

---

### 17. `inactive_account_added_does_not_get_status_until_reactivated`

**Purpose:** Confirm inactive accounts do not create event checklist rows until reactivated.

**Given** an active auto-tracked event exists  
**When** a new inactive account is inserted  
**Then** no event status row should be created.

**When** the account is later updated to `is_active = 1`  
**Then** the missing status row should be created.

**Proves:** Retired or sleeping accounts can be excluded, then safely reintroduced later.

---

### 18. `status_updates_and_progress_checks`

**Purpose:** Confirm event progress updates are constrained.

**Given** an account event status exists  
**When** it is updated to:

```text
status = in_progress
progress_value = 2500
progress_target = 4000
```

**Then** the update should succeed.

**When** it is updated to:

```text
status = complete
progress_value = 4000
progress_target = 4000
```

**Then** the update should succeed.

**When** it is updated to:

```text
progress_value = 5000
progress_target = 4000
```

**Then** the update should fail.

**Proves:** Event progress cannot exceed its target.

---

### 19. `duplicate_account_event_status_rejected`

**Purpose:** Confirm account/event checklist rows are unique.

**Given** an account already has a status row for an event  
**When** another row is inserted for the same `account_id` and `event_id`  
**Then** the insert should fail.

**Proves:** The schema prevents duplicate checklist rows.

---

### 20. `invalid_reference_and_check_constraints_rejected`

**Purpose:** Confirm key foreign key and check constraints are enforced.

**The test verifies that the following invalid operations fail:**

- Inserting a timer candidate for a non-existent snapshot
- Inserting an account with invalid `is_active`
- Inserting a timer candidate with negative `timer_seconds`
- Updating an account event status to an invalid status value such as `done`

**Proves:** The schema rejects invalid references and invalid status/check values.

---

### 21. `event_name_unique_within_type_case_insensitive`

**Purpose:** Confirm event names are unique within event type, ignoring case.

**Given** an event exists:

```text
event_type_code = clan_games
event_name = Clan Games June
```

**When** another event is inserted with:

```text
event_type_code = clan_games
event_name = clan games june
```

**Then** the insert should fail.

**But** the same event name under another event type should be allowed.

**Proves:** Duplicate event names are blocked within the same event type without preventing reuse across different event types.

---

### 22. `account_name_unique_case_insensitive`

**Purpose:** Confirm account names are unique ignoring case.

**Given** an account exists:

```text
account_name = Heisenberg
```

**When** another account is inserted as:

```text
account_name = heisenberg
```

**Then** the insert should fail.

**Proves:** The account list cannot contain visually duplicate names that differ only by case.

---

### 23. `delete_account_or_event_with_status_history_is_protected`

**Purpose:** Confirm event history is protected from accidental parent deletion.

**Given** an account has event status history  
**When** the account is deleted  
**Then** the delete should fail.

**Given** an event has account status history  
**When** the event is deleted  
**Then** the delete should fail.

**Proves:** History is preserved. Accounts and events should be retired or marked inactive rather than deleted after they have status history.

---

## Coverage Summary

| Area | Covered By |
|---|---|
| Schema bootstrap | Tests 1 |
| Seed data compatibility | Test 2 |
| Snapshot/account linking | Tests 3-7 |
| Duplicate snapshot protection | Test 8 |
| Timer candidate storage | Tests 9-12 |
| Game object mapping behavior | Tests 9-12 |
| Event auto-status creation | Tests 13-17 |
| Event progress/status rules | Tests 18-20 |
| Uniqueness constraints | Tests 19, 21, 22 |
| Referential integrity/history protection | Tests 12, 20, 23 |

---

## Regression Use

Run these tests after any change to:

- `accounts`
- `snapshots`
- `snapshot_timer_candidates`
- `game_objects`
- `events`
- `account_event_statuses`
- snapshot/account triggers
- event/status triggers
- uniqueness or check constraints
- seed data assumptions

A failure should be treated as either:

1. A real regression in schema behavior, or
2. An intentional design change that requires updating this document and the test suite together.

---

## Current Expected Result

At the time this document was created, the suite contains 23 tests and the expected result is:

```text
Result: 23 passed, 0 failed
```
