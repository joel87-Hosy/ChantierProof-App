<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$action = $_GET['action'] ?? 'health';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (!is_string($action)) {
    send_json(400, ['ok' => false, 'error' => 'Action invalide.']);
}

if ($action === 'health') {
    if ($method !== 'GET') {
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
}

if (!in_array($action, [
    'session',
    'login',
    'logout',
    'profile',
    'profile-avatar',
    'company-users',
    'password-reset-link',
    'password-reset',
    'invitation',
    'accept-invitation',
    'companies',
    'company-status',
    'company-delete',
    'invitations',
    'accounting-requests',
    'accounting-request',
    'validations',
    'signed-month-count',
    'public-validation',
    'validation-detail',
    'seal-validation',
    'asset',
], true)) {
    send_json(404, ['ok' => false, 'error' => 'Action introuvable.']);
}

start_app_session();
header('Cache-Control: no-store');
header('Pragma: no-cache');

if ($action === 'session') {
    if ($method !== 'GET') {
        header('Allow: GET');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }

    send_json(200, [
        'ok' => true,
        'csrfToken' => csrf_token(),
        'profile' => current_profile(),
    ]);
}

if ($action === 'profile') {
    if ($method !== 'PATCH') {
        header('Allow: PATCH');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }
    require_csrf_token();

    $profile = require_profile();
    $payload = read_json_request();
    $fullName = $payload['full_name'] ?? null;
    $teamName = $payload['team_name'] ?? null;
    if (
        !is_string($fullName) || trim($fullName) === '' || text_length(trim($fullName)) > 255
        || ($teamName !== null && (!is_string($teamName) || text_length(trim($teamName)) > 255))
    ) {
        send_json(400, ['ok' => false, 'error' => 'Vérifiez le nom complet et l’équipe.']);
    }

    try {
        $statement = database()->prepare(
            'UPDATE profiles
             SET full_name = :full_name, team_name = :team_name
             WHERE id = :id'
        );
        $statement->execute([
            'full_name' => trim($fullName),
            'team_name' => is_string($teamName) && trim($teamName) !== '' ? trim($teamName) : null,
            'id' => $profile['id'],
        ]);
        send_json(200, ['ok' => true, 'profile' => current_profile()]);
    } catch (Throwable $error) {
        error_log('ChantierProof profile update failed: ' . $error->getMessage());
        send_json(503, ['ok' => false, 'error' => 'La mise à jour du profil est temporairement indisponible.']);
    }
}

if ($action === 'profile-avatar') {
    $profile = require_profile();

    if ($method === 'POST') {
        require_csrf_token();
        validate_upload('avatar', ['image/jpeg'], 2 * 1024 * 1024);

        $relativePath = 'profile-avatars/' . $profile['id'] . '/avatar-' . bin2hex(random_bytes(16)) . '.jpg';
        $storedPath = store_upload('avatar', $relativePath);
        try {
            $statement = database()->prepare('UPDATE profiles SET avatar_url = :avatar_url WHERE id = :id');
            $statement->execute([
                'avatar_url' => $storedPath,
                'id' => $profile['id'],
            ]);
        } catch (Throwable $error) {
            if (is_file(storage_directory() . '/' . $storedPath)) {
                unlink(storage_directory() . '/' . $storedPath);
            }
            error_log('ChantierProof avatar update failed: ' . $error->getMessage());
            send_json(503, ['ok' => false, 'error' => 'La photo de profil est temporairement indisponible.']);
        }

        send_json(200, ['ok' => true, 'avatar_url' => $storedPath]);
    }

    if ($method !== 'GET') {
        header('Allow: GET, POST');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }

    $path = $profile['avatar_url'] ?? '';
    if (
        !is_string($path)
        || !preg_match(
            '#^profile-avatars/' . preg_quote((string) $profile['id'], '#') . '/avatar-[a-f0-9]{32}\.jpg$#',
            $path
        )
    ) {
        send_json(404, ['ok' => false, 'error' => 'Photo de profil introuvable.']);
    }

    $filePath = storage_directory() . '/' . $path;
    if (!is_file($filePath) || !is_readable($filePath)) {
        send_json(404, ['ok' => false, 'error' => 'Photo de profil introuvable.']);
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($filePath);
    if ($mime !== 'image/jpeg') {
        send_json(415, ['ok' => false, 'error' => 'Format de photo non autorisé.']);
    }

    header('Content-Type: image/jpeg');
    header('Content-Length: ' . (string) filesize($filePath));
    header('Content-Disposition: inline; filename="avatar.jpg"');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store');
    readfile($filePath);
    exit;
}

if ($action === 'company-users') {
    if ($method !== 'GET') {
        header('Allow: GET');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }
    $profile = require_profile(['admin']);
    if (!is_string($profile['company_id']) || $profile['company_id'] === '') {
        send_json(403, ['ok' => false, 'error' => 'Votre compte ne dépend d’aucune entreprise.']);
    }

    try {
        $statement = database()->prepare(
            'SELECT id, email, full_name, role, team_name
             FROM profiles
             WHERE company_id = :company_id AND id <> :current_user
             ORDER BY full_name, email'
        );
        $statement->execute([
            'company_id' => $profile['company_id'],
            'current_user' => $profile['id'],
        ]);
        send_json(200, ['ok' => true, 'users' => $statement->fetchAll()]);
    } catch (Throwable $error) {
        error_log('ChantierProof company user listing failed: ' . $error->getMessage());
        send_json(503, ['ok' => false, 'error' => 'La liste des utilisateurs est temporairement indisponible.']);
    }
}

if ($action === 'password-reset-link') {
    if ($method !== 'POST') {
        header('Allow: POST');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }
    require_csrf_token();
    $profile = require_profile(['admin']);
    if (!is_string($profile['company_id']) || $profile['company_id'] === '') {
        send_json(403, ['ok' => false, 'error' => 'Votre compte ne dépend d’aucune entreprise.']);
    }

    $payload = read_json_request();
    $userId = $payload['user_id'] ?? null;
    if (!is_string($userId) || !preg_match('/^[0-9a-f-]{36}$/i', $userId)) {
        send_json(400, ['ok' => false, 'error' => 'Compte invalide.']);
    }
    if ($userId === $profile['id']) {
        send_json(400, ['ok' => false, 'error' => 'Pour votre propre compte, utilisez le formulaire de profil.']);
    }

    $token = bin2hex(random_bytes(32));
    try {
        $statement = database()->prepare(
            'UPDATE profiles
             SET password_reset_token_hash = :token_hash,
                 password_reset_expires_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 1 HOUR)
             WHERE id = :id AND company_id = :company_id'
        );
        $statement->execute([
            'token_hash' => hash('sha256', $token),
            'id' => $userId,
            'company_id' => $profile['company_id'],
        ]);
        if ($statement->rowCount() !== 1) {
            send_json(404, ['ok' => false, 'error' => 'Utilisateur introuvable dans votre entreprise.']);
        }
        send_json(201, [
            'ok' => true,
            'token' => $token,
            'expiresInMinutes' => 60,
        ]);
    } catch (Throwable $error) {
        error_log('ChantierProof password reset link creation failed: ' . $error->getMessage());
        send_json(503, ['ok' => false, 'error' => 'La création du lien est temporairement indisponible.']);
    }
}

if ($action === 'password-reset') {
    if ($method === 'GET') {
        $token = $_GET['token'] ?? '';
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
            send_json(400, ['ok' => false, 'error' => 'Lien de réinitialisation invalide.']);
        }
        try {
            $statement = database()->prepare(
                'SELECT email, full_name
                 FROM profiles
                 WHERE password_reset_token_hash = :token_hash
                   AND password_reset_expires_at > CURRENT_TIMESTAMP(6)
                 LIMIT 1'
            );
            $statement->execute(['token_hash' => hash('sha256', $token)]);
            $user = $statement->fetch();
            if (!is_array($user)) {
                send_json(404, ['ok' => false, 'error' => 'Lien expiré ou déjà utilisé. Demandez-en un nouveau à votre administrateur.']);
            }
            send_json(200, ['ok' => true, 'email' => $user['email'], 'full_name' => $user['full_name']]);
        } catch (Throwable $error) {
            error_log('ChantierProof password reset link lookup failed: ' . $error->getMessage());
            send_json(503, ['ok' => false, 'error' => 'La vérification du lien est temporairement indisponible.']);
        }
    }

    if ($method !== 'POST') {
        header('Allow: GET, POST');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }
    require_csrf_token();
    $payload = read_json_request();
    $token = $payload['token'] ?? null;
    $password = $payload['password'] ?? null;
    if (
        !is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)
        || !is_string($password) || strlen($password) < 12 || strlen($password) > 4096
    ) {
        send_json(400, ['ok' => false, 'error' => 'Le mot de passe doit comporter au moins 12 caractères.']);
    }

    try {
        $statement = database()->prepare(
            'UPDATE profiles
             SET password_hash = :password_hash,
                 password_set_at = CURRENT_TIMESTAMP(6),
                 password_reset_token_hash = NULL,
                 password_reset_expires_at = NULL
             WHERE password_reset_token_hash = :token_hash
               AND password_reset_expires_at > CURRENT_TIMESTAMP(6)'
        );
        $statement->execute([
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'token_hash' => hash('sha256', $token),
        ]);
        if ($statement->rowCount() !== 1) {
            send_json(409, ['ok' => false, 'error' => 'Lien expiré ou déjà utilisé. Demandez-en un nouveau à votre administrateur.']);
        }
        send_json(200, ['ok' => true]);
    } catch (Throwable $error) {
        error_log('ChantierProof password reset failed: ' . $error->getMessage());
        send_json(503, ['ok' => false, 'error' => 'La réinitialisation est temporairement indisponible.']);
    }
}

if ($action === 'login') {
    if ($method !== 'POST') {
        header('Allow: POST');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }
    require_csrf_token();

    $payload = read_json_request();
    $email = $payload['email'] ?? null;
    $password = $payload['password'] ?? null;

    if (!is_string($email) || !is_string($password) || strlen($email) > 255 || strlen($password) > 4096) {
        send_json(400, ['ok' => false, 'error' => 'Adresse e-mail ou mot de passe invalide.']);
    }

    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        send_json(400, ['ok' => false, 'error' => 'Adresse e-mail ou mot de passe invalide.']);
    }

    try {
        $statement = database()->prepare(
            'SELECT p.id, p.password_hash, p.role, p.company_id, c.status AS company_status
             FROM profiles p
             LEFT JOIN companies c ON c.id = p.company_id
             WHERE p.email = :email
             LIMIT 1'
        );
        $statement->execute(['email' => $email]);
        $user = $statement->fetch();
    } catch (Throwable $error) {
        error_log('ChantierProof login lookup failed: ' . $error->getMessage());
        send_json(503, ['ok' => false, 'error' => 'Connexion temporairement indisponible. Réessayez plus tard.']);
    }

    if (
        !is_array($user)
        || !is_string($user['password_hash'] ?? null)
        || $user['password_hash'] === ''
        || !password_verify($password, $user['password_hash'])
    ) {
        send_json(401, ['ok' => false, 'error' => 'Adresse e-mail ou mot de passe incorrect.']);
    }

    if ($user['company_id'] !== null && $user['company_status'] === 'suspended') {
        send_json(403, ['ok' => false, 'error' => 'Votre entreprise est suspendue. Contactez le support ChantierProof.']);
    }

    if (!session_regenerate_id(true)) {
        throw new RuntimeException('Unable to rotate the application session identifier.');
    }

    $_SESSION = [
        'user_id' => $user['id'],
        'csrf_token' => bin2hex(random_bytes(32)),
    ];

    $profile = current_profile();
    send_json(200, [
        'ok' => true,
        'csrfToken' => csrf_token(),
        'profile' => $profile,
    ]);
}

if ($action === 'invitation') {
    if ($method !== 'GET') {
        header('Allow: GET');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }

    $token = $_GET['token'] ?? '';
    $email = $_GET['email'] ?? '';
    if (
        !is_string($token) || !preg_match('/^[0-9a-f-]{36}$/i', $token)
        || !is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)
    ) {
        send_json(400, ['ok' => false, 'error' => 'Invitation invalide.']);
    }

    try {
        $statement = database()->prepare(
            'SELECT email, full_name, role
             FROM user_invitations
             WHERE token = :token
               AND email = :email
               AND accepted_at IS NULL
               AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP(6))
             LIMIT 1'
        );
        $statement->execute([
            'token' => $token,
            'email' => strtolower(trim($email)),
        ]);
        $invitation = $statement->fetch();
    } catch (Throwable $error) {
        error_log('ChantierProof invitation lookup failed: ' . $error->getMessage());
        send_json(503, ['ok' => false, 'error' => 'Vérification de l’invitation temporairement indisponible.']);
    }
    if (!is_array($invitation)) {
        send_json(404, ['ok' => false, 'error' => 'Invitation expirée, introuvable ou déjà utilisée.']);
    }

    send_json(200, [
        'ok' => true,
        'invitation' => [
            'email' => $invitation['email'],
            'full_name' => $invitation['full_name'],
            'role' => $invitation['role'],
        ],
    ]);
}

if ($action === 'accept-invitation') {
    if ($method !== 'POST') {
        header('Allow: POST');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }
    require_csrf_token();

    $payload = read_json_request();
    $token = $payload['token'] ?? null;
    $email = $payload['email'] ?? null;
    $password = $payload['password'] ?? null;
    if (
        !is_string($token) || !preg_match('/^[0-9a-f-]{36}$/i', $token)
        || !is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)
        || !is_string($password) || strlen($password) < 12 || strlen($password) > 4096
    ) {
        send_json(400, ['ok' => false, 'error' => 'Vérifiez l’invitation, l’adresse e-mail et le mot de passe (12 caractères minimum).']);
    }

    $pdo = database();
    try {
        $pdo->beginTransaction();
        $find = $pdo->prepare(
            'SELECT id, email, full_name, role, team_id, team_name, company_id
             FROM user_invitations
             WHERE token = :token
               AND email = :email
               AND accepted_at IS NULL
               AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP(6))
             LIMIT 1
             FOR UPDATE'
        );
        $find->execute([
            'token' => $token,
            'email' => strtolower(trim($email)),
        ]);
        $invitation = $find->fetch();
        if (!is_array($invitation)) {
            $pdo->rollBack();
            send_json(404, ['ok' => false, 'error' => 'Invitation expirée, introuvable ou déjà utilisée.']);
        }

        $newProfileId = uuid_v4();
        $insert = $pdo->prepare(
            'INSERT INTO profiles
                (id, email, full_name, role, team_id, team_name, company_id, password_hash, password_set_at)
             VALUES
                (:id, :email, :full_name, :role, :team_id, :team_name, :company_id, :password_hash, CURRENT_TIMESTAMP(6))'
        );
        $insert->execute([
            'id' => $newProfileId,
            'email' => $invitation['email'],
            'full_name' => $invitation['full_name'],
            'role' => $invitation['role'],
            'team_id' => $invitation['team_id'],
            'team_name' => $invitation['team_name'],
            'company_id' => $invitation['company_id'],
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        ]);

        $accept = $pdo->prepare(
            'UPDATE user_invitations SET accepted_at = CURRENT_TIMESTAMP(6)
             WHERE id = :id AND accepted_at IS NULL'
        );
        $accept->execute(['id' => $invitation['id']]);
        if ($accept->rowCount() !== 1) {
            throw new RuntimeException('Invitation state changed during activation.');
        }

        $pdo->commit();
    } catch (PDOException $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($error->getCode() === '23000') {
            send_json(409, ['ok' => false, 'error' => 'Un compte existe déjà pour cette adresse e-mail.']);
        }
        error_log('ChantierProof invitation activation failed: ' . $error->getMessage());
        send_json(503, ['ok' => false, 'error' => 'Activation temporairement indisponible. Réessayez plus tard.']);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('ChantierProof invitation activation failed: ' . $error->getMessage());
        send_json(503, ['ok' => false, 'error' => 'Activation temporairement indisponible. Réessayez plus tard.']);
    }

    if (!session_regenerate_id(true)) {
        throw new RuntimeException('Unable to rotate the application session identifier.');
    }
    $_SESSION = [
        'user_id' => $newProfileId,
        'csrf_token' => bin2hex(random_bytes(32)),
    ];

    send_json(201, [
        'ok' => true,
        'csrfToken' => csrf_token(),
        'profile' => current_profile(),
    ]);
}

if ($action === 'companies') {
    if ($method === 'GET') {
        require_profile(['super_admin']);
        $companies = database()->query(
            'SELECT c.id, c.name, c.email, c.status, c.created_at,
                    s.plan, s.monthly_price_cents, s.currency,
                    (SELECT COUNT(*) FROM profiles p WHERE p.company_id = c.id) AS user_count,
                    (SELECT COUNT(*) FROM validations v WHERE v.company_id = c.id) AS validation_count
             FROM companies c
             LEFT JOIN subscriptions s
               ON s.company_id = c.id AND s.is_active = 1
             ORDER BY c.created_at DESC'
        )->fetchAll();
        send_json(200, ['ok' => true, 'companies' => $companies]);
    }

    if ($method === 'POST') {
        require_csrf_token();
        $profile = require_profile(['super_admin']);
        $payload = read_json_request();
        $name = $payload['name'] ?? null;
        $legalName = $payload['legal_name'] ?? null;
        $companyEmail = $payload['email'] ?? null;
        $phone = $payload['phone'] ?? null;
        $address = $payload['address'] ?? null;
        $plan = $payload['plan'] ?? 'starter';
        $price = $payload['monthly_price_cents'] ?? 0;
        $adminName = $payload['admin_full_name'] ?? null;
        $adminEmail = $payload['admin_email'] ?? null;

        $optionalTextValid = static fn ($value, int $max): bool =>
            $value === null || (is_string($value) && text_length($value) <= $max);
        if (
            !is_string($name) || trim($name) === '' || text_length(trim($name)) > 255
            || !$optionalTextValid($legalName, 255)
            || !$optionalTextValid($companyEmail, 255)
            || ($companyEmail !== null && trim($companyEmail) !== '' && !filter_var($companyEmail, FILTER_VALIDATE_EMAIL))
            || !$optionalTextValid($phone, 80)
            || !$optionalTextValid($address, 10000)
            || !is_string($plan) || !in_array($plan, ['free', 'starter', 'pro', 'enterprise'], true)
            || !is_numeric($price) || (float) $price < 0 || (float) $price > 21474836
            || !is_string($adminName) || trim($adminName) === '' || text_length(trim($adminName)) > 255
            || !is_string($adminEmail) || !filter_var($adminEmail, FILTER_VALIDATE_EMAIL)
        ) {
            send_json(400, ['ok' => false, 'error' => 'Vérifiez les informations de l’entreprise et de son administrateur.']);
        }

        $adminEmail = strtolower(trim($adminEmail));
        $pdo = database();
        $checkProfile = $pdo->prepare('SELECT 1 FROM profiles WHERE email = :email LIMIT 1');
        $checkProfile->execute(['email' => $adminEmail]);
        if ($checkProfile->fetchColumn() !== false) {
            send_json(409, ['ok' => false, 'error' => 'Un compte existe déjà pour l’adresse e-mail de cet administrateur.']);
        }

        $companyId = uuid_v4();
        $invitationToken = uuid_v4();
        try {
            $pdo->beginTransaction();
            $insertCompany = $pdo->prepare(
                'INSERT INTO companies (id, name, legal_name, email, phone, address, status)
                 VALUES (:id, :name, :legal_name, :email, :phone, :address, :status)'
            );
            $insertCompany->execute([
                'id' => $companyId,
                'name' => trim($name),
                'legal_name' => is_string($legalName) && trim($legalName) !== '' ? trim($legalName) : null,
                'email' => is_string($companyEmail) && trim($companyEmail) !== '' ? strtolower(trim($companyEmail)) : null,
                'phone' => is_string($phone) && trim($phone) !== '' ? trim($phone) : null,
                'address' => is_string($address) && trim($address) !== '' ? trim($address) : null,
                'status' => 'active',
            ]);

            $insertSubscription = $pdo->prepare(
                'INSERT INTO subscriptions (id, company_id, plan, monthly_price_cents, currency)
                 VALUES (:id, :company_id, :plan, :price, :currency)'
            );
            $insertSubscription->execute([
                'id' => uuid_v4(),
                'company_id' => $companyId,
                'plan' => $plan,
                'price' => (int) round((float) $price),
                'currency' => 'XOF',
            ]);

            $invite = $pdo->prepare(
                'INSERT INTO user_invitations
                    (id, email, full_name, role, team_name, token, invited_by, company_id, expires_at)
                 VALUES
                    (:id, :email, :full_name, :role, :team_name, :token, :invited_by, :company_id,
                     DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 7 DAY))'
            );
            $invite->execute([
                'id' => uuid_v4(),
                'email' => $adminEmail,
                'full_name' => trim($adminName),
                'role' => 'admin',
                'team_name' => 'Administration',
                'token' => $invitationToken,
                'invited_by' => $profile['id'],
                'company_id' => $companyId,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($error instanceof PDOException && $error->getCode() === '23000') {
                send_json(409, ['ok' => false, 'error' => 'Un compte ou une invitation existe déjà pour cette adresse e-mail.']);
            }
            error_log('ChantierProof company creation failed: ' . $error->getMessage());
            send_json(503, ['ok' => false, 'error' => 'Création de l’entreprise indisponible. Vérifiez le schéma de la base puis réessayez.']);
        }

        send_json(201, [
            'ok' => true,
            'company_id' => $companyId,
            'invitation_token' => $invitationToken,
            'admin_email' => $adminEmail,
        ]);
    }

    header('Allow: GET, POST');
    send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
}

if ($action === 'company-status') {
    if ($method !== 'PATCH') {
        header('Allow: PATCH');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }
    require_csrf_token();
    require_profile(['super_admin']);

    $payload = read_json_request();
    $id = $payload['id'] ?? null;
    $status = $payload['status'] ?? null;
    if (
        !is_string($id) || !preg_match('/^[0-9a-f-]{36}$/i', $id)
        || !is_string($status) || !in_array($status, ['active', 'suspended'], true)
    ) {
        send_json(400, ['ok' => false, 'error' => 'Statut d’entreprise invalide.']);
    }

    $update = database()->prepare('UPDATE companies SET status = :status WHERE id = :id');
    $update->execute(['status' => $status, 'id' => $id]);
    if ($update->rowCount() === 0) {
        $exists = database()->prepare('SELECT 1 FROM companies WHERE id = :id LIMIT 1');
        $exists->execute(['id' => $id]);
        if ($exists->fetchColumn() === false) {
            send_json(404, ['ok' => false, 'error' => 'Entreprise introuvable.']);
        }
    }
    send_json(200, ['ok' => true]);
}

if ($action === 'company-delete') {
    if ($method !== 'DELETE') {
        header('Allow: DELETE');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }
    require_csrf_token();
    require_profile(['super_admin']);

    $payload = read_json_request();
    $id = $payload['id'] ?? null;
    if (!is_string($id) || !preg_match('/^[0-9a-f-]{36}$/i', $id)) {
        send_json(400, ['ok' => false, 'error' => 'Entreprise invalide.']);
    }

    $pdo = database();
    try {
        $pdo->beginTransaction();
        $company = $pdo->prepare('SELECT id FROM companies WHERE id = :id LIMIT 1 FOR UPDATE');
        $company->execute(['id' => $id]);
        if ($company->fetchColumn() === false) {
            $pdo->rollBack();
            send_json(404, ['ok' => false, 'error' => 'Entreprise introuvable.']);
        }

        $deleteProfiles = $pdo->prepare('DELETE FROM profiles WHERE company_id = :id');
        $deleteProfiles->execute(['id' => $id]);
        $deleteCompany = $pdo->prepare('DELETE FROM companies WHERE id = :id');
        $deleteCompany->execute(['id' => $id]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('ChantierProof company deletion failed: ' . $error->getMessage());
        send_json(503, ['ok' => false, 'error' => 'Suppression temporairement indisponible.']);
    }
    send_json(200, ['ok' => true]);
}

if ($action === 'invitations') {
    $profile = require_profile(['admin']);
    if (!is_string($profile['company_id']) || $profile['company_id'] === '') {
        send_json(403, ['ok' => false, 'error' => 'Votre compte ne dépend d’aucune entreprise.']);
    }

    if ($method === 'GET') {
        $statement = database()->prepare(
            'SELECT id, created_at, email, full_name, role, team_name, token, expires_at
             FROM user_invitations
             WHERE company_id = :company_id AND accepted_at IS NULL
             ORDER BY created_at DESC'
        );
        $statement->execute(['company_id' => $profile['company_id']]);
        send_json(200, ['ok' => true, 'invitations' => $statement->fetchAll()]);
    }

    if ($method === 'POST') {
        require_csrf_token();
        $payload = read_json_request();
        $email = $payload['email'] ?? null;
        $fullName = $payload['full_name'] ?? null;
        $role = $payload['role'] ?? null;
        $teamName = $payload['team_name'] ?? null;

        if (
            !is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)
            || !is_string($fullName) || trim($fullName) === '' || text_length(trim($fullName)) > 255
            || !is_string($role) || !in_array($role, ['technician', 'accountant', 'manager', 'admin'], true)
            || ($teamName !== null && (!is_string($teamName) || text_length(trim($teamName)) > 255))
        ) {
            send_json(400, ['ok' => false, 'error' => 'Vérifiez le nom, l’e-mail, le rôle et l’équipe.']);
        }

        $email = strtolower(trim($email));
        $teamName = is_string($teamName) && trim($teamName) !== '' ? trim($teamName) : null;
        $pdo = database();
        $profileCheck = $pdo->prepare('SELECT 1 FROM profiles WHERE email = :email LIMIT 1');
        $profileCheck->execute(['email' => $email]);
        if ($profileCheck->fetchColumn() !== false) {
            send_json(409, ['ok' => false, 'error' => 'Un compte existe déjà pour cette adresse e-mail.']);
        }

        $pendingCheck = $pdo->prepare(
            'SELECT 1 FROM user_invitations
             WHERE email = :email AND accepted_at IS NULL
               AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP(6))
             LIMIT 1'
        );
        $pendingCheck->execute(['email' => $email]);
        if ($pendingCheck->fetchColumn() !== false) {
            send_json(409, ['ok' => false, 'error' => 'Une invitation valide existe déjà pour cette adresse e-mail.']);
        }

        $invitationId = uuid_v4();
        $invitationToken = uuid_v4();
        try {
            $pdo->beginTransaction();
            $teamId = null;
            if ($teamName !== null) {
                $findTeam = $pdo->prepare(
                    'SELECT id FROM teams WHERE company_id = :company_id AND name = :name LIMIT 1 FOR UPDATE'
                );
                $findTeam->execute([
                    'company_id' => $profile['company_id'],
                    'name' => $teamName,
                ]);
                $teamId = $findTeam->fetchColumn();
                if (!is_string($teamId)) {
                    $teamId = uuid_v4();
                    $insertTeam = $pdo->prepare(
                        'INSERT INTO teams (id, name, company_id) VALUES (:id, :name, :company_id)'
                    );
                    $insertTeam->execute([
                        'id' => $teamId,
                        'name' => $teamName,
                        'company_id' => $profile['company_id'],
                    ]);
                }
            }

            $insertInvitation = $pdo->prepare(
                'INSERT INTO user_invitations
                    (id, email, full_name, role, team_id, team_name, token, invited_by, company_id, expires_at)
                 VALUES
                    (:id, :email, :full_name, :role, :team_id, :team_name, :token, :invited_by, :company_id,
                     DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 7 DAY))'
            );
            $insertInvitation->execute([
                'id' => $invitationId,
                'email' => $email,
                'full_name' => trim($fullName),
                'role' => $role,
                'team_id' => $teamId,
                'team_name' => $teamName,
                'token' => $invitationToken,
                'invited_by' => $profile['id'],
                'company_id' => $profile['company_id'],
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($error instanceof PDOException && $error->getCode() === '23000') {
                send_json(409, ['ok' => false, 'error' => 'Cette équipe ou cette invitation existe déjà. Actualisez la page puis réessayez.']);
            }
            error_log('ChantierProof collaborator invitation failed: ' . $error->getMessage());
            send_json(503, ['ok' => false, 'error' => 'Création de l’invitation temporairement indisponible.']);
        }

        send_json(201, [
            'ok' => true,
            'invitation' => [
                'id' => $invitationId,
                'token' => $invitationToken,
                'email' => $email,
                'expires_at' => (new DateTimeImmutable('+7 days', new DateTimeZone('UTC')))->format('Y-m-d H:i:s'),
            ],
        ]);
    }

    if ($method === 'DELETE') {
        require_csrf_token();
        $payload = read_json_request();
        $id = $payload['id'] ?? null;
        if (!is_string($id) || !preg_match('/^[0-9a-f-]{36}$/i', $id)) {
            send_json(400, ['ok' => false, 'error' => 'Invitation invalide.']);
        }

        $delete = database()->prepare(
            'DELETE FROM user_invitations
             WHERE id = :id AND company_id = :company_id AND accepted_at IS NULL'
        );
        $delete->execute([
            'id' => $id,
            'company_id' => $profile['company_id'],
        ]);
        if ($delete->rowCount() !== 1) {
            send_json(404, ['ok' => false, 'error' => 'Invitation introuvable ou déjà utilisée.']);
        }
        send_json(200, ['ok' => true]);
    }

    header('Allow: GET, POST, DELETE');
    send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
}

if ($action === 'accounting-requests') {
    if ($method === 'GET') {
        $profile = require_profile(['admin', 'accountant']);
        if (!is_string($profile['company_id']) || $profile['company_id'] === '') {
            send_json(403, ['ok' => false, 'error' => 'Votre compte ne dépend d’aucune entreprise.']);
        }
        $status = $_GET['status'] ?? 'all';
        if (!is_string($status) || !in_array($status, ['all', 'pending', 'processed'], true)) {
            send_json(400, ['ok' => false, 'error' => 'Filtre de comptabilité invalide.']);
        }
        $sql = 'SELECT r.id, r.created_at, r.status, r.pdf_url,
                       v.id AS validation_id, v.client_name, v.intervention_title, v.intervention_price
                FROM accounting_requests r
                INNER JOIN validations v ON v.id = r.validation_id
                WHERE v.company_id = :company_id';
        $parameters = ['company_id' => $profile['company_id']];
        if ($status !== 'all') {
            $sql .= ' AND r.status = :status';
            $parameters['status'] = $status;
        }
        try {
            $sql .= ' ORDER BY r.created_at DESC';
            $statement = database()->prepare($sql);
            $statement->execute($parameters);
            $rows = array_map(static function (array $row): array {
                return [
                    'id' => $row['id'],
                    'created_at' => $row['created_at'],
                    'status' => $row['status'],
                    'pdf_url' => $row['pdf_url'],
                    'validation' => [
                        'id' => $row['validation_id'],
                        'client_name' => $row['client_name'],
                        'intervention_title' => $row['intervention_title'],
                        'intervention_price' => $row['intervention_price'],
                    ],
                ];
            }, $statement->fetchAll());
            send_json(200, ['ok' => true, 'requests' => $rows]);
        } catch (Throwable $error) {
            error_log('ChantierProof accounting request listing failed: ' . $error->getMessage());
            send_json(503, ['ok' => false, 'error' => 'La liste comptable est temporairement indisponible.']);
        }
    }

    if ($method === 'PATCH') {
        require_csrf_token();
        $profile = require_profile(['admin', 'accountant']);
        if (!is_string($profile['company_id']) || $profile['company_id'] === '') {
            send_json(403, ['ok' => false, 'error' => 'Votre compte ne dépend d’aucune entreprise.']);
        }
        $payload = read_json_request();
        $requestId = $payload['id'] ?? null;
        if (!is_string($requestId) || !preg_match('/^[0-9a-f-]{36}$/i', $requestId)) {
            send_json(400, ['ok' => false, 'error' => 'Demande comptable invalide.']);
        }
        try {
            $statement = database()->prepare(
                'UPDATE accounting_requests r
                 INNER JOIN validations v ON v.id = r.validation_id
                 SET r.status = :processed, r.processed_at = CURRENT_TIMESTAMP(6), r.processed_by = :user_id
                 WHERE r.id = :id AND r.status = :pending AND v.company_id = :company_id'
            );
            $statement->execute([
                'processed' => 'processed',
                'user_id' => $profile['id'],
                'id' => $requestId,
                'pending' => 'pending',
                'company_id' => $profile['company_id'],
            ]);
            if ($statement->rowCount() !== 1) {
                send_json(409, ['ok' => false, 'error' => 'Demande introuvable ou déjà traitée.']);
            }
            send_json(200, ['ok' => true]);
        } catch (Throwable $error) {
            error_log('ChantierProof accounting request update failed: ' . $error->getMessage());
            send_json(503, ['ok' => false, 'error' => 'Le traitement comptable est temporairement indisponible.']);
        }
    }

    header('Allow: GET, PATCH');
    send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
}

if ($action === 'accounting-request') {
    if ($method !== 'POST') {
        header('Allow: POST');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }
    require_csrf_token();
    $id = $_POST['id'] ?? '';
    if (!is_string($id) || !preg_match('/^[0-9a-f-]{36}$/i', $id)) {
        send_json(400, ['ok' => false, 'error' => 'Validation invalide.']);
    }
    $row = validation_by_id($id);
    if (
        $row === null || $row['status'] !== 'signed'
        || ($row['validation_link_expires_at'] !== null
            && strtotime($row['validation_link_expires_at']) <= time())
    ) {
        send_json(404, ['ok' => false, 'error' => 'Validation introuvable ou expirée.']);
    }
    try {
        $existing = database()->prepare('SELECT id FROM accounting_requests WHERE validation_id = :id LIMIT 1');
        $existing->execute(['id' => $id]);
        if ($existing->fetchColumn() !== false) {
            send_json(409, ['ok' => false, 'error' => 'Cette validation a déjà été envoyée à la comptabilité.']);
        }
    } catch (Throwable $error) {
        error_log('ChantierProof accounting duplicate check failed: ' . $error->getMessage());
        send_json(503, ['ok' => false, 'error' => 'Vérification comptable temporairement indisponible.']);
    }

    $file = $_FILES['pdf'] ?? null;
    if (
        !is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
        || !is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name'])
        || !is_int($file['size'] ?? null) || $file['size'] < 8 || $file['size'] > 8 * 1024 * 1024
    ) {
        send_json(413, ['ok' => false, 'error' => 'Le PDF est absent, invalide ou dépasse 8 Mo.']);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $signature = file_get_contents($file['tmp_name'], false, null, 0, 5);
    if ($mime !== 'application/pdf' || $signature !== '%PDF-') {
        send_json(415, ['ok' => false, 'error' => 'Le fichier transmis doit être un PDF valide.']);
    }

    $relativePath = 'validations/' . $id . '/preuve-' . bin2hex(random_bytes(12)) . '.pdf';
    $storedPath = store_upload('pdf', $relativePath);
    $pdo = database();
    try {
        $pdo->beginTransaction();
        $update = $pdo->prepare(
            'UPDATE validations
             SET pdf_url = :pdf_url, accounting_status = :accounting_status,
                 sent_to_accounting_at = CURRENT_TIMESTAMP(6)
             WHERE id = :id AND status = :signed_status
               AND (validation_link_expires_at IS NULL OR validation_link_expires_at > CURRENT_TIMESTAMP(6))'
        );
        $update->execute([
            'pdf_url' => $storedPath,
            'accounting_status' => 'sent_to_accounting',
            'id' => $id,
            'signed_status' => 'signed',
        ]);
        if ($update->rowCount() !== 1) {
            $pdo->rollBack();
            unlink(storage_directory() . '/' . $storedPath);
            send_json(409, ['ok' => false, 'error' => 'La validation a expiré ou a déjà été envoyée.']);
        }
        $insert = $pdo->prepare(
            'INSERT INTO accounting_requests (id, validation_id, pdf_url, status)
             VALUES (:id, :validation_id, :pdf_url, :status)'
        );
        $insert->execute([
            'id' => uuid_v4(),
            'validation_id' => $id,
            'pdf_url' => $storedPath,
            'status' => 'pending',
        ]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (is_file(storage_directory() . '/' . $storedPath)) {
            unlink(storage_directory() . '/' . $storedPath);
        }
        error_log('ChantierProof accounting request creation failed: ' . $error->getMessage());
        send_json(503, ['ok' => false, 'error' => 'Envoi à la comptabilité temporairement indisponible.']);
    }
    send_json(201, ['ok' => true]);
}

if ($action === 'validations') {
    $profile = require_profile();

    if ($method === 'GET') {
        $status = $_GET['status'] ?? 'all';
        $offset = filter_var($_GET['offset'] ?? '0', FILTER_VALIDATE_INT);
        $limit = filter_var($_GET['limit'] ?? '50', FILTER_VALIDATE_INT);

        if (
            !is_string($status)
            || !in_array($status, ['all', 'pending', 'signed', 'dispute'], true)
            || $offset === false
            || $offset < 0
            || $limit === false
            || $limit < 1
            || $limit > 100
        ) {
            send_json(400, ['ok' => false, 'error' => 'Filtres de validation invalides.']);
        }

        $conditions = [];
        $parameters = [];
        if ($profile['role'] !== 'super_admin') {
            if ($profile['company_id'] === null) {
                $conditions[] = 'company_id IS NULL';
            } else {
                $conditions[] = 'company_id = :company_id';
                $parameters['company_id'] = $profile['company_id'];
            }
        }
        if ($status !== 'all') {
            $conditions[] = 'status = :status';
            $parameters['status'] = $status;
        }

        $where = $conditions === [] ? '' : ' WHERE ' . implode(' AND ', $conditions);
        $count = database()->prepare('SELECT COUNT(*) FROM validations' . $where);
        $count->execute($parameters);
        $total = (int) $count->fetchColumn();

        $query = database()->prepare(
            'SELECT id, created_at, client_name, intervention_title, intervention_price,
                    status, signed_at, accounting_status
             FROM validations' . $where . '
             ORDER BY created_at DESC
             LIMIT :limit OFFSET :offset'
        );
        foreach ($parameters as $key => $value) {
            $query->bindValue(':' . $key, $value, PDO::PARAM_STR);
        }
        $query->bindValue(':limit', $limit, PDO::PARAM_INT);
        $query->bindValue(':offset', $offset, PDO::PARAM_INT);
        $query->execute();

        send_json(200, ['ok' => true, 'rows' => $query->fetchAll(), 'total' => $total]);
    }

    if ($method === 'POST') {
        require_csrf_token();
        if (!in_array($profile['role'], ['admin', 'manager', 'technician', 'super_admin'], true)) {
            send_json(403, ['ok' => false, 'error' => 'Vous ne pouvez pas créer de validation.']);
        }

        $payload = read_json_request();
        $clientName = $payload['client_name'] ?? null;
        $clientPhone = $payload['client_phone'] ?? null;
        $title = $payload['intervention_title'] ?? null;
        $price = $payload['intervention_price'] ?? null;

        if (
            !is_string($clientName) || trim($clientName) === '' || text_length(trim($clientName)) > 255
            || !is_string($title) || trim($title) === '' || text_length(trim($title)) > 500
            || ($clientPhone !== null && (!is_string($clientPhone) || text_length($clientPhone) > 80))
            || ($price !== null && (!is_numeric($price) || (float) $price < 0 || (float) $price > 9999999999.99))
        ) {
            send_json(400, ['ok' => false, 'error' => 'Les informations de la validation sont invalides.']);
        }

        $id = uuid_v4();
        $insert = database()->prepare(
            'INSERT INTO validations
                (id, client_name, client_phone, intervention_title, intervention_price,
                 created_by, company_id)
             VALUES
                (:id, :client_name, :client_phone, :intervention_title, :intervention_price,
                 :created_by, :company_id)'
        );
        $insert->execute([
            'id' => $id,
            'client_name' => trim($clientName),
            'client_phone' => is_string($clientPhone) && trim($clientPhone) !== '' ? trim($clientPhone) : null,
            'intervention_title' => trim($title),
            'intervention_price' => $price === null || $price === '' ? null : $price,
            'created_by' => $profile['id'],
            'company_id' => $profile['role'] === 'super_admin' ? null : $profile['company_id'],
        ]);

        send_json(201, ['ok' => true, 'id' => $id]);
    }

    header('Allow: GET, POST');
    send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
}

if ($action === 'signed-month-count') {
    if ($method !== 'GET') {
        header('Allow: GET');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }

    $profile = require_profile();
    $conditions = [
        'status = :status',
        'signed_at >= :month_start',
        'signed_at < :next_month',
    ];
    $parameters = [
        'status' => 'signed',
        'month_start' => gmdate('Y-m-01 00:00:00'),
        'next_month' => (new DateTimeImmutable('first day of next month', new DateTimeZone('UTC')))
            ->format('Y-m-01 00:00:00'),
    ];
    if ($profile['role'] !== 'super_admin') {
        if ($profile['company_id'] === null) {
            $conditions[] = 'company_id IS NULL';
        } else {
            $conditions[] = 'company_id = :company_id';
            $parameters['company_id'] = $profile['company_id'];
        }
    }

    $statement = database()->prepare(
        'SELECT COUNT(*) FROM validations WHERE ' . implode(' AND ', $conditions)
    );
    $statement->execute($parameters);
    send_json(200, ['ok' => true, 'count' => (int) $statement->fetchColumn()]);
}

if ($action === 'public-validation') {
    if ($method !== 'GET') {
        header('Allow: GET');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }

    $id = $_GET['id'] ?? '';
    if (!is_string($id) || !preg_match('/^[0-9a-f-]{36}$/i', $id)) {
        send_json(400, ['ok' => false, 'error' => 'Lien de validation invalide.']);
    }

    $row = validation_by_id($id);
    if (
        $row === null
        || !in_array($row['status'], ['pending', 'signed'], true)
        || ($row['validation_link_expires_at'] !== null
            && strtotime($row['validation_link_expires_at']) <= time())
    ) {
        send_json(404, ['ok' => false, 'error' => 'Validation introuvable ou expirée.']);
    }

    send_json(200, [
        'ok' => true,
        'validation' => [
            'id' => $row['id'],
            'client_name' => $row['client_name'],
            'client_phone' => $row['client_phone'],
            'intervention_title' => $row['intervention_title'],
            'intervention_price' => $row['intervention_price'],
            'gps_position' => $row['gps_position'],
            'status' => $row['status'],
            'accounting_status' => $row['accounting_status'],
            'photo_before_url' => $row['photo_before_url'],
            'photo_after_url' => $row['photo_after_url'],
            'signature_png_url' => $row['signature_png_url'],
            'technician_name' => $row['technician_name'],
            'technician_notes' => $row['technician_notes'],
            'signer_name' => $row['signer_name'],
            'signed_at' => $row['signed_at'],
            'validation_link_expires_at' => $row['validation_link_expires_at'],
        ],
    ]);
}

if ($action === 'validation-detail') {
    if ($method !== 'GET') {
        header('Allow: GET');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }

    $profile = require_profile();
    $id = $_GET['id'] ?? '';
    if (!is_string($id) || !preg_match('/^[0-9a-f-]{36}$/i', $id)) {
        send_json(400, ['ok' => false, 'error' => 'Lien de détail invalide.']);
    }

    $row = validation_by_id($id);
    if (
        $row === null
        || (
            $profile['role'] !== 'super_admin'
            && (string) $profile['company_id'] !== (string) $row['company_id']
        )
    ) {
        send_json(404, ['ok' => false, 'error' => 'Validation introuvable.']);
    }

    unset($row['company_id']);
    send_json(200, ['ok' => true, 'validation' => $row]);
}

if ($action === 'seal-validation') {
    if ($method !== 'POST') {
        header('Allow: POST');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }

    require_csrf_token();
    $id = $_POST['id'] ?? '';
    $technician = $_POST['technician_name'] ?? '';
    $gps = $_POST['gps_position'] ?? '';
    $notes = $_POST['technician_notes'] ?? '';
    $signer = $_POST['signer_name'] ?? '';
    $consent = $_POST['consent'] ?? '';

    if (
        !is_string($id) || !preg_match('/^[0-9a-f-]{36}$/i', $id)
        || !is_string($technician) || trim($technician) === '' || text_length(trim($technician)) > 255
        || !is_string($gps) || trim($gps) === '' || text_length(trim($gps)) > 500
        || !is_string($notes) || text_length($notes) > 10000
        || !is_string($signer) || trim($signer) === '' || text_length(trim($signer)) > 255
        || $consent !== '1'
    ) {
        send_json(400, ['ok' => false, 'error' => 'Les champs obligatoires de validation sont invalides.']);
    }

    $row = validation_by_id($id);
    if (
        $row === null
        || $row['status'] !== 'pending'
        || ($row['validation_link_expires_at'] !== null
            && strtotime($row['validation_link_expires_at']) <= time())
    ) {
        send_json(409, ['ok' => false, 'error' => 'Ce lien n’est plus valide ou a déjà été utilisé.']);
    }

    $prefix = 'validations/' . $id . '/' . bin2hex(random_bytes(12));
    $storedPaths = [];
    validate_upload('photo_before', ['image/jpeg'], 10 * 1024 * 1024);
    validate_upload('photo_after', ['image/jpeg'], 10 * 1024 * 1024);
    validate_upload('signature', ['image/png'], 2 * 1024 * 1024);
    try {
        $storedPaths[] = store_upload('photo_before', $prefix . '-before.jpg');
        $storedPaths[] = store_upload('photo_after', $prefix . '-after.jpg');
        $storedPaths[] = store_upload('signature', $prefix . '-signature.png');

        $update = database()->prepare(
            'UPDATE validations
             SET status = :status,
                 photo_before_url = :photo_before_url,
                 photo_after_url = :photo_after_url,
                 signature_png_url = :signature_png_url,
                 technician_name = :technician_name,
                 gps_position = :gps_position,
                 technician_notes = :technician_notes,
                 signer_name = :signer_name,
                 signed_at = CURRENT_TIMESTAMP(6)
             WHERE id = :id
               AND status = :pending_status
               AND (validation_link_expires_at IS NULL OR validation_link_expires_at > CURRENT_TIMESTAMP(6))'
        );
        $update->execute([
            'status' => 'signed',
            'photo_before_url' => $storedPaths[0],
            'photo_after_url' => $storedPaths[1],
            'signature_png_url' => $storedPaths[2],
            'technician_name' => trim($technician),
            'gps_position' => trim($gps),
            'technician_notes' => trim($notes) === '' ? null : trim($notes),
            'signer_name' => trim($signer),
            'id' => $id,
            'pending_status' => 'pending',
        ]);

        if ($update->rowCount() !== 1) {
            foreach ($storedPaths as $storedPath) {
                @unlink(storage_directory() . '/' . $storedPath);
            }
            send_json(409, ['ok' => false, 'error' => 'Cette validation a déjà été envoyée.']);
        }
    } catch (Throwable $error) {
        foreach ($storedPaths as $storedPath) {
            $filePath = storage_directory() . '/' . $storedPath;
            if (is_file($filePath)) {
                unlink($filePath);
            }
        }
        throw $error;
    }

    send_json(200, ['ok' => true, 'id' => $id]);
}

if ($action === 'asset') {
    if ($method !== 'GET') {
        header('Allow: GET');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }

    $path = $_GET['path'] ?? '';
    if (
        !is_string($path)
        || !preg_match('#^validations/[0-9a-f-]{36}/[A-Za-z0-9_-]+\.(?:jpg|png|pdf)$#i', $path)
    ) {
        send_json(400, ['ok' => false, 'error' => 'Fichier invalide.']);
    }

    $pathColumn = null;
    foreach (['photo_before_url', 'photo_after_url', 'signature_png_url', 'pdf_url'] as $column) {
        $statement = database()->prepare("SELECT id, status, validation_link_expires_at, company_id FROM validations WHERE {$column} = :path LIMIT 1");
        $statement->execute(['path' => $path]);
        $assetRow = $statement->fetch();
        if (is_array($assetRow)) {
            $pathColumn = $column;
            break;
        }
    }
    if (!is_array($assetRow ?? null)) {
        $statement = database()->prepare(
            'SELECT v.id, v.status, v.validation_link_expires_at, v.company_id
             FROM accounting_requests ar
             INNER JOIN validations v ON v.id = ar.validation_id
             WHERE ar.pdf_url = :path
             LIMIT 1'
        );
        $statement->execute(['path' => $path]);
        $assetRow = $statement->fetch();
        if (is_array($assetRow)) {
            $pathColumn = 'accounting_requests.pdf_url';
        }
    }
    if (!is_array($assetRow ?? null)) {
        send_json(404, ['ok' => false, 'error' => 'Fichier introuvable.']);
    }

    $isPublic = in_array($assetRow['status'], ['pending', 'signed'], true)
        && ($assetRow['validation_link_expires_at'] === null
            || strtotime($assetRow['validation_link_expires_at']) > time())
        && in_array($pathColumn, ['photo_before_url', 'photo_after_url', 'signature_png_url'], true);

    if (!$isPublic) {
        $profile = require_profile();
        if (
            $profile['role'] !== 'super_admin'
            && (string) $profile['company_id'] !== (string) $assetRow['company_id']
        ) {
            send_json(403, ['ok' => false, 'error' => 'Accès au fichier refusé.']);
        }
    }

    $filePath = storage_directory() . '/' . $path;
    if (!is_file($filePath) || !is_readable($filePath)) {
        send_json(404, ['ok' => false, 'error' => 'Fichier introuvable.']);
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($filePath);
    if (!is_string($mime) || !in_array($mime, ['image/jpeg', 'image/png', 'application/pdf'], true)) {
        send_json(415, ['ok' => false, 'error' => 'Format de fichier non autorisé.']);
    }

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string) filesize($filePath));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store');
    readfile($filePath);
    exit;
}

if ($action === 'logout') {
    if ($method !== 'POST') {
        header('Allow: POST');
        send_json(405, ['ok' => false, 'error' => 'Method not allowed.']);
    }

    require_csrf_token();
}

$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $cookie = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 42000,
        'path' => $cookie['path'],
        'domain' => $cookie['domain'],
        'secure' => $cookie['secure'],
        'httponly' => $cookie['httponly'],
        'samesite' => $cookie['samesite'] ?? 'Lax',
    ]);
}

session_destroy();
send_json(200, ['ok' => true]);
