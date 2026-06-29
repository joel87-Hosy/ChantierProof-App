drop policy if exists "Public can create pending validations"
  on public.validations;

create policy "Public can create pending validations"
  on public.validations
  for insert
  to anon
  with check (status = 'pending');
