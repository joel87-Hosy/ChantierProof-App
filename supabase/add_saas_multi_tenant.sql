create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'company_status') then
    create type public.company_status as enum ('trial', 'active', 'suspended', 'cancelled');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_plan') then
    create type public.subscription_plan as enum ('free', 'starter', 'pro', 'enterprise');
  end if;
end $$;

alter type public.app_role add value if not exists 'super_admin';

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  legal_name text,
  email text,
  phone text,
  address text,
  logo_url text,
  status public.company_status not null default 'trial',
  storage_quota_mb integer not null default 1024,
  chantier_quota integer not null default 100,
  user_quota integer not null default 10
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan public.subscription_plan not null default 'starter',
  monthly_price_cents integer not null default 0,
  currency char(3) not null default 'XOF',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true
);

alter table public.profiles
  add column if not exists company_id uuid references public.companies(id) on delete set null;

alter table public.teams
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

alter table public.user_invitations
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

alter table public.validations
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

create index if not exists companies_status_idx on public.companies(status);
create index if not exists subscriptions_company_id_idx on public.subscriptions(company_id);
create index if not exists profiles_company_id_idx on public.profiles(company_id);
create index if not exists teams_company_id_idx on public.teams(company_id);
create index if not exists user_invitations_company_id_idx on public.user_invitations(company_id);
create index if not exists validations_company_id_created_at_idx on public.validations(company_id, created_at desc);

alter table public.teams drop constraint if exists teams_name_key;
create unique index if not exists teams_company_name_unique_idx
  on public.teams(company_id, lower(name));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_companies_updated_at on public.companies;
create trigger touch_companies_updated_at
before update on public.companies
for each row execute function public.touch_updated_at();

create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role()::text = 'super_admin', false)
$$;

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role()::text in ('admin', 'super_admin'), false)
$$;

create or replace function public.apply_current_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null and auth.uid() is not null then
    new.company_id := public.current_company_id();
  end if;

  return new;
end;
$$;

drop trigger if exists set_validation_company_id on public.validations;
create trigger set_validation_company_id
before insert on public.validations
for each row execute function public.apply_current_company_id();

drop trigger if exists set_team_company_id on public.teams;
create trigger set_team_company_id
before insert on public.teams
for each row execute function public.apply_current_company_id();

drop trigger if exists set_invitation_company_id on public.user_invitations;
create trigger set_invitation_company_id
before insert on public.user_invitations
for each row execute function public.apply_current_company_id();

create or replace function public.create_company_with_admin_invite(
  p_company_name text,
  p_legal_name text,
  p_company_email text,
  p_phone text,
  p_address text,
  p_plan public.subscription_plan,
  p_monthly_price_cents integer,
  p_admin_full_name text,
  p_admin_email text
)
returns table (
  company_id uuid,
  invitation_id uuid,
  invitation_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_invitation_id uuid;
  v_token uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Access denied';
  end if;

  insert into public.companies (name, legal_name, email, phone, address, status)
  values (
    nullif(trim(p_company_name), ''),
    nullif(trim(p_legal_name), ''),
    nullif(trim(p_company_email), ''),
    nullif(trim(p_phone), ''),
    nullif(trim(p_address), ''),
    'active'
  )
  returning id into v_company_id;

  insert into public.subscriptions (company_id, plan, monthly_price_cents)
  values (v_company_id, coalesce(p_plan, 'starter'), coalesce(p_monthly_price_cents, 0));

  insert into public.user_invitations (
    company_id,
    email,
    full_name,
    role,
    team_name,
    invited_by
  )
  values (
    v_company_id,
    lower(trim(p_admin_email)),
    nullif(trim(p_admin_full_name), ''),
    'admin',
    'Administration',
    auth.uid()
  )
  returning id, token into v_invitation_id, v_token;

  return query select v_company_id, v_invitation_id, v_token;
end;
$$;

create or replace function public.get_pending_invitation(
  p_token uuid,
  p_email text
)
returns table (
  id uuid,
  email text,
  full_name text,
  role public.app_role,
  team_id uuid,
  team_name text,
  company_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    user_invitations.id,
    user_invitations.email,
    user_invitations.full_name,
    user_invitations.role,
    user_invitations.team_id,
    user_invitations.team_name,
    user_invitations.company_id
  from public.user_invitations
  where user_invitations.token = p_token
    and lower(user_invitations.email) = lower(trim(p_email))
    and user_invitations.accepted_at is null
  limit 1
$$;

alter table public.companies enable row level security;
alter table public.subscriptions enable row level security;
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.user_invitations enable row level security;
alter table public.validations enable row level security;

drop policy if exists "Super admin can manage companies" on public.companies;
create policy "Super admin can manage companies"
  on public.companies
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "Company users can read their company" on public.companies;
create policy "Company users can read their company"
  on public.companies
  for select
  to authenticated
  using (id = public.current_company_id());

drop policy if exists "Super admin can manage subscriptions" on public.subscriptions;
create policy "Super admin can manage subscriptions"
  on public.subscriptions
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "Company admins can read subscriptions" on public.subscriptions;
create policy "Company admins can read subscriptions"
  on public.subscriptions
  for select
  to authenticated
  using (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Users can read profiles" on public.profiles;
drop policy if exists "Users can upsert own profile" on public.profiles;
drop policy if exists "Profiles are tenant scoped" on public.profiles;
create policy "Profiles are tenant scoped"
  on public.profiles
  for select
  to authenticated
  using (
    public.is_super_admin()
    or id = auth.uid()
    or company_id = public.current_company_id()
  );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_profile_role());

drop policy if exists "Users can create own profile from invitation" on public.profiles;
create policy "Users can create own profile from invitation"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "Users can read teams" on public.teams;
drop policy if exists "Users can create teams" on public.teams;
drop policy if exists "Teams are tenant scoped" on public.teams;
create policy "Teams are tenant scoped"
  on public.teams
  for all
  to authenticated
  using (public.is_super_admin() or company_id = public.current_company_id())
  with check (public.is_super_admin() or company_id = public.current_company_id());

drop policy if exists "Admins can manage invitations" on public.user_invitations;
drop policy if exists "Anyone can read pending invitation by token" on public.user_invitations;
drop policy if exists "Invitations are tenant scoped" on public.user_invitations;
create policy "Invitations are tenant scoped"
  on public.user_invitations
  for all
  to authenticated
  using (public.is_super_admin() or company_id = public.current_company_id())
  with check (public.is_super_admin() or company_id = public.current_company_id());

drop policy if exists "Authenticated users can manage validations" on public.validations;
drop policy if exists "Authenticated validations are tenant scoped" on public.validations;
create policy "Authenticated validations are tenant scoped"
  on public.validations
  for all
  to authenticated
  using (public.is_super_admin() or company_id = public.current_company_id())
  with check (public.is_super_admin() or company_id = public.current_company_id());

drop policy if exists "Public can create pending validations" on public.validations;
create policy "Public can create pending validations"
  on public.validations
  for insert
  to anon
  with check (status = 'pending' and company_id is null);

drop policy if exists "Public can read pending validations" on public.validations;
create policy "Public can read pending validations"
  on public.validations
  for select
  to anon
  using (
    status = 'pending'
    and (
      validation_link_expires_at is null
      or validation_link_expires_at > now()
    )
  );

drop policy if exists "Public can read signed validations" on public.validations;
create policy "Public can read signed validations"
  on public.validations
  for select
  to anon
  using (
    status = 'signed'
    and (
      validation_link_expires_at is null
      or validation_link_expires_at > now()
    )
  );

drop policy if exists "Public can seal pending validations" on public.validations;
create policy "Public can seal pending validations"
  on public.validations
  for update
  to anon
  using (status = 'pending'::public.validation_status)
  with check (
    status = 'signed'::public.validation_status
    and signer_name is not null
    and signed_at is not null
    and photo_before_url is not null
    and photo_after_url is not null
    and signature_png_url is not null
  );
