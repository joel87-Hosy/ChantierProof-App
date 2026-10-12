# Hostinger migration

The API reads its database credentials from `/etc/chantierproof/config.php`.
Keep that file outside the public web root and restrict it to the web-server
account. Start from `config.example.php`; never commit real credentials.
The PHP runtime must have both `PDO` and the `pdo_mysql` driver enabled.
On the current Ubuntu 22.04/PHP 8.1 server, install the driver with
`sudo apt install php8.1-mysql` if `php -m` does not list `pdo_mysql`, then
restart PHP-FPM with `sudo systemctl restart php8.1-fpm`.

## Current migration milestone

The API currently provides:

- `GET /api/index.php` for the database health check.
- `GET /api/index.php?action=session` for the current profile and a CSRF token.
- `PATCH /api/index.php?action=profile` for the authenticated user's full name
  and team name, and `GET`/`POST /api/index.php?action=profile-avatar` for
  private avatar retrieval and upload.
- `GET /api/index.php?action=company-users` and
  `POST /api/index.php?action=password-reset-link` for company-admin user
  listing and generation of a one-use, one-hour password-reset link.
  `GET`/`POST /api/index.php?action=password-reset` validates the link and
  changes the password; links are transmitted manually, without email.
- `POST /api/index.php?action=login` and `POST /api/index.php?action=logout`
  for PHP-session authentication.
- `GET /api/index.php?action=companies`, `POST /api/index.php?action=companies`,
  `PATCH /api/index.php?action=company-status`, and
  `DELETE /api/index.php?action=company-delete` for Super Admin company
  management. New companies receive an admin invitation valid for seven days.
- `GET /api/index.php?action=invitation&token=<uuid>&email=<email>` to check
  an invitation and `POST /api/index.php?action=accept-invitation` to set the
  password and activate the invited account.
- `GET`/`POST`/`DELETE /api/index.php?action=invitations` for company-admin
  collaborator invitations. These are restricted to the admin's own company
  and expire after seven days.
- `GET`/`POST /api/index.php?action=validations` to list and create
  company-scoped validations.
- `GET /api/index.php?action=public-validation&id=<uuid>` and
  `POST /api/index.php?action=seal-validation` for public field completion.
- `GET /api/index.php?action=validation-detail&id=<uuid>` for authenticated
  validation details and `GET /api/index.php?action=asset&path=<path>` for
  authorized private validation files.
- `POST /api/index.php?action=accounting-request` stores a generated PDF and
  creates a company accounting request from an active, signed validation link.
  `GET`/`PATCH /api/index.php?action=accounting-requests` provides the
  company-scoped accounting queue and processing action to admins/accountants.

Login checks `profiles.password_hash` using PHP's password verifier. Session
cookies are HttpOnly, SameSite=Lax, and Secure when served over HTTPS. State
changing requests require the CSRF token returned by the session endpoint.
Validation photos and signatures are kept outside the website document root
under `/var/lib/chantierproof/storage` and are only served after checking their
database reference and access policy. Profile avatars use the same private
storage root and are served only to their signed-in owner.

The public field form compresses photos to JPEG before upload. PHP-FPM must
allow three files and a request of at least 24 MB, for example
`upload_max_filesize = 10M` and `post_max_size = 24M`. The public Nginx
server block must also allow at least 24 MB with `client_max_body_size 24m`.
Create the private storage directory for the PHP-FPM user:

```bash
sudo install -d -o www-data -g www-data -m 750 /var/lib/chantierproof/storage
```

Create the first Hostinger Super Admin from an SSH terminal after uploading
the project and configuring the database:

```bash
php /path/to/project/hostinger/bin/create-super-admin.php
```

The script prompts for the account details and reads the password without
echoing it. Use a unique password of at least 12 characters.

When updating an existing Hostinger database, apply the SQL in
`migrations/001-invitation-expiration.sql` once to add invitation expiry
support. For a new database, `schema.sql` already includes this column.

## Not ready for public cutover

Login, invitations, company and collaborator management, profile editing,
private avatars, validation, PDF generation and storage, and the accounting
queue now use the Hostinger API. Password reset uses one-use links generated
by a company admin and transmitted manually; no SMTP configuration is
required. The app has been tested incrementally on the staging subdomain, but
each newly migrated workflow still needs its staging acceptance test before
public cutover. Keep Supabase and the public domain unchanged until the user
explicitly approves cutover.

The migration is intentionally starting with an empty Hostinger database;
existing Supabase data remains untouched. Previously downloaded Supabase
storage backups are not yet registered in the Hostinger database or served by
the application.
