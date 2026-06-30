# ChantierProof

MVP HTML/CSS/JavaScript vanilla pour valider une intervention terrain avec photos, signature et scellement Supabase.

## Configuration

Le projet est statique, donc le navigateur ne lit pas `.env` directement.
La configuration chargee par l'app est `lib/config.js`.

Option recommandee :

1. Renseigner `.env`.
2. Generer `lib/config.js` :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate-config.ps1
```

Variables attendues :

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_STORAGE_BUCKET=validation-assets
PUBLIC_SITE_URL=https://your-public-site.example
```

`PUBLIC_SITE_URL` doit etre l'adresse publique de l'application, sans slash final. Supabase l'utilise pour ramener l'utilisateur sur `login.html` apres la confirmation email.

## Pages

- `index.html`
- `dashboard.html`
- `v/validation.html?id=<uuid>`
- `v/success.html?id=<uuid>`

## Librairies CDN

- Supabase JS : base de données et storage.
- Lucide : icônes SVG légères.
- QRCode.js : QR code du lien de validation côté dashboard.
