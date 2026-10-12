<?php
declare(strict_types=1);

const CONFIG_PATH = '/etc/chantierproof/config.php';

function send_json(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function database(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    if (!is_file(CONFIG_PATH) || !is_readable(CONFIG_PATH)) {
        throw new RuntimeException('Hostinger application configuration is missing.');
    }

    $config = require CONFIG_PATH;
    if (!is_array($config)) {
        throw new RuntimeException('Hostinger application configuration is invalid.');
    }

    foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $key) {
        if (!isset($config[$key]) || !is_string($config[$key]) || $config[$key] === '') {
            throw new RuntimeException('Hostinger application database configuration is incomplete.');
        }
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_name']
    );

    $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function start_app_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');

    $isHttps = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && $_SERVER['HTTPS'] !== 'off';
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    if (!session_start()) {
        throw new RuntimeException('Unable to start the application session.');
    }
}

function csrf_token(): string
{
    if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf_token'];
}

function require_csrf_token(): void
{
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expected = $_SESSION['csrf_token'] ?? '';

    if (!is_string($provided) || !is_string($expected) || $expected === '' || !hash_equals($expected, $provided)) {
        send_json(403, ['ok' => false, 'error' => 'Session expirée. Rechargez la page et réessayez.']);
    }
}

function read_json_request(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== 0) {
        send_json(415, ['ok' => false, 'error' => 'Content-Type application/json requis.']);
    }

    $body = file_get_contents('php://input');
    if ($body === false || strlen($body) > 8192) {
        send_json(400, ['ok' => false, 'error' => 'Requête invalide.']);
    }

    try {
        $payload = json_decode($body, true, 16, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        send_json(400, ['ok' => false, 'error' => 'Requête JSON invalide.']);
    }

    if (!is_array($payload)) {
        send_json(400, ['ok' => false, 'error' => 'Requête invalide.']);
    }

    return $payload;
}

function current_profile(): ?array
{
    $userId = $_SESSION['user_id'] ?? null;
    if (!is_string($userId) || $userId === '') {
        return null;
    }

    $statement = database()->prepare(
        'SELECT id, email, full_name, role, team_id, team_name, company_id, avatar_url
         FROM profiles
         WHERE id = :id
         LIMIT 1'
    );
    $statement->execute(['id' => $userId]);
    $profile = $statement->fetch();

    if (!is_array($profile)) {
        unset($_SESSION['user_id']);
        return null;
    }

    return $profile;
}

function require_profile(array $roles = []): array
{
    $profile = current_profile();
    if ($profile === null) {
        send_json(401, ['ok' => false, 'error' => 'Connectez-vous pour continuer.']);
    }

    if ($roles !== [] && !in_array($profile['role'], $roles, true)) {
        send_json(403, ['ok' => false, 'error' => 'Vous ne disposez pas des droits nécessaires.']);
    }

    if ($profile['company_id'] !== null) {
        $statement = database()->prepare('SELECT status FROM companies WHERE id = :id LIMIT 1');
        $statement->execute(['id' => $profile['company_id']]);
        $status = $statement->fetchColumn();
        if ($status === 'suspended') {
            $_SESSION = [];
            session_destroy();
            send_json(403, ['ok' => false, 'error' => 'Votre entreprise est suspendue. Contactez le support ChantierProof.']);
        }
    }

    return $profile;
}

function uuid_v4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);

    return sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20)
    );
}

function text_length(string $value): int
{
    $count = preg_match_all('/./us', $value);
    return $count === false ? PHP_INT_MAX : $count;
}

function storage_directory(): string
{
    $config = require CONFIG_PATH;
    $path = is_array($config) ? ($config['storage_path'] ?? '/var/lib/chantierproof/storage') : null;
    if (!is_string($path) || $path === '' || $path[0] !== '/') {
        throw new RuntimeException('Hostinger storage path must be an absolute path.');
    }

    return rtrim($path, '/');
}

function validate_upload(string $field, array $allowedMimes, int $maxBytes): void
{
    if (!isset($_FILES[$field]) || !is_array($_FILES[$field])) {
        send_json(400, ['ok' => false, 'error' => 'Un fichier obligatoire est manquant.']);
    }

    $file = $_FILES[$field];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) {
        send_json(400, ['ok' => false, 'error' => 'Le transfert du fichier a échoué.']);
    }

    $size = $file['size'] ?? 0;
    if (!is_int($size) || $size < 1 || $size > $maxBytes) {
        send_json(413, ['ok' => false, 'error' => 'Le fichier dépasse la taille autorisée.']);
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
    if (!is_string($mime) || !in_array($mime, $allowedMimes, true)) {
        send_json(415, ['ok' => false, 'error' => 'Format de fichier non autorisé.']);
    }

    $image = getimagesize($file['tmp_name']);
    if (
        !is_array($image)
        || !isset($image['mime'])
        || !in_array($image['mime'], $allowedMimes, true)
        || $image['mime'] !== $mime
    ) {
        send_json(415, ['ok' => false, 'error' => 'Le fichier image est invalide.']);
    }
}

function store_upload(string $field, string $relativePath): string
{
    $file = $_FILES[$field] ?? null;
    if (!is_array($file) || !is_string($file['tmp_name'] ?? null)) {
        throw new RuntimeException('Validated upload is no longer available.');
    }

    $root = storage_directory();
    $destination = $root . '/' . $relativePath;
    $directory = dirname($destination);
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException('Unable to create a private storage directory.');
    }

    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        throw new RuntimeException('Unable to store uploaded file.');
    }

    chmod($destination, 0640);
    return $relativePath;
}

function validation_by_id(string $id): ?array
{
    $statement = database()->prepare(
        'SELECT id, client_name, client_phone, intervention_title, intervention_price,
                gps_position, status, photo_before_url, photo_after_url, signature_png_url,
                technician_name, technician_notes, signer_name, signed_at, pdf_url,
                accounting_status, sent_to_accounting_at, validation_link_expires_at,
                company_id
         FROM validations
         WHERE id = :id
         LIMIT 1'
    );
    $statement->execute(['id' => $id]);
    $row = $statement->fetch();

    return is_array($row) ? $row : null;
}
