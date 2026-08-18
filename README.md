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
- `super-admin.html`
- `v/validation.html?id=<uuid>`
- `v/success.html?id=<uuid>`
- `conditions-utilisation.html`
- `politique-confidentialite.html`
- `mentions-legales.html`
- `faq.html`

## SaaS multi-entreprises

Pour activer le back-office global et l'isolation multi-tenant :

1. Executer `supabase/add_saas_multi_tenant.sql` dans Supabase SQL Editor.
2. Creer ton utilisateur dans Supabase Auth.
3. Remplacer l'email dans `supabase/promote_super_admin.sql`, puis executer le script.
4. Te connecter sur `login.html` : le role `super_admin` redirige vers `super-admin.html`.

Le Super Admin cree une entreprise cliente et genere le lien d'activation de son admin entreprise. Les donnees metier sont ensuite rattachees a `company_id`.

## Librairies CDN

- Supabase JS : base de données et storage.
- Lucide : icônes SVG légères.
- QRCode.js : QR code du lien de validation côté dashboard.
