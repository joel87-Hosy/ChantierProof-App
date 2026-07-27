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
