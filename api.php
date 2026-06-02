<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$dataDir = __DIR__ . '/data';
$dataFile = $dataDir . '/timers.json';
$backupDir = $dataDir . '/backups';
$maxBackups = 50;

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

if (!is_dir($backupDir)) {
    mkdir($backupDir, 0755, true);
}

if (!file_exists($dataFile)) {
    file_put_contents($dataFile, json_encode([
        'schemaVersion' => 1,
        'lastUpdated' => null,
        'timers' => []
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

function makeBackupFilename(string $backupDir): string {
    $now = microtime(true);
    $seconds = (int) $now;
    $micros = (int) (($now - $seconds) * 1000000);

    return sprintf(
        '%s/timers-%s-%06d.json',
        $backupDir,
        gmdate('Ymd-His', $seconds),
        $micros
    );
}

function pruneBackups(string $backupDir, int $maxBackups): void {
    $files = glob($backupDir . '/timers-*.json');
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

if ($action === 'load') {
    $raw = file_get_contents($GLOBALS['dataFile']);
    $data = json_decode($raw, true);

    if (!is_array($data)) {
        respond(['error' => 'Invalid data file'], 500);
    }

    respond($data);
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

    $payload = [
        'schemaVersion' => 1,
        'lastUpdated' => nowIsoUtc(),
        'timers' => $incoming['timers']
    ];

    $backupFile = null;

    if (is_string($currentRaw) && trim($currentRaw) !== '') {
        $backupFile = makeBackupFilename($GLOBALS['backupDir']);
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

    pruneBackups($GLOBALS['backupDir'], $GLOBALS['maxBackups']);

    respond([
        'ok' => true,
        'lastUpdated' => $payload['lastUpdated'],
        'backupCreated' => $backupFile ? basename($backupFile) : null
    ]);
}

respond(['error' => 'Unknown action'], 400);
