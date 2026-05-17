alter table public.measurements
add column if not exists measurer_name text,
add column if not exists measurer_login text,
add column if not exists measurer_user_id uuid;
