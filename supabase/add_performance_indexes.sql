create index if not exists validations_status_created_at_idx
  on public.validations (status, created_at desc);

create index if not exists validations_created_by_created_at_idx
  on public.validations (created_by, created_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'validations'
      and column_name = 'accounting_status'
  ) then
    create index if not exists validations_accounting_status_created_at_idx
      on public.validations (accounting_status, created_at desc);
  end if;
end $$;
