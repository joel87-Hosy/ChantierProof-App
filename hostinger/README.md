# Hostinger backend setup

The API reads its database credentials from `/etc/chantierproof/config.php`.
Keep that file outside the public web root and restrict it to the web-server
account. Start from `config.example.php`; never commit real credentials.
The PHP runtime must have both `PDO` and the `pdo_mysql` driver enabled.
On the current Ubuntu 22.04/PHP 8.1 server, install the driver with
`sudo apt install php8.1-mysql` if `php -m` does not list `pdo_mysql`, then
restart PHP-FPM with `sudo systemctl restart php8.1-fpm`.

The initial API endpoint is `GET /api/index.php`. It returns only
`{"ok":true}` when MariaDB is reachable and does not disclose connection
details. Other HTTP methods are rejected.

This is only the first migration step. The current frontend still uses Supabase
for authentication, data, and file storage; do not disable or delete Supabase
until the API, account reset flow, data migration, and file migration have
been implemented and verified.
