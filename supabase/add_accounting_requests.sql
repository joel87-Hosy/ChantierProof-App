alter table public.validations
  add column if not exists pdf_url text,
  add column if not exists accounting_status text not null default 'not_sent',
  add column if not exists sent_to_accounting_at timestamptz,
  add column if not exists validation_link_expires_at timestamptz;

create table if not exists public.accounting_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  requested_at timestamptz not null default now(),
  validation_id uuid not null references public.validations(id) on delete cascade,
  pdf_url text not null,
  status text not null default 'pending',
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  unique (validation_id)
);

create index if not exists accounting_requests_status_created_at_idx
  on public.accounting_requests (status, created_at desc);

create index if not exists accounting_requests_validation_id_idx
  on public.accounting_requests (validation_id);

alter table public.accounting_requests enable row level security;

drop policy if exists "Accountants can read signed validations"
  on public.validations;

create policy "Accountants can read signed validations"
  on public.validations
  for select
  to authenticated
  using (
    status = 'signed'::public.validation_status
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin'::public.app_role, 'accountant'::public.app_role)
    )
  );

drop policy if exists "Public can create accounting request for signed validation"
  on public.accounting_requests;

create policy "Public can create accounting request for signed validation"
  on public.accounting_requests
  for insert
  to anon
  with check (
    status = 'pending'
    and validation_id is not null
    and pdf_url is not null
  );

drop policy if exists "Public can update accounting status for signed validation"
  on public.validations;

create policy "Public can update accounting status for signed validation"
  on public.validations
  for update
  to anon
  using (status = 'signed'::public.validation_status)
  with check (
    status = 'signed'::public.validation_status
    and accounting_status in ('not_sent', 'sent_to_accounting')
    and validation_link_expires_at is not null
  );

drop policy if exists "Accountants can read accounting requests"
  on public.accounting_requests;

create policy "Accountants can read accounting requests"
  on public.accounting_requests
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin'::public.app_role, 'accountant'::public.app_role)
    )
  );

drop policy if exists "Accountants can update accounting requests"
  on public.accounting_requests;

create policy "Accountants can update accounting requests"
  on public.accounting_requests
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin'::public.app_role, 'accountant'::public.app_role)
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin'::public.app_role, 'accountant'::public.app_role)
    )
  );

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'validation-assets';

drop policy if exists "Public can upload validation pdf"
  on storage.objects;

create policy "Public can upload validation pdf"
  on storage.objects
  for insert
  to anon
  with check (
    bucket_id = 'validation-assets'
    and lower(right(name, 4)) = '.pdf'
  );

drop policy if exists "Accountants can read validation assets"
  on storage.objects;

create policy "Accountants can read validation assets"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'validation-assets'
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin'::public.app_role, 'accountant'::public.app_role)
    )
  );
