<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$dataDir = __DIR__ . '/data';
$dataFile = $dataDir . '/timers.json';

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
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

    $payload = [
        'schemaVersion' => 1,
        'lastUpdated' => gmdate('c'),
        'timers' => $incoming['timers']
    ];

    $fp = fopen($GLOBALS['dataFile'], 'c+');

    if (!$fp) {
        respond(['error' => 'Could not open data file'], 500);
    }

    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($payload, JSON_PRETTY_PRINT));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    respond([
        'ok' => true,
        'lastUpdated' => $payload['lastUpdated']
    ]);
}

respond(['error' => 'Unknown action'], 400);