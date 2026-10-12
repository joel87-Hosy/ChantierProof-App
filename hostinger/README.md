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

## Importing the archived demo tenant

The `bin/import-supabase-demo.php` command imports the five Supabase CSV exports
and their referenced files into a separate active `proof-demo` company. Since
the Supabase company and subscription exports were empty, the importer creates
the demo company and does not invent a subscription. It keeps imported profile,
team, validation, invitation, and accounting identifiers, assigns them to the
new company, and refuses to overwrite any existing company, email, or row.
Exported `super_admin` roles are reduced to `admin`, and duplicate team names
are disambiguated with a numeric suffix. Profile passwords are not present in
the CSV exports, so each imported account receives a private, one-time
password-reset link valid for 24 hours.

Transfer the `CSV`, `profile-avatars`, and `validation-assets` directories from
the backup to a private directory on the VPS. Do not put the archive under the
website document root or commit it to Git. Then run a dry run before applying:

```bash
sudo install -d -o root -g root -m 0700 /var/lib/chantierproof/import/source
sudo unzip -q /tmp/proof-demo-import.zip -d /var/lib/chantierproof/import/source
sudo find /var/lib/chantierproof/import/source -type d -exec chmod 0700 {} \;
sudo find /var/lib/chantierproof/import/source -type f -exec chmod 0600 {} \;
cd /tmp/chantierproof-hostinger-release
sudo php hostinger/bin/import-supabase-demo.php \
  --source=/var/lib/chantierproof/import/source \
  --base-url=https://staging.suitepilot.io \
  --dry-run
```

Only if the dry run passes, rerun the same command without `--dry-run`.
The database changes are transactional; media files copied during a failed run
are removed. The password-reset manifest is written outside the web root with
permissions restricted to its owner at
`/var/lib/chantierproof/import/proof-demo-password-reset-links.txt`. Retrieve
it through the private VPS console, give each link only to its matching
account owner, and remove the manifest after both accounts have set a password.
Do not paste the links into chat or expose them in a public directory.

## Not ready for public cutover

Login, invitations, company and collaborator management, profile editing,
private avatars, validation, PDF generation and storage, and the accounting
queue now use the Hostinger API. Password reset uses one-use links generated
by a company admin and transmitted manually; no SMTP configuration is
required. Keep Supabase and the public domain unchanged until the imported
tenant's accounts, validations, files, accounting queue, and password-reset
links have been verified on staging and the user explicitly approves cutover.

The archived Supabase data is imported only into the isolated `proof-demo`
tenant. The pre-existing Hostinger company remains separate and unchanged.
