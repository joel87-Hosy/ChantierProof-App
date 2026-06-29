alter table public.validations
  add column if not exists intervention_price numeric(12, 2),
  add column if not exists gps_position text,
  add column if not exists client_phone text,
  add column if not exists technician_name text,
  add column if not exists technician_notes text;

drop policy if exists "Public can read validation assets"
  on storage.objects;

create policy "Public can read validation assets"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'validation-assets');
