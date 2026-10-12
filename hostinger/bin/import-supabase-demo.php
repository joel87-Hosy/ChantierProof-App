<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This import command can only run from the command line.\n");
    exit(1);
}

require dirname(__DIR__) . '/api/bootstrap.php';

const DEMO_COMPANY_NAME = 'proof-demo';
const DEFAULT_STAGING_URL = 'https://staging.suitepilot.io';

function import_usage(): never
{
    fwrite(STDERR, "Usage: php import-supabase-demo.php --source=/private/backup [--base-url=https://staging.suitepilot.io] [--dry-run]\n");
    exit(2);
}

function parse_options(array $arguments): array
{
    $options = ['source' => null, 'base-url' => DEFAULT_STAGING_URL, 'dry-run' => false];
    foreach ($arguments as $argument) {
        if ($argument === '--dry-run') {
            $options['dry-run'] = true;
            continue;
        }
        if (!str_starts_with($argument, '--') || !str_contains($argument, '=')) {
            import_usage();
        }
        [$key, $value] = explode('=', substr($argument, 2), 2);
        if (!in_array($key, ['source', 'base-url'], true) || $value === '') {
            import_usage();
        }
        $options[$key] = $value;
    }

    if (!is_string($options['source'])) {
        import_usage();
    }

    $source = realpath($options['source']);
    if ($source === false || !is_dir($source)) {
        throw new InvalidArgumentException('The private backup directory does not exist.');
    }
    $options['source'] = $source;

    $baseUrl = filter_var($options['base-url'], FILTER_VALIDATE_URL);
    $host = is_string($baseUrl) ? strtolower((string) parse_url($baseUrl, PHP_URL_HOST)) : '';
    if (
        !is_string($baseUrl)
        || strtolower((string) parse_url($baseUrl, PHP_URL_SCHEME)) !== 'https'
        || $host === ''
        || in_array($host, ['suitepilot.io', 'www.suitepilot.io'], true)
        || !str_ends_with($host, '.suitepilot.io')
    ) {
        throw new InvalidArgumentException('Use an HTTPS staging hostname under suitepilot.io, never the public domain.');
    }

    return $options;
}

function csv_value(?string $value): ?string
{
    if ($value === null) {
        return null;
    }
    $value = trim($value);
    if ($value === '' || in_array(strtolower($value), ['null', 'none', '\\n'], true)) {
        return null;
    }

    return $value;
}

function read_csv_table(string $directory, string $table, array $requiredHeaders, array $forbiddenHeaders = []): array
{
    $matches = [];
    foreach (new DirectoryIterator($directory) as $file) {
        if (!$file->isFile() || strtolower($file->getExtension()) !== 'csv') {
            continue;
        }
        $handle = fopen($file->getPathname(), 'rb');
        if ($handle === false) {
            throw new RuntimeException('Unable to read a CSV export.');
        }
        $header = fgetcsv($handle, null, ',', '"', '\\');
        fclose($handle);
        if (!is_array($header)) {
            continue;
        }
        $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]) ?? (string) $header[0];
        if (
            array_diff($requiredHeaders, $header) === []
            && array_intersect($forbiddenHeaders, $header) === []
        ) {
            $matches[] = $file->getPathname();
        }
    }

    if (count($matches) !== 1) {
        throw new RuntimeException(
            sprintf('Expected one CSV export for %s, found %d.', $table, count($matches))
        );
    }

    $handle = fopen($matches[0], 'rb');
    if ($handle === false) {
        throw new RuntimeException('Unable to read a CSV export.');
    }
    $header = fgetcsv($handle, null, ',', '"', '\\');
    if (!is_array($header)) {
        fclose($handle);
        throw new RuntimeException('A CSV export has no header row.');
    }
    $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]) ?? (string) $header[0];
    $rows = [];
    while (($values = fgetcsv($handle, null, ',', '"', '\\')) !== false) {
        if ($values === [null] || $values === []) {
            continue;
        }
        if (count($values) !== count($header)) {
            fclose($handle);
            throw new RuntimeException('A CSV row has a different number of fields than its header.');
        }
        $rows[] = array_combine($header, array_map(
            static fn (mixed $value): ?string => csv_value(is_string($value) ? $value : null),
            $values
        ));
    }
    fclose($handle);

    return $rows;
}

function required_value(array $row, string $key): string
{
    $value = $row[$key] ?? null;
    if (!is_string($value) || $value === '') {
        throw new RuntimeException('A required field is empty in a CSV export.');
    }

    return $value;
}

function optional_value(array $row, string $key): ?string
{
    $value = $row[$key] ?? null;
    return is_string($value) ? $value : null;
}

function uuid_value(string $value): string
{
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $value)) {
        throw new RuntimeException('A CSV export contains an invalid identifier.');
    }
    return strtolower($value);
}

function nullable_uuid(array $row, string $key): ?string
{
    $value = optional_value($row, $key);
    return $value === null ? null : uuid_value($value);
}

function date_value(array $row, string $key, bool $required = false): ?string
{
    $value = optional_value($row, $key);
    if ($value === null) {
        if ($required) {
            throw new RuntimeException('A required timestamp is empty in a CSV export.');
        }
        return null;
    }

    try {
        return (new DateTimeImmutable($value))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d H:i:s.u');
    } catch (Throwable $error) {
        throw new RuntimeException('A CSV export contains an invalid timestamp.', 0, $error);
    }
}

function load_supabase_object(string $url, string $bucket, string $sourceRoot): string
{
    $path = parse_url($url, PHP_URL_PATH);
    if (!is_string($path)) {
        $path = $url;
    }
    $marker = '/' . $bucket . '/';
    $offset = strpos($path, $marker);
    if ($offset !== false) {
        $key = substr($path, $offset + strlen($marker));
    } elseif (str_starts_with($path, $bucket . '/')) {
        $key = substr($path, strlen($bucket) + 1);
    } else {
        $key = ltrim($path, '/');
    }

    $key = rawurldecode($key);
    $segments = explode('/', str_replace('\\', '/', $key));
    if (
        $key === ''
        || in_array('', $segments, true)
        || in_array('.', $segments, true)
        || in_array('..', $segments, true)
    ) {
        throw new RuntimeException('A media reference contains an unsafe path.');
    }

    $bucketRoot = realpath($sourceRoot . DIRECTORY_SEPARATOR . $bucket);
    $file = realpath(
        $sourceRoot . DIRECTORY_SEPARATOR . $bucket . DIRECTORY_SEPARATOR
        . implode(DIRECTORY_SEPARATOR, $segments)
    );
    if (
        $bucketRoot === false
        || $file === false
        || !is_file($file)
        || !str_starts_with($file, $bucketRoot . DIRECTORY_SEPARATOR)
    ) {
        throw new RuntimeException('A referenced media file is missing from the private backup.');
    }

    return $file;
}

function validate_media(string $file, string $kind): string
{
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file);
    $allowed = match ($kind) {
        'avatar', 'photo' => ['image/jpeg', 'image/png'],
        'signature' => ['image/png'],
        'pdf' => ['application/pdf'],
        default => [],
    };
    if (!is_string($mime) || !in_array($mime, $allowed, true)) {
        throw new RuntimeException('A referenced media file has an unexpected content type.');
    }
    if ($kind === 'avatar' && $mime !== 'image/jpeg') {
        throw new RuntimeException('A profile avatar is not a JPEG image.');
    }
    if (in_array($kind, ['avatar', 'photo', 'signature'], true)) {
        $image = getimagesize($file);
        if (!is_array($image) || ($image['mime'] ?? null) !== $mime) {
            throw new RuntimeException('A referenced image is invalid.');
        }
    }
    if ($kind === 'pdf') {
        $handle = fopen($file, 'rb');
        $signature = $handle === false ? false : fread($handle, 5);
        if (is_resource($handle)) {
            fclose($handle);
        }
        if ($signature !== '%PDF-') {
            throw new RuntimeException('A referenced PDF is invalid.');
        }
    }

    return $mime;
}

function storage_target(string $relativePath): string
{
    if (
        !preg_match('#^(?:profile-avatars|validations)/[0-9a-f-]{36}/[A-Za-z0-9_-]+\.(?:jpg|png|pdf)$#i', $relativePath)
    ) {
        throw new RuntimeException('An internal media path is invalid.');
    }
    return storage_directory() . '/' . $relativePath;
}

function copy_media(string $source, string $relativePath, string $mime, array &$copiedFiles): string
{
    $destination = storage_target($relativePath);
    $directory = dirname($destination);
    $storageRoot = storage_directory();
    $storageOwner = fileowner($storageRoot);
    $storageGroup = filegroup($storageRoot);
    if ($storageOwner === false || $storageGroup === false) {
        throw new RuntimeException('Unable to determine private storage ownership.');
    }

    $missingDirectories = [];
    $current = $directory;
    while ($current !== $storageRoot && !is_dir($current)) {
        $missingDirectories[] = $current;
        $current = dirname($current);
    }
    foreach (array_reverse($missingDirectories) as $newDirectory) {
        if (!mkdir($newDirectory, 0750) || !chown($newDirectory, $storageOwner) || !chgrp($newDirectory, $storageGroup)) {
            throw new RuntimeException('Unable to create a private media directory.');
        }
    }

    if (file_exists($destination) || !copy($source, $destination)) {
        throw new RuntimeException('Unable to copy a media file into private storage.');
    }
    $copiedFiles[] = $destination;
    if (
        !chmod($destination, 0640)
        || !chown($destination, $storageOwner)
        || !chgrp($destination, $storageGroup)
    ) {
        throw new RuntimeException('Unable to set private media file permissions.');
    }

    return $relativePath;
}

function insert_row(PDO $pdo, string $table, array $row): void
{
    $columns = array_keys($row);
    $quotedColumns = implode(', ', array_map(static fn (string $column): string => '`' . $column . '`', $columns));
    $placeholders = implode(', ', array_map(static fn (string $column): string => ':' . $column, $columns));
    $statement = $pdo->prepare("INSERT INTO `{$table}` ({$quotedColumns}) VALUES ({$placeholders})");
    $statement->execute($row);
}

function validate_source_references(array $profiles, array $teams, array $validations, array $invitations, array $accounting): void
{
    $profileIds = [];
    $emails = [];
    foreach ($profiles as $profile) {
        $id = uuid_value(required_value($profile, 'id'));
        if (isset($profileIds[$id])) {
            throw new RuntimeException('A profile identifier is duplicated in the exports.');
        }
        $profileIds[$id] = true;
        $email = strtolower(required_value($profile, 'email'));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || isset($emails[$email])) {
            throw new RuntimeException('A profile email is invalid or duplicated in the exports.');
        }
        $emails[$email] = true;
    }

    $teamIds = [];
    foreach ($teams as $team) {
        $id = uuid_value(required_value($team, 'id'));
        if (isset($teamIds[$id])) {
            throw new RuntimeException('A team identifier is duplicated in the exports.');
        }
        $teamIds[$id] = true;
    }

    $validationIds = [];
    foreach ($validations as $validation) {
        $id = uuid_value(required_value($validation, 'id'));
        if (isset($validationIds[$id])) {
            throw new RuntimeException('A validation identifier is duplicated in the exports.');
        }
        $validationIds[$id] = true;

        foreach (['created_by' => $profileIds, 'assigned_team_id' => $teamIds, 'assigned_technician_id' => $profileIds] as $field => $targetIds) {
            $reference = nullable_uuid($validation, $field);
            if ($reference !== null && !isset($targetIds[$reference])) {
                throw new RuntimeException('A validation references an account or team absent from the exports.');
            }
        }
    }

    foreach ($profiles as $profile) {
        $teamId = nullable_uuid($profile, 'team_id');
        if ($teamId !== null && !isset($teamIds[$teamId])) {
            throw new RuntimeException('A profile references a team absent from the exports.');
        }
    }
    foreach ($invitations as $invitation) {
        $teamId = nullable_uuid($invitation, 'team_id');
        $inviterId = nullable_uuid($invitation, 'invited_by');
        if (($teamId !== null && !isset($teamIds[$teamId])) || ($inviterId !== null && !isset($profileIds[$inviterId]))) {
            throw new RuntimeException('An invitation references an account or team absent from the exports.');
        }
    }
    foreach ($accounting as $request) {
        $validationId = uuid_value(required_value($request, 'validation_id'));
        $processorId = nullable_uuid($request, 'processed_by');
        if (!isset($validationIds[$validationId]) || ($processorId !== null && !isset($profileIds[$processorId]))) {
            throw new RuntimeException('An accounting request references an absent validation or account.');
        }
    }

    foreach ([
        ...$profiles,
        ...$teams,
        ...$validations,
        ...$invitations,
    ] as $row) {
        if (optional_value($row, 'company_id') !== null) {
            throw new RuntimeException('A source row references a company, but the company export is empty.');
        }
    }
}

function main(array $arguments): void
{
    $options = parse_options($arguments);
    $source = $options['source'];
    $csvDirectory = $source . DIRECTORY_SEPARATOR . 'CSV';
    if (!is_dir($csvDirectory)) {
        throw new RuntimeException('The backup must contain a CSV directory.');
    }

    $profiles = read_csv_table($csvDirectory, 'profiles', ['id', 'created_at', 'email', 'full_name', 'role', 'team_id', 'team_name', 'avatar_url', 'company_id']);
    $teams = read_csv_table(
        $csvDirectory,
        'teams',
        ['id', 'created_at', 'name', 'company_id'],
        ['legal_name', 'storage_quota_mb', 'status']
    );
    $validations = read_csv_table($csvDirectory, 'validations', ['id', 'created_at', 'client_name', 'intervention_title', 'status', 'photo_before_url', 'photo_after_url', 'signature_png_url', 'pdf_url', 'created_by', 'assigned_team_id', 'assigned_technician_id', 'company_id']);
    $invitations = read_csv_table($csvDirectory, 'user_invitations', ['id', 'created_at', 'email', 'full_name', 'role', 'team_id', 'team_name', 'token', 'invited_by', 'accepted_at', 'company_id']);
    $accounting = read_csv_table($csvDirectory, 'accounting_requests', ['id', 'created_at', 'requested_at', 'validation_id', 'pdf_url', 'status', 'processed_at', 'processed_by']);
    validate_source_references($profiles, $teams, $validations, $invitations, $accounting);

    $pdo = database();
    $storageRoot = storage_directory();
    if (!is_dir($storageRoot) || !is_readable($storageRoot) || !is_writable($storageRoot)) {
        throw new RuntimeException('The private Hostinger storage directory is unavailable or not writable.');
    }
    $existingCompany = $pdo->prepare('SELECT id FROM companies WHERE LOWER(name) = LOWER(:name) LIMIT 1');
    $existingCompany->execute(['name' => DEMO_COMPANY_NAME]);
    if ($existingCompany->fetchColumn() !== false) {
        throw new RuntimeException('A company named proof-demo already exists. No data was changed.');
    }
    foreach ($profiles as $profile) {
        $existingProfile = $pdo->prepare('SELECT id FROM profiles WHERE email = :email LIMIT 1');
        $existingProfile->execute(['email' => strtolower(required_value($profile, 'email'))]);
        if ($existingProfile->fetchColumn() !== false) {
            throw new RuntimeException('An imported email already exists in Hostinger. No data was changed.');
        }
    }
    foreach ([
        'teams' => $teams,
        'validations' => $validations,
        'user_invitations' => $invitations,
        'accounting_requests' => $accounting,
    ] as $table => $rows) {
        foreach ($rows as $row) {
            $existing = $pdo->prepare("SELECT id FROM `{$table}` WHERE id = :id LIMIT 1");
            $existing->execute(['id' => uuid_value(required_value($row, 'id'))]);
            if ($existing->fetchColumn() !== false) {
                throw new RuntimeException('An imported identifier already exists in Hostinger. No data was changed.');
            }
        }
    }

    $companyId = uuid_v4();
    $profileIds = [];
    $validationIds = [];
    foreach ($profiles as $profile) {
        $profileIds[uuid_value(required_value($profile, 'id'))] = true;
    }
    foreach ($validations as $validation) {
        $validationIds[uuid_value(required_value($validation, 'id'))] = true;
    }

    $newFiles = [];
    $resetTokens = [];
    $resetFile = '/var/lib/chantierproof/import/proof-demo-password-reset-links.txt';
    $resetTempFile = $resetFile . '.' . bin2hex(random_bytes(8)) . '.tmp';
    $resetManifestPublished = false;

    try {
        $pdo->beginTransaction();
        $company = [
            'id' => $companyId,
            'name' => DEMO_COMPANY_NAME,
            'status' => 'active',
        ];
        insert_row($pdo, 'companies', $company);

        $usedTeamNames = [];
        $renamedTeams = 0;
        foreach ($teams as $team) {
            $teamName = required_value($team, 'name');
            $baseTeamName = $teamName;
            $suffix = 2;
            while (isset($usedTeamNames[strtolower($teamName)])) {
                $teamName = $baseTeamName . ' (' . $suffix . ')';
                $suffix++;
                $renamedTeams++;
            }
            $usedTeamNames[strtolower($teamName)] = true;
            insert_row($pdo, 'teams', [
                'id' => uuid_value(required_value($team, 'id')),
                'created_at' => date_value($team, 'created_at', true),
                'name' => $teamName,
                'company_id' => $companyId,
            ]);
        }

        foreach ($profiles as $profile) {
            $id = uuid_value(required_value($profile, 'id'));
            $email = strtolower(required_value($profile, 'email'));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new RuntimeException('A profile export contains an invalid email address.');
            }
            $role = required_value($profile, 'role');
            if ($role === 'super_admin') {
                $role = 'admin';
            }
            if (!in_array($role, ['admin', 'accountant', 'technician', 'manager'], true)) {
                throw new RuntimeException('A profile export contains an unsupported role.');
            }

            $avatarUrl = optional_value($profile, 'avatar_url');
            $avatarPath = null;
            if ($avatarUrl !== null) {
                $avatarSource = load_supabase_object($avatarUrl, 'profile-avatars', $source);
                $avatarMime = validate_media($avatarSource, 'avatar');
                $avatarPath = sprintf('profile-avatars/%s/avatar-%s.jpg', $id, bin2hex(random_bytes(16)));
                copy_media($avatarSource, $avatarPath, $avatarMime, $newFiles);
            }

            $token = bin2hex(random_bytes(32));
            $resetTokens[] = [
                'email' => $email,
                'url' => rtrim($options['base-url'], '/') . '/password-reset.html?token=' . $token,
                'hash' => hash('sha256', $token),
            ];
            insert_row($pdo, 'profiles', [
                'id' => $id,
                'created_at' => date_value($profile, 'created_at', true),
                'email' => $email,
                'full_name' => optional_value($profile, 'full_name'),
                'role' => $role,
                'team_id' => nullable_uuid($profile, 'team_id'),
                'team_name' => optional_value($profile, 'team_name'),
                'avatar_url' => $avatarPath,
                'company_id' => $companyId,
                'password_hash' => null,
                'password_reset_token_hash' => end($resetTokens)['hash'],
                'password_reset_expires_at' => (new DateTimeImmutable('+24 hours', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u'),
                'password_set_at' => null,
            ]);
        }

        foreach ($validations as $validation) {
            $id = uuid_value(required_value($validation, 'id'));
            $media = [];
            foreach ([
                'photo_before_url' => ['before.jpg', 'photo'],
                'photo_after_url' => ['after.jpg', 'photo'],
                'signature_png_url' => ['signature.png', 'signature'],
                'pdf_url' => ['preuve.pdf', 'pdf'],
            ] as $column => [$filename, $kind]) {
                $url = optional_value($validation, $column);
                if ($url === null) {
                    $media[$column] = null;
                    continue;
                }
                $assetSource = load_supabase_object($url, 'validation-assets', $source);
                $mime = validate_media($assetSource, $kind);
                $extension = $mime === 'image/png' ? 'png' : ($kind === 'pdf' ? 'pdf' : 'jpg');
                $basename = pathinfo($filename, PATHINFO_FILENAME) . '.' . $extension;
                $media[$column] = copy_media(
                    $assetSource,
                    'validations/' . $id . '/' . $basename,
                    $mime,
                    $newFiles
                );
            }
            insert_row($pdo, 'validations', [
                'id' => $id,
                'created_at' => date_value($validation, 'created_at', true),
                'client_name' => required_value($validation, 'client_name'),
                'client_phone' => optional_value($validation, 'client_phone'),
                'intervention_title' => required_value($validation, 'intervention_title'),
                'intervention_price' => optional_value($validation, 'intervention_price'),
                'gps_position' => optional_value($validation, 'gps_position'),
                'status' => required_value($validation, 'status'),
                'photo_before_url' => $media['photo_before_url'],
                'photo_after_url' => $media['photo_after_url'],
                'signature_png_url' => $media['signature_png_url'],
                'technician_name' => optional_value($validation, 'technician_name'),
                'technician_notes' => optional_value($validation, 'technician_notes'),
                'signer_name' => optional_value($validation, 'signer_name'),
                'signed_at' => date_value($validation, 'signed_at'),
                'pdf_url' => $media['pdf_url'],
                'accounting_status' => optional_value($validation, 'accounting_status') ?? 'not_sent',
                'sent_to_accounting_at' => date_value($validation, 'sent_to_accounting_at'),
                'validation_link_expires_at' => date_value($validation, 'validation_link_expires_at'),
                'created_by' => nullable_uuid($validation, 'created_by'),
                'assigned_team_id' => nullable_uuid($validation, 'assigned_team_id'),
                'assigned_technician_id' => nullable_uuid($validation, 'assigned_technician_id'),
                'company_id' => $companyId,
            ]);
        }

        foreach ($invitations as $invitation) {
            $role = required_value($invitation, 'role');
            if ($role === 'super_admin') {
                $role = 'admin';
            }
            insert_row($pdo, 'user_invitations', [
                'id' => uuid_value(required_value($invitation, 'id')),
                'created_at' => date_value($invitation, 'created_at', true),
                'email' => strtolower(required_value($invitation, 'email')),
                'full_name' => required_value($invitation, 'full_name'),
                'role' => $role,
                'team_id' => nullable_uuid($invitation, 'team_id'),
                'team_name' => optional_value($invitation, 'team_name'),
                'token' => uuid_value(required_value($invitation, 'token')),
                'invited_by' => nullable_uuid($invitation, 'invited_by'),
                'accepted_at' => date_value($invitation, 'accepted_at'),
                'expires_at' => date_value($invitation, 'expires_at'),
                'company_id' => $companyId,
            ]);
        }

        foreach ($accounting as $request) {
            $validationId = uuid_value(required_value($request, 'validation_id'));
            if (!isset($validationIds[$validationId])) {
                throw new RuntimeException('An accounting request references a validation absent from the exports.');
            }
            $pdfUrl = optional_value($request, 'pdf_url');
            if ($pdfUrl === null) {
                throw new RuntimeException('An accounting request has no PDF reference.');
            }
            $pdfSource = load_supabase_object($pdfUrl, 'validation-assets', $source);
            $pdfMime = validate_media($pdfSource, 'pdf');
            $pdfPath = null;
            foreach ($validations as $validation) {
                if (uuid_value(required_value($validation, 'id')) === $validationId) {
                    $validationPdf = optional_value($validation, 'pdf_url');
                    if ($validationPdf !== null) {
                        $existingPdf = load_supabase_object($validationPdf, 'validation-assets', $source);
                        if (realpath($existingPdf) === realpath($pdfSource)) {
                            $pdfPath = 'validations/' . $validationId . '/preuve.pdf';
                        }
                    }
                    break;
                }
            }
            if ($pdfPath === null) {
                $pdfPath = copy_media(
                    $pdfSource,
                    'validations/' . $validationId . '/comptabilite.pdf',
                    $pdfMime,
                    $newFiles
                );
            }
            insert_row($pdo, 'accounting_requests', [
                'id' => uuid_value(required_value($request, 'id')),
                'created_at' => date_value($request, 'created_at', true),
                'requested_at' => date_value($request, 'requested_at', true),
                'validation_id' => $validationId,
                'pdf_url' => $pdfPath,
                'status' => required_value($request, 'status'),
                'processed_at' => date_value($request, 'processed_at'),
                'processed_by' => nullable_uuid($request, 'processed_by'),
            ]);
        }

        $resetDirectory = dirname($resetFile);
        if (!is_dir($resetDirectory) && !mkdir($resetDirectory, 0700, true) && !is_dir($resetDirectory)) {
            throw new RuntimeException('Unable to create the private password-link directory.');
        }
        if (file_exists($resetFile)) {
            throw new RuntimeException('A password-link manifest already exists; refusing to overwrite it.');
        }
        $manifest = fopen($resetTempFile, 'xb');
        if ($manifest === false) {
            throw new RuntimeException('Unable to create the private password-link manifest.');
        }
        chmod($resetTempFile, 0600);
        fwrite($manifest, "Password reset links for proof-demo (valid for 24 hours)\n");
        foreach ($resetTokens as $resetToken) {
            fwrite($manifest, $resetToken['email'] . "\t" . $resetToken['url'] . "\n");
        }
        if (!fflush($manifest)) {
            fclose($manifest);
            throw new RuntimeException('Unable to write the password-link manifest.');
        }
        fclose($manifest);

        if ($options['dry-run']) {
            $pdo->rollBack();
            foreach ($newFiles as $newFile) {
                if (is_file($newFile)) {
                    unlink($newFile);
                }
            }
            unlink($resetTempFile);
            fwrite(STDOUT, sprintf(
                "Dry run passed. Rows: profiles=%d, teams=%d, validations=%d, invitations=%d, accounting_requests=%d. No database rows or files were retained.\n",
                count($profiles),
                count($teams),
                count($validations),
                count($invitations),
                count($accounting)
            ));
            return;
        }

        if (!rename($resetTempFile, $resetFile)) {
            throw new RuntimeException('Unable to finalize the private password-link manifest.');
        }
        $resetManifestPublished = true;
        chmod($resetFile, 0600);
        $pdo->commit();
        fwrite(STDOUT, sprintf(
            "Import succeeded for proof-demo. Rows: profiles=%d, teams=%d, validations=%d, invitations=%d, accounting_requests=%d. Duplicate team names disambiguated=%d.\n",
            count($profiles),
            count($teams),
            count($validations),
            count($invitations),
            count($accounting),
            $renamedTeams
        ));
        fwrite(STDOUT, "All imported accounts must set a new password using the private one-time links in /var/lib/chantierproof/import/proof-demo-password-reset-links.txt (valid for 24 hours).\n");
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        foreach ($newFiles as $newFile) {
            if (is_file($newFile)) {
                unlink($newFile);
            }
        }
        if (is_file($resetTempFile)) {
            unlink($resetTempFile);
        }
        if ($resetManifestPublished && is_file($resetFile)) {
            unlink($resetFile);
        }
        throw $error;
    }
}

try {
    main(array_slice($argv, 1));
} catch (Throwable $error) {
    fwrite(STDERR, 'Import stopped without applying partial database changes: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
