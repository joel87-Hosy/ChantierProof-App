alter table public.validations
  add column if not exists pdf_url text,
  add column if not exists accounting_status text not null default 'not_sent',
  add column if not exists sent_to_accounting_at timestamptz;

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'validation-assets';

drop policy if exists "Public can update accounting pdf"
  on public.validations;

create policy "Public can update accounting pdf"
  on public.validations
  for update
  to anon
  using (status = 'signed'::public.validation_status)
  with check (status = 'signed'::public.validation_status);

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
