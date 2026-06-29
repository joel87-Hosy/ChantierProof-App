alter table public.validations
  add column if not exists client_phone text,
  add column if not exists technician_name text,
  add column if not exists technician_notes text;
