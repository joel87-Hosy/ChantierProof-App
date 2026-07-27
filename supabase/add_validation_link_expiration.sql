alter table public.validations
  add column if not exists pdf_url text,
  add column if not exists accounting_status text not null default 'not_sent',
  add column if not exists sent_to_accounting_at timestamptz,
  add column if not exists validation_link_expires_at timestamptz;

drop policy if exists "Public can read pending validations"
  on public.validations;

drop policy if exists "Public can read signed validations"
  on public.validations;

drop policy if exists "Public can read validations"
  on public.validations;

create policy "Public can read active validation links"
  on public.validations
  for select
  to anon
  using (
    validation_link_expires_at is null
    or validation_link_expires_at > now()
  );

drop policy if exists "Public can update accounting status for signed validation"
  on public.validations;

drop policy if exists "Public can update accounting pdf"
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
