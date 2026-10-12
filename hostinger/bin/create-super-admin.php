<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli' || !stream_isatty(STDIN)) {
    fwrite(STDERR, "Run this setup command from an interactive SSH terminal.\n");
    exit(1);
}

require dirname(__DIR__) . '/api/bootstrap.php';

function prompt_line(string $label): string
{
    fwrite(STDOUT, $label);
    $value = fgets(STDIN);
    if ($value === false) {
        throw new RuntimeException('Unable to read terminal input.');
    }

    return trim($value);
}

function prompt_password(string $label): string
{
    fwrite(STDOUT, $label);
    exec('stty -echo', $output, $exitCode);
    if ($exitCode !== 0) {
        throw new RuntimeException('Unable to disable terminal echo for password input.');
    }

    try {
        $password = fgets(STDIN);
    } finally {
        exec('stty echo', $output, $restoreExitCode);
        fwrite(STDOUT, PHP_EOL);
    }

    if ($restoreExitCode !== 0) {
        throw new RuntimeException('Unable to restore terminal echo.');
    }

    if ($password === false) {
        throw new RuntimeException('Unable to read password input.');
    }

    return rtrim($password, "\r\n");
}

try {
    $email = strtolower(prompt_line('Super Admin email: '));
    $fullName = prompt_line('Nom complet: ');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $fullName === '' || strlen($fullName) > 255) {
        throw new InvalidArgumentException('Email or full name is invalid.');
    }

    $password = prompt_password('Mot de passe (12 caracteres minimum): ');
    if (strlen($password) < 12 || strlen($password) > 4096) {
        throw new InvalidArgumentException('Password must contain between 12 and 4096 characters.');
    }

    $pdo = database();
    $exists = $pdo->prepare('SELECT 1 FROM profiles WHERE email = :email LIMIT 1');
    $exists->execute(['email' => $email]);
    if ($exists->fetchColumn() !== false) {
        throw new RuntimeException('A profile already exists for this email address.');
    }

    $insert = $pdo->prepare(
        'INSERT INTO profiles (id, email, full_name, role, password_hash, password_set_at)
         VALUES (:id, :email, :full_name, :role, :password_hash, CURRENT_TIMESTAMP(6))'
    );
    $insert->execute([
        'id' => uuid_v4(),
        'email' => $email,
        'full_name' => $fullName,
        'role' => 'super_admin',
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
    ]);

    fwrite(STDOUT, "Super Admin created successfully.\n");
} catch (Throwable $error) {
    fwrite(STDERR, 'Super Admin creation failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
