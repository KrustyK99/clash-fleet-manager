<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$dataDir = __DIR__ . '/data';
$dataFile = $dataDir . '/timers.json';
$viewsFile = $dataDir . '/account_views.json';
$backupDir = $dataDir . '/backups';
$maxBackups = 50;

$defaultAccountViews = [
    [
        'id' => 'all',
        'label' => 'All Accounts',
        'accounts' => null,
        'system' => true
    ],
    [
        'id' => 'view-1',
        'label' => 'View 1',
        'accounts' => ['Heisenberg', 'Jesse Pinkman', 'Dark Lord']
    ],
    [
        'id' => 'view-2',
        'label' => 'View 2',
        'accounts' => ['Felicity', 'Isabella', 'Lady Scarlett']
    ]
];

$defaultSnapshotFreshnessSettings = [
    'freshHours' => 24,
    'agingHours' => 72
];

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

if (!is_dir($backupDir)) {
    mkdir($backupDir, 0755, true);
}

if (!file_exists($dataFile)) {
    file_put_contents($dataFile, json_encode([
        'schemaVersion' => 2,
        'lastUpdated' => null,
        'timers' => [],
        'accountSnapshotMeta' => []
    ], JSON_PRETTY_PRINT));
}

if (!file_exists($viewsFile)) {
    file_put_contents($viewsFile, json_encode([
        'schemaVersion' => 2,
        'lastUpdated' => null,
        'views' => $defaultAccountViews,
        'snapshotFreshnessSettings' => $defaultSnapshotFreshnessSettings
    ], JSON_PRETTY_PRINT));
}

$action = $_GET['action'] ?? 'load';

function respond($payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT);
    exit;
}

function nowIsoUtc(): string {
    // Include microseconds so rapid back-to-back saves still get unique versions.
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');
}

function closeLockedFile($fp): void {
    flock($fp, LOCK_UN);
    fclose($fp);
}

function makeBackupFilename(string $backupDir, string $prefix = 'timers'): string {
    $now = microtime(true);
    $seconds = (int) $now;
    $micros = (int) (($now - $seconds) * 1000000);

    return sprintf(
        '%s/%s-%s-%06d.json',
        $backupDir,
        $prefix,
        gmdate('Ymd-His', $seconds),
        $micros
    );
}

function pruneBackups(string $backupDir, int $maxBackups, string $prefix = 'timers'): void {
    $files = glob($backupDir . '/' . $prefix . '-*.json');
    if ($files === false || count($files) <= $maxBackups) {
        return;
    }

    usort($files, static function (string $a, string $b): int {
        return (filemtime($b) ?: 0) <=> (filemtime($a) ?: 0);
    });

    foreach (array_slice($files, $maxBackups) as $oldFile) {
        if (is_file($oldFile)) {
            unlink($oldFile);
        }
    }
}

function normalizeAccountName($account): ?string {
    if (!is_scalar($account)) {
        return null;
    }

    $name = trim((string) $account);
    return $name === '' ? null : $name;
}

function normalizeAccountViews(array $views): array {
    $normalized = [];
    $seenIds = [];

    $addView = static function (array $raw) use (&$normalized, &$seenIds): void {
        $rawId = isset($raw['id']) && is_scalar($raw['id']) ? trim((string) $raw['id']) : '';
        $isSystem = ($raw['system'] ?? false) === true || $rawId === 'all';
        $id = $isSystem ? 'all' : $rawId;

        if ($id === '') {
            return;
        }

        if (isset($seenIds[$id])) {
            return;
        }

        $label = isset($raw['label']) && is_scalar($raw['label']) ? trim((string) $raw['label']) : '';
        if ($isSystem) {
            $label = 'All Accounts';
        }

        if ($label === '') {
            return;
        }

        $accounts = null;
        if (!$isSystem) {
            $accounts = [];
            if (array_key_exists('accounts', $raw) && $raw['accounts'] === null) {
                $accounts = null;
            } elseif (isset($raw['accounts']) && is_array($raw['accounts'])) {
                $seenAccounts = [];
                foreach ($raw['accounts'] as $account) {
                    $name = normalizeAccountName($account);
                    if ($name === null || isset($seenAccounts[$name])) {
                        continue;
                    }
                    $seenAccounts[$name] = true;
                    $accounts[] = $name;
                }
            }
        }

        $view = [
            'id' => $id,
            'label' => $label,
            'accounts' => $isSystem ? null : $accounts
        ];

        if ($isSystem) {
            $view['system'] = true;
        }

        $seenIds[$id] = true;
        $normalized[] = $view;
    };

    $addView([
        'id' => 'all',
        'label' => 'All Accounts',
        'accounts' => null,
        'system' => true
    ]);

    foreach ($views as $rawView) {
        if (is_array($rawView)) {
            $addView($rawView);
        }
    }

    return $normalized;
}


function normalizeSnapshotFreshnessSettings($settings): array {
    $defaults = $GLOBALS['defaultSnapshotFreshnessSettings'];

    if (!is_array($settings)) {
        return $defaults;
    }

    $freshHours = isset($settings['freshHours']) && is_numeric($settings['freshHours'])
        ? (int) round((float) $settings['freshHours'])
        : $defaults['freshHours'];

    $agingHours = isset($settings['agingHours']) && is_numeric($settings['agingHours'])
        ? (int) round((float) $settings['agingHours'])
        : $defaults['agingHours'];

    $freshHours = max(1, min(720, $freshHours));
    $agingHours = max(2, min(720, $agingHours));

    if ($agingHours <= $freshHours) {
        $agingHours = min(720, $freshHours + 1);
    }

    return [
        'freshHours' => $freshHours,
        'agingHours' => $agingHours
    ];
}

function normalizeIsoDate($value): ?string {
    if (!is_scalar($value)) {
        return null;
    }

    $raw = trim((string) $value);
    if ($raw === '') {
        return null;
    }

    try {
        $dt = new DateTimeImmutable($raw);
    } catch (Exception $e) {
        return null;
    }

    return $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
}

function normalizeNonNegativeInt($value): int {
    if (!is_numeric($value)) {
        return 0;
    }

    return max(0, (int) round((float) $value));
}

function normalizeOptionalNonNegativeInt($value): ?int {
    if (!is_numeric($value)) {
        return null;
    }

    return max(0, (int) round((float) $value));
}

function normalizeBuilderCapacity($capacity, $fallback = null): ?array {
    $source = is_array($capacity) ? $capacity : (is_array($fallback) ? $fallback : null);

    if (!is_array($source)) {
        return null;
    }

    $homeTotal = normalizeOptionalNonNegativeInt($source['homeTotal'] ?? null);
    $builderBaseTotal = normalizeOptionalNonNegativeInt($source['builderBaseTotal'] ?? null);

    if ($homeTotal === null && $builderBaseTotal === null) {
        return null;
    }

    $normalized = [];
    if ($homeTotal !== null) {
        $normalized['homeTotal'] = $homeTotal;
    }
    if ($builderBaseTotal !== null) {
        $normalized['builderBaseTotal'] = $builderBaseTotal;
    }

    return $normalized;
}

function normalizeAccountSnapshotMeta($meta, $existingMeta = null): array {
    if (!is_array($meta)) {
        return [];
    }

    $existing = is_array($existingMeta) ? $existingMeta : [];
    $normalized = [];

    foreach ($meta as $account => $rawMeta) {
        $name = normalizeAccountName($account);
        if ($name === null || !is_array($rawMeta)) {
            continue;
        }

        $loadedAt = $rawMeta['lastLoadedAt']
            ?? $rawMeta['loadedAt']
            ?? $rawMeta['lastSnapshotLoadedAt']
            ?? $rawMeta['updatedAt']
            ?? null;

        $lastLoadedAt = normalizeIsoDate($loadedAt);
        if ($lastLoadedAt === null) {
            continue;
        }

        $tag = isset($rawMeta['tag']) && is_scalar($rawMeta['tag'])
            ? trim((string) $rawMeta['tag'])
            : '';

        $existingAccountMeta = isset($existing[$name]) && is_array($existing[$name])
            ? $existing[$name]
            : null;

        // Preserve builder capacity for saves from older browser tabs/clients that
        // know about accountSnapshotMeta but do not send the newer builderCapacity
        // child object yet.
        $builderCapacity = array_key_exists('builderCapacity', $rawMeta)
            ? normalizeBuilderCapacity($rawMeta['builderCapacity'], null)
            : normalizeBuilderCapacity(null, $existingAccountMeta['builderCapacity'] ?? null);

        $entry = [
            'lastLoadedAt' => $lastLoadedAt,
            'tag' => $tag,
            'candidateCount' => normalizeNonNegativeInt($rawMeta['candidateCount'] ?? 0),
            'selectedCount' => normalizeNonNegativeInt($rawMeta['selectedCount'] ?? 0)
        ];

        if ($builderCapacity !== null) {
            $entry['builderCapacity'] = $builderCapacity;
        }

        $normalized[$name] = $entry;
    }

    return $normalized;
}

if ($action === 'load') {
    $raw = file_get_contents($GLOBALS['dataFile']);
    $data = json_decode($raw, true);

    if (!is_array($data)) {
        respond(['error' => 'Invalid data file'], 500);
    }

    if (!isset($data['accountSnapshotMeta']) || !is_array($data['accountSnapshotMeta'])) {
        $data['accountSnapshotMeta'] = [];
    }

    respond($data);
}

if ($action === 'loadViews') {
    $raw = file_get_contents($GLOBALS['viewsFile']);
    $data = json_decode($raw, true);

    if (!is_array($data)) {
        respond(['error' => 'Invalid views file'], 500);
    }

    $views = isset($data['views']) && is_array($data['views'])
        ? normalizeAccountViews($data['views'])
        : normalizeAccountViews($GLOBALS['defaultAccountViews']);

    $snapshotFreshnessSettings = normalizeSnapshotFreshnessSettings(
        $data['snapshotFreshnessSettings'] ?? ($data['settings']['snapshotFreshnessSettings'] ?? null)
    );

    respond([
        'schemaVersion' => 2,
        'lastUpdated' => $data['lastUpdated'] ?? null,
        'views' => $views,
        'snapshotFreshnessSettings' => $snapshotFreshnessSettings
    ]);
}

if ($action === 'saveViews') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(['error' => 'Save views requires POST'], 405);
    }

    $rawInput = file_get_contents('php://input');
    $incoming = json_decode($rawInput, true);

    if (!is_array($incoming)) {
        respond(['error' => 'Invalid JSON payload'], 400);
    }

    if (!isset($incoming['views']) || !is_array($incoming['views'])) {
        respond(['error' => 'Payload must include views array'], 400);
    }

    $incomingViews = normalizeAccountViews($incoming['views']);

    $fp = fopen($GLOBALS['viewsFile'], 'c+');

    if (!$fp) {
        respond(['error' => 'Could not open views file'], 500);
    }

    flock($fp, LOCK_EX);

    rewind($fp);
    $currentRaw = stream_get_contents($fp);
    $currentLastUpdated = null;
    $currentData = [];

    if (is_string($currentRaw) && trim($currentRaw) !== '') {
        $currentData = json_decode($currentRaw, true);

        if (!is_array($currentData)) {
            closeLockedFile($fp);
            respond(['error' => 'Invalid current views file. Save cancelled.'], 500);
        }

        $currentLastUpdated = $currentData['lastUpdated'] ?? null;
    }

    $incomingLastKnown = $incoming['lastKnownLastUpdated'] ?? null;

    // Stale-data guard: reject view saves from old browser tabs/devices instead of
    // allowing older shared configuration to overwrite newer view edits.
    if ($currentLastUpdated !== null && $currentLastUpdated !== '' && $incomingLastKnown !== $currentLastUpdated) {
        closeLockedFile($fp);
        respond([
            'error' => 'Saved Views changed on another device. Reload before saving.',
            'code' => 'STALE_VIEWS',
            'currentLastUpdated' => $currentLastUpdated,
            'lastKnownLastUpdated' => $incomingLastKnown
        ], 409);
    }

    // Preserve snapshot freshness settings when older clients save only views.
    $snapshotFreshnessSettings = array_key_exists('snapshotFreshnessSettings', $incoming)
        ? normalizeSnapshotFreshnessSettings($incoming['snapshotFreshnessSettings'])
        : normalizeSnapshotFreshnessSettings(
            $currentData['snapshotFreshnessSettings'] ?? ($currentData['settings']['snapshotFreshnessSettings'] ?? null)
        );

    $payload = [
        'schemaVersion' => 2,
        'lastUpdated' => nowIsoUtc(),
        'views' => $incomingViews,
        'snapshotFreshnessSettings' => $snapshotFreshnessSettings
    ];

    $backupFile = null;

    if (is_string($currentRaw) && trim($currentRaw) !== '') {
        $backupFile = makeBackupFilename($GLOBALS['backupDir'], 'account-views');
        if (file_put_contents($backupFile, $currentRaw, LOCK_EX) === false) {
            closeLockedFile($fp);
            respond(['error' => 'Could not create views backup. Save cancelled.'], 500);
        }
    }

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($payload, JSON_PRETTY_PRINT));
    fflush($fp);
    closeLockedFile($fp);

    pruneBackups($GLOBALS['backupDir'], $GLOBALS['maxBackups'], 'account-views');

    respond([
        'ok' => true,
        'lastUpdated' => $payload['lastUpdated'],
        'backupCreated' => $backupFile ? basename($backupFile) : null
    ]);
}

if ($action === 'save') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(['error' => 'Save requires POST'], 405);
    }

    $rawInput = file_get_contents('php://input');
    $incoming = json_decode($rawInput, true);

    if (!is_array($incoming)) {
        respond(['error' => 'Invalid JSON payload'], 400);
    }

    if (!isset($incoming['timers']) || !is_array($incoming['timers'])) {
        respond(['error' => 'Payload must include timers array'], 400);
    }

    $fp = fopen($GLOBALS['dataFile'], 'c+');

    if (!$fp) {
        respond(['error' => 'Could not open data file'], 500);
    }

    flock($fp, LOCK_EX);

    rewind($fp);
    $currentRaw = stream_get_contents($fp);
    $currentLastUpdated = null;
    $currentData = [];

    if (is_string($currentRaw) && trim($currentRaw) !== '') {
        $currentData = json_decode($currentRaw, true);

        if (!is_array($currentData)) {
            closeLockedFile($fp);
            respond(['error' => 'Invalid current data file. Save cancelled.'], 500);
        }

        $currentLastUpdated = $currentData['lastUpdated'] ?? null;
    }

    $incomingLastKnown = $incoming['lastKnownLastUpdated'] ?? null;

    // Stale-data guard: reject saves from old browser tabs/devices instead of
    // allowing an older full timer list to overwrite newer server data.
    if ($currentLastUpdated !== null && $currentLastUpdated !== '' && $incomingLastKnown !== $currentLastUpdated) {
        closeLockedFile($fp);
        respond([
            'error' => 'Timer data changed on another device. Reload before saving.',
            'code' => 'STALE_DATA',
            'currentLastUpdated' => $currentLastUpdated,
            'lastKnownLastUpdated' => $incomingLastKnown
        ], 409);
    }

    // Preserve account snapshot metadata when older clients save only timers.
    $accountSnapshotMeta = array_key_exists('accountSnapshotMeta', $incoming)
        ? normalizeAccountSnapshotMeta(
            $incoming['accountSnapshotMeta'],
            $currentData['accountSnapshotMeta'] ?? ($currentData['snapshotMeta'] ?? null)
        )
        : normalizeAccountSnapshotMeta($currentData['accountSnapshotMeta'] ?? ($currentData['snapshotMeta'] ?? null));

    $payload = [
        'schemaVersion' => 2,
        'lastUpdated' => nowIsoUtc(),
        'timers' => $incoming['timers'],
        'accountSnapshotMeta' => $accountSnapshotMeta
    ];

    $backupFile = null;

    if (is_string($currentRaw) && trim($currentRaw) !== '') {
        $backupFile = makeBackupFilename($GLOBALS['backupDir'], 'timers');
        if (file_put_contents($backupFile, $currentRaw, LOCK_EX) === false) {
            closeLockedFile($fp);
            respond(['error' => 'Could not create timer backup. Save cancelled.'], 500);
        }
    }

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($payload, JSON_PRETTY_PRINT));
    fflush($fp);
    closeLockedFile($fp);

    pruneBackups($GLOBALS['backupDir'], $GLOBALS['maxBackups'], 'timers');

    respond([
        'ok' => true,
        'lastUpdated' => $payload['lastUpdated'],
        'backupCreated' => $backupFile ? basename($backupFile) : null
    ]);
}

respond(['error' => 'Unknown action'], 400);
