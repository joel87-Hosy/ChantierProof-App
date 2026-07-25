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
