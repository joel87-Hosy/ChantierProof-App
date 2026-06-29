drop policy if exists "Public can read signed validations"
  on public.validations;

create policy "Public can read signed validations"
  on public.validations
  for select
  to anon
  using (status = 'signed'::public.validation_status);

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
