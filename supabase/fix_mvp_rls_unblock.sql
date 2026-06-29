drop policy if exists "Public can read validations"
  on public.validations;

create policy "Public can read validations"
  on public.validations
  for select
  to anon
  using (true);

drop policy if exists "Public can seal pending validations"
  on public.validations;

create policy "Public can seal pending validations"
  on public.validations
  for update
  to anon
  using (status = 'pending'::public.validation_status)
  with check (status = 'signed'::public.validation_status);

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
