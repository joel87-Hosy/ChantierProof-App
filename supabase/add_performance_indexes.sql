create index if not exists validations_status_created_at_idx
  on public.validations (status, created_at desc);

create index if not exists validations_created_by_created_at_idx
  on public.validations (created_by, created_at desc);

create index if not exists validations_accounting_status_created_at_idx
  on public.validations (accounting_status, created_at desc);
