create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'validation_status') then
    create type public.validation_status as enum ('pending', 'signed');
  end if;
end $$;

create table if not exists public.validations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_name text not null,
  client_phone text,
  intervention_title text not null,
  intervention_price numeric(12, 2),
  gps_position text,
  status public.validation_status not null default 'pending',
  photo_before_url text,
  photo_after_url text,
  signature_png_url text,
  technician_name text,
  technician_notes text,
  signer_name text,
  signed_at timestamptz,
  pdf_url text,
  accounting_status text not null default 'not_sent',
  sent_to_accounting_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'accountant', 'technician', 'manager');
  end if;
end $$;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null unique
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  email text,
  full_name text,
  role public.app_role not null default 'technician',
  team_id uuid references public.teams(id) on delete set null,
  team_name text,
  avatar_url text
);

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  full_name text not null,
  role public.app_role not null default 'technician',
  team_id uuid references public.teams(id) on delete set null,
  team_name text,
  token uuid not null default gen_random_uuid(),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  unique (token)
);

alter table public.validations
  add column if not exists intervention_price numeric(12, 2),
  add column if not exists gps_position text,
  add column if not exists client_phone text,
  add column if not exists technician_name text,
  add column if not exists technician_notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists assigned_team_id uuid references public.teams(id) on delete set null,
  add column if not exists assigned_technician_id uuid references auth.users(id) on delete set null,
  add column if not exists pdf_url text,
  add column if not exists accounting_status text not null default 'not_sent',
  add column if not exists sent_to_accounting_at timestamptz;

create index if not exists validations_status_idx
  on public.validations (status);

create index if not exists validations_created_at_idx
  on public.validations (created_at desc);

create index if not exists validations_signed_at_idx
  on public.validations (signed_at desc);

alter table public.validations enable row level security;

drop policy if exists "Authenticated users can manage validations"
  on public.validations;

create policy "Authenticated users can manage validations"
  on public.validations
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Public can create pending validations"
  on public.validations;

create policy "Public can create pending validations"
  on public.validations
  for insert
  to anon
  with check (status = 'pending');

drop policy if exists "Public can read pending validations"
  on public.validations;

create policy "Public can read pending validations"
  on public.validations
  for select
  to anon
  using (status = 'pending');

drop policy if exists "Public can read signed validations"
  on public.validations;

create policy "Public can read signed validations"
  on public.validations
  for select
  to anon
  using (status = 'signed');

drop policy if exists "Public can seal pending validations"
  on public.validations;

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

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'validation-assets',
  'validation-assets',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can manage validation assets"
  on storage.objects;

create policy "Authenticated users can manage validation assets"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'validation-assets')
  with check (bucket_id = 'validation-assets');

drop policy if exists "Public can upload validation assets"
  on storage.objects;

create policy "Public can upload validation assets"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'validation-assets');

drop policy if exists "Public can read validation assets"
  on storage.objects;

create policy "Public can read validation assets"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'validation-assets');
