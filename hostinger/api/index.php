<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
}

try {
    database()->query('SELECT 1');
    send_json(200, ['ok' => true]);
} catch (Throwable $error) {
    error_log('ChantierProof database health check failed: ' . $error->getMessage());
    send_json(503, ['ok' => false, 'error' => 'Database is unavailable.']);
}
