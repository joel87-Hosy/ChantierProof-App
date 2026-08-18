-- 1. Cree d'abord ton utilisateur dans Supabase Auth avec ton email.
-- 2. Remplace l'email ci-dessous, puis execute ce script apres add_saas_multi_tenant.sql.

insert into public.profiles (
  id,
  email,
  full_name,
  role,
  company_id
)
select
  auth.users.id,
  auth.users.email,
  coalesce(auth.users.raw_user_meta_data ->> 'full_name', 'Super Admin ChantierProof'),
  'super_admin',
  null
from auth.users
where lower(auth.users.email) = lower('TON_EMAIL_SUPER_ADMIN@EXEMPLE.COM')
on conflict (id) do update set
  role = excluded.role,
  company_id = null,
  email = excluded.email;
