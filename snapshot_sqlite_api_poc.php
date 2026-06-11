<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

const MAX_SNAPSHOT_BYTES = 5_000_000;

$dataDir = __DIR__ . '/data';
$dbFile = $dataDir . '/clash_tracking.sqlite';
$schemaFile = __DIR__ . '/schema.sql';
$schemaVersion = 2;
$action = $_GET['action'] ?? 'health';

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

function respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

function nowIsoUtc(): string {
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');
}

function requirePost(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(['error' => 'This action requires POST'], 405);
    }
}

function getJsonInput(): array {
    $rawInput = file_get_contents('php://input');
    if (!is_string($rawInput) || trim($rawInput) === '') {
        respond(['error' => 'Request body must be JSON'], 400);
    }

    $decoded = json_decode($rawInput, true);
    if (!is_array($decoded)) {
        respond(['error' => 'Invalid JSON request body'], 400);
    }

    return $decoded;
}

function deleteDatabaseFiles(): void {
    foreach ([$GLOBALS['dbFile'], $GLOBALS['dbFile'] . '-wal', $GLOBALS['dbFile'] . '-shm'] as $file) {
        if (is_file($file)) {
            unlink($file);
        }
    }
}

function cleanText($value, int $maxLength = 255): string {
    if (!is_scalar($value)) {
        return '';
    }

    $text = trim((string) $value);
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength);
    }

    return substr($text, 0, $maxLength);
}

function db(): PDO {
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    if (!extension_loaded('pdo_sqlite')) {
        respond([
            'error' => 'PDO SQLite is not enabled in this PHP environment.',
            'hint' => 'Enable the pdo_sqlite extension for the PHP version used by the web server.'
        ], 500);
    }

    if (!is_dir($GLOBALS['dataDir'])) {
        mkdir($GLOBALS['dataDir'], 0755, true);
    }

    $dbNeedsBootstrap = !file_exists($GLOBALS['dbFile'])
        || (is_file($GLOBALS['dbFile']) && filesize($GLOBALS['dbFile']) === 0);

    $pdo = new PDO('sqlite:' . $GLOBALS['dbFile']);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // These PRAGMAs are connection/runtime settings. Keep applying them here even
    // though the bootstrap schema also documents the expected SQLite settings.
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');

    if ($dbNeedsBootstrap) {
        initializeDatabaseFromSchemaFile($pdo);
    }

    return $pdo;
}

function initializeDatabaseFromSchemaFile(PDO $pdo): void {
    $schemaFile = $GLOBALS['schemaFile'];

    if (!file_exists($schemaFile)) {
        respond([
            'error' => 'Database does not exist and schema.sql was not found.',
            'expectedPath' => $schemaFile
        ], 500);
    }

    $schemaSql = file_get_contents($schemaFile);
    if (!is_string($schemaSql) || trim($schemaSql) === '') {
        respond([
            'error' => 'schema.sql is empty or unreadable.',
            'expectedPath' => $schemaFile
        ], 500);
    }

    try {
        // Execute the bootstrap schema only for a missing/empty database. Existing
        // databases are not silently rebuilt or migrated by this POC endpoint.
        $pdo->exec($schemaSql);
        $pdo->exec('PRAGMA user_version = ' . (int) $GLOBALS['schemaVersion']);
    } catch (Throwable $e) {
        // If first-time bootstrap fails, remove the half-created DB and
        // any SQLite sidecar files so the next attempt starts cleanly
        // after schema.sql is fixed.
        deleteDatabaseFiles();

        respond([
            'error' => 'Database initialization from schema.sql failed.',
            'schemaFile' => $schemaFile,
            'message' => $e->getMessage()
        ], 500);
    }
}

function isAssocArray(array $value): bool {
    if ($value === []) {
        return false;
    }

    return array_keys($value) !== range(0, count($value) - 1);
}

function scalarIntOrNull($value): ?int {
    if (is_int($value)) {
        return $value;
    }

    if (is_float($value)) {
        return (int) $value;
    }

    if (is_string($value) && is_numeric($value)) {
        return (int) $value;
    }

    return null;
}

function normalizeSnapshotPayload(array $incoming): array {
    $accountName = cleanText($incoming['accountName'] ?? '', 100);
    if ($accountName === '') {
        respond(['error' => 'accountName is required'], 400);
    }

    $source = cleanText($incoming['source'] ?? 'manual', 50);
    if ($source === '') {
        $source = 'manual';
    }

    $notes = cleanText($incoming['notes'] ?? '', 1000);

    if (isset($incoming['snapshotJson']) && is_string($incoming['snapshotJson'])) {
        // Preserve the exact pasted JSON string for storage and hashing.
        // Do not trim: leading/trailing whitespace is part of the captured raw evidence.
        $rawJson = $incoming['snapshotJson'];
    } elseif (isset($incoming['snapshot']) && is_array($incoming['snapshot'])) {
        $rawJson = json_encode($incoming['snapshot'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    } else {
        respond(['error' => 'Payload must include snapshotJson string or snapshot object'], 400);
    }

    if (trim($rawJson) === '') {
        respond(['error' => 'Snapshot JSON is empty'], 400);
    }

    $rawSize = strlen($rawJson);
    if ($rawSize > MAX_SNAPSHOT_BYTES) {
        respond([
            'error' => 'Snapshot JSON is too large for this POC limit',
            'maxBytes' => MAX_SNAPSHOT_BYTES,
            'actualBytes' => $rawSize
        ], 413);
    }

    $decoded = json_decode($rawJson, true);
    if (!is_array($decoded)) {
        respond([
            'error' => 'snapshotJson is not valid JSON',
            'jsonError' => json_last_error_msg()
        ], 400);
    }

    return [$accountName, $source, $notes, $rawJson, $decoded, $rawSize];
}

function extractTimerCandidates($node, string $path = '$', string $category = 'root', string $gameAreaCode = 'unknown'): array {
    if (!is_array($node)) {
        return [];
    }

    $candidates = [];
    $isAssoc = isAssocArray($node);

    if ($isAssoc && isset($node['timer'])) {
        $timerSeconds = scalarIntOrNull($node['timer']);
        if ($timerSeconds !== null && $timerSeconds > 0) {
            $dataId = scalarIntOrNull($node['data'] ?? null);
            $level = scalarIntOrNull($node['lvl'] ?? null);
            $quantity = scalarIntOrNull($node['cnt'] ?? null);
            $labelParts = [];

            if ($category !== 'root') {
                $labelParts[] = $category;
            }
            if ($dataId !== null) {
                $labelParts[] = 'data ' . $dataId;
            }
            if ($level !== null) {
                $labelParts[] = 'lvl ' . $level;
            }

            $candidates[] = [
                'gameAreaCode' => $gameAreaCode,
                'category' => $category,
                'jsonPath' => $path,
                'dataId' => $dataId,
                'level' => $level,
                'timerSeconds' => $timerSeconds,
                'quantity' => $quantity,
                'label' => $labelParts === [] ? 'timer candidate' : implode(' / ', $labelParts),
                'rawItem' => $node
            ];
        }
    }

    foreach ($node as $key => $value) {
        if (!is_array($value)) {
            continue;
        }

        $sectionInfo = snapshotSectionInfo($key, $category, $gameAreaCode);
        $nextCategory = $sectionInfo['category'];
        $nextGameAreaCode = $sectionInfo['gameAreaCode'];

        $pathKey = is_int($key) ? '[' . $key . ']' : '.' . $key;
        $candidates = array_merge(
            $candidates,
            extractTimerCandidates($value, $path . $pathKey, $nextCategory, $nextGameAreaCode)
        );
    }

    return $candidates;
}

function summarizeSnapshot(array $snapshot, array $candidates, int $rawSize): array {
    $playerTag = isset($snapshot['tag']) && is_scalar($snapshot['tag']) ? (string) $snapshot['tag'] : null;
    $snapshotTimestamp = scalarIntOrNull($snapshot['timestamp'] ?? null);
    $timerSeconds = array_map(static fn(array $candidate): int => (int) $candidate['timerSeconds'], $candidates);

    return [
        'playerTag' => $playerTag,
        'snapshotTimestamp' => $snapshotTimestamp,
        'topLevelKeys' => array_keys($snapshot),
        'timerCandidateCount' => count($candidates),
        'timerCandidateCountByArea' => array_count_values(array_map(static fn(array $candidate): string => (string) ($candidate['gameAreaCode'] ?? 'unknown'), $candidates)),
        'longestTimerSeconds' => $timerSeconds === [] ? null : max($timerSeconds),
        'totalTimerSeconds' => array_sum($timerSeconds),
        'rawSizeBytes' => $rawSize
    ];
}

function decodeSummary(?string $summaryJson): array {
    if (!is_string($summaryJson) || trim($summaryJson) === '') {
        return [];
    }

    $decoded = json_decode($summaryJson, true);
    return is_array($decoded) ? $decoded : [];
}

function rowToSnapshotSummary(array $row): array {
    return [
        'id' => (int) $row['id'],
        'accountId' => $row['account_id'] === null ? null : (int) $row['account_id'],
        'accountName' => $row['account_name'],
        'playerTag' => $row['player_tag'],
        'snapshotTimestamp' => $row['snapshot_timestamp'] === null ? null : (int) $row['snapshot_timestamp'],
        'importedAt' => $row['imported_at'],
        'source' => $row['source'],
        'notes' => $row['notes'],
        'rawSha256' => $row['raw_sha256'],
        'rawSizeBytes' => (int) $row['raw_size_bytes'],
        'summary' => decodeSummary($row['parsed_summary_json'])
    ];
}


function findSnapshotBySha(PDO $pdo, string $rawSha256): ?array {
    $stmt = $pdo->prepare('SELECT * FROM snapshots WHERE raw_sha256 = :raw_sha256 LIMIT 1');
    $stmt->execute([':raw_sha256' => $rawSha256]);
    $row = $stmt->fetch();

    return is_array($row) ? $row : null;
}

function respondDuplicateSnapshot(PDO $pdo, string $rawSha256): void {
    $existingRow = findSnapshotBySha($pdo, $rawSha256);

    respond([
        'error' => 'Duplicate snapshot',
        'code' => 'DUPLICATE_SNAPSHOT',
        'userMessage' => 'This exact snapshot has already been saved. I left the database unchanged.',
        'rawSha256' => $rawSha256,
        'existingSnapshot' => $existingRow ? rowToSnapshotSummary($existingRow) : null
    ], 409);
}

function snapshotSectionMap(): array {
    return [
        // Home Village / home-account sections.
        'buildings' => ['gameAreaCode' => 'home', 'category' => 'buildings'],
        'traps' => ['gameAreaCode' => 'home', 'category' => 'traps'],
        'units' => ['gameAreaCode' => 'home', 'category' => 'units'],
        'siege_machines' => ['gameAreaCode' => 'home', 'category' => 'siege_machines'],
        'heroes' => ['gameAreaCode' => 'home', 'category' => 'heroes'],
        'spells' => ['gameAreaCode' => 'home', 'category' => 'spells'],
        'pets' => ['gameAreaCode' => 'home', 'category' => 'pets'],
        'equipment' => ['gameAreaCode' => 'home', 'category' => 'equipment'],
        'hero_equipment' => ['gameAreaCode' => 'home', 'category' => 'equipment'],
        'helpers' => ['gameAreaCode' => 'home', 'category' => 'helpers'],
        'guardians' => ['gameAreaCode' => 'home', 'category' => 'guardians'],

        // Builder Base sections use raw export names ending in 2 in current samples.
        // Normalize category while using game_area_code to preserve the fork.
        'buildings2' => ['gameAreaCode' => 'builder_base', 'category' => 'buildings'],
        'traps2' => ['gameAreaCode' => 'builder_base', 'category' => 'traps'],
        'units2' => ['gameAreaCode' => 'builder_base', 'category' => 'units'],
        'heroes2' => ['gameAreaCode' => 'builder_base', 'category' => 'heroes'],
        'builder_base_buildings' => ['gameAreaCode' => 'builder_base', 'category' => 'buildings'],
        'builder_base_traps' => ['gameAreaCode' => 'builder_base', 'category' => 'traps'],
        'builder_base_units' => ['gameAreaCode' => 'builder_base', 'category' => 'units'],
        'builder_base_heroes' => ['gameAreaCode' => 'builder_base', 'category' => 'heroes'],

        // Future-proof placeholders for common Clan Capital-style names.
        'capital_buildings' => ['gameAreaCode' => 'clan_capital', 'category' => 'buildings'],
        'capital_traps' => ['gameAreaCode' => 'clan_capital', 'category' => 'traps'],
        'capital_units' => ['gameAreaCode' => 'clan_capital', 'category' => 'units'],
        'clan_capital_buildings' => ['gameAreaCode' => 'clan_capital', 'category' => 'buildings'],
        'clan_capital_traps' => ['gameAreaCode' => 'clan_capital', 'category' => 'traps'],
        'clan_capital_units' => ['gameAreaCode' => 'clan_capital', 'category' => 'units'],
    ];
}

function snapshotSectionInfo($key, string $currentCategory, string $currentGameAreaCode): array {
    if (!is_string($key)) {
        return ['category' => $currentCategory, 'gameAreaCode' => $currentGameAreaCode];
    }

    $map = snapshotSectionMap();
    if (!isset($map[$key])) {
        return ['category' => $currentCategory, 'gameAreaCode' => $currentGameAreaCode];
    }

    return $map[$key];
}

try {
    if ($action === 'health') {
        $pdo = db();
        $snapshotCount = (int) $pdo->query('SELECT COUNT(*) FROM snapshots')->fetchColumn();
        $candidateCount = (int) $pdo->query('SELECT COUNT(*) FROM snapshot_timer_candidates')->fetchColumn();
        $databaseVersion = (int) $pdo->query('PRAGMA user_version')->fetchColumn();

        respond([
            'ok' => true,
            'sqliteAvailable' => true,
            'databaseFile' => $GLOBALS['dbFile'],
            'schemaFile' => $GLOBALS['schemaFile'],
            'schemaVersion' => $GLOBALS['schemaVersion'],
            'databaseVersion' => $databaseVersion,
            'snapshotCount' => $snapshotCount,
            'candidateCount' => $candidateCount
        ]);
    }

    if ($action === 'saveSnapshot') {
        requirePost();
        [$accountName, $source, $notes, $rawJson, $snapshot, $rawSize] = normalizeSnapshotPayload(getJsonInput());

        $candidates = extractTimerCandidates($snapshot);
        $summary = summarizeSnapshot($snapshot, $candidates, $rawSize);
        $playerTag = $summary['playerTag'];
        $snapshotTimestamp = $summary['snapshotTimestamp'];
        $importedAt = nowIsoUtc();
        $rawSha256 = hash('sha256', $rawJson);
        $summaryJson = json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

        $pdo = db();

        if (findSnapshotBySha($pdo, $rawSha256) !== null) {
            respondDuplicateSnapshot($pdo, $rawSha256);
        }

        $pdo->beginTransaction();

        $insertSnapshot = $pdo->prepare(<<<'SQL'
INSERT INTO snapshots (
    account_name,
    player_tag,
    snapshot_timestamp,
    imported_at,
    source,
    notes,
    raw_json,
    raw_sha256,
    raw_size_bytes,
    parsed_summary_json
) VALUES (
    :account_name,
    :player_tag,
    :snapshot_timestamp,
    :imported_at,
    :source,
    :notes,
    :raw_json,
    :raw_sha256,
    :raw_size_bytes,
    :parsed_summary_json
)
SQL);

        try {
            $insertSnapshot->execute([
                ':account_name' => $accountName,
                ':player_tag' => $playerTag,
                ':snapshot_timestamp' => $snapshotTimestamp,
                ':imported_at' => $importedAt,
                ':source' => $source,
                ':notes' => $notes,
                ':raw_json' => $rawJson,
                ':raw_sha256' => $rawSha256,
                ':raw_size_bytes' => $rawSize,
                ':parsed_summary_json' => $summaryJson,
            ]);
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), 'snapshots.raw_sha256') !== false) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                respondDuplicateSnapshot($pdo, $rawSha256);
            }

            throw $e;
        }

        $snapshotId = (int) $pdo->lastInsertId();

        $insertCandidate = $pdo->prepare(<<<'SQL'
INSERT INTO snapshot_timer_candidates (
    snapshot_id,
    game_area_code,
    category,
    json_path,
    data_id,
    level,
    timer_seconds,
    quantity,
    label,
    raw_item_json
) VALUES (
    :snapshot_id,
    :game_area_code,
    :category,
    :json_path,
    :data_id,
    :level,
    :timer_seconds,
    :quantity,
    :label,
    :raw_item_json
)
SQL);

        foreach ($candidates as $candidate) {
            $insertCandidate->execute([
                ':snapshot_id' => $snapshotId,
                ':game_area_code' => $candidate['gameAreaCode'],
                ':category' => $candidate['category'],
                ':json_path' => $candidate['jsonPath'],
                ':data_id' => $candidate['dataId'],
                ':level' => $candidate['level'],
                ':timer_seconds' => $candidate['timerSeconds'],
                ':quantity' => $candidate['quantity'],
                ':label' => $candidate['label'],
                ':raw_item_json' => json_encode($candidate['rawItem'], JSON_UNESCAPED_SLASHES),
            ]);
        }

        $pdo->commit();

        respond([
            'ok' => true,
            'snapshotId' => $snapshotId,
            'importedAt' => $importedAt,
            'rawSha256' => $rawSha256,
            'summary' => $summary,
            'candidates' => array_slice($candidates, 0, 200),
            'candidatePreviewLimited' => count($candidates) > 200
        ]);
    }

    if ($action === 'listSnapshots') {
        $limit = isset($_GET['limit']) ? max(1, min(200, (int) $_GET['limit'])) : 50;
        $accountName = cleanText($_GET['accountName'] ?? '', 100);

        $pdo = db();

        if ($accountName !== '') {
            $stmt = $pdo->prepare('SELECT * FROM snapshots WHERE account_name = :account_name ORDER BY imported_at DESC, id DESC LIMIT :limit');
            $stmt->bindValue(':account_name', $accountName, PDO::PARAM_STR);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->execute();
        } else {
            $stmt = $pdo->prepare('SELECT * FROM snapshots ORDER BY imported_at DESC, id DESC LIMIT :limit');
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->execute();
        }

        $snapshots = [];
        foreach ($stmt->fetchAll() as $row) {
            $snapshots[] = rowToSnapshotSummary($row);
        }

        respond([
            'ok' => true,
            'snapshots' => $snapshots
        ]);
    }

    if ($action === 'getSnapshot') {
        $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        if ($id <= 0) {
            respond(['error' => 'Valid id is required'], 400);
        }

        $pdo = db();
        $stmt = $pdo->prepare('SELECT * FROM snapshots WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        if (!$row) {
            respond(['error' => 'Snapshot not found'], 404);
        }

        $candidateStmt = $pdo->prepare('SELECT * FROM snapshot_timer_candidates WHERE snapshot_id = :snapshot_id ORDER BY id ASC');
        $candidateStmt->execute([':snapshot_id' => $id]);

        $candidates = [];
        foreach ($candidateStmt->fetchAll() as $candidateRow) {
            $rawItem = json_decode($candidateRow['raw_item_json'], true);
            $candidates[] = [
                'id' => (int) $candidateRow['id'],
                'gameAreaCode' => $candidateRow['game_area_code'],
                'category' => $candidateRow['category'],
                'jsonPath' => $candidateRow['json_path'],
                'dataId' => $candidateRow['data_id'] === null ? null : (int) $candidateRow['data_id'],
                'level' => $candidateRow['level'] === null ? null : (int) $candidateRow['level'],
                'timerSeconds' => (int) $candidateRow['timer_seconds'],
                'quantity' => $candidateRow['quantity'] === null ? null : (int) $candidateRow['quantity'],
                'label' => $candidateRow['label'],
                'rawItem' => is_array($rawItem) ? $rawItem : null,
            ];
        }

        respond([
            'ok' => true,
            'snapshot' => rowToSnapshotSummary($row),
            'rawJson' => $row['raw_json'],
            'candidates' => $candidates
        ]);
    }

    if ($action === 'deleteSnapshot') {
        requirePost();
        $incoming = getJsonInput();
        $id = isset($incoming['id']) ? (int) $incoming['id'] : 0;
        if ($id <= 0) {
            respond(['error' => 'Valid id is required'], 400);
        }

        $pdo = db();
        $stmt = $pdo->prepare('DELETE FROM snapshots WHERE id = :id');
        $stmt->execute([':id' => $id]);

        respond([
            'ok' => true,
            'deletedId' => $id,
            'deletedRows' => $stmt->rowCount()
        ]);
    }

    respond(['error' => 'Unknown action'], 400);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    respond([
        'error' => 'Server error',
        'message' => $e->getMessage()
    ], 500);
}
