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
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists assigned_team_id uuid references public.teams(id) on delete set null,
  add column if not exists assigned_technician_id uuid references auth.users(id) on delete set null;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.user_invitations enable row level security;

drop policy if exists "Users can read profiles"
  on public.profiles;

create policy "Users can read profiles"
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists "Users can upsert own profile"
  on public.profiles;

create policy "Users can upsert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "Users can update own profile"
  on public.profiles;

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Users can read teams"
  on public.teams;

create policy "Users can read teams"
  on public.teams
  for select
  to authenticated
  using (true);

drop policy if exists "Users can create teams"
  on public.teams;

create policy "Users can create teams"
  on public.teams
  for insert
  to authenticated
  with check (true);

drop policy if exists "Admins can manage invitations"
  on public.user_invitations;

create policy "Admins can manage invitations"
  on public.user_invitations
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'::public.app_role
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'::public.app_role
    )
  );

drop policy if exists "Anyone can read pending invitation by token"
  on public.user_invitations;

create policy "Anyone can read pending invitation by token"
  on public.user_invitations
  for select
  to anon
  using (accepted_at is null);

drop policy if exists "Authenticated users can accept invitation"
  on public.user_invitations;

create policy "Authenticated users can accept invitation"
  on public.user_invitations
  for update
  to authenticated
  using (
    accepted_at is null
    and lower(email) = lower((auth.jwt() ->> 'email'))
  )
  with check (
    accepted_at is not null
    and lower(email) = lower((auth.jwt() ->> 'email'))
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload own avatar"
  on storage.objects;

create policy "Users can upload own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own avatar"
  on storage.objects;

create policy "Users can update own avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can read avatars"
  on storage.objects;

create policy "Users can read avatars"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'profile-avatars');
