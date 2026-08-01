\set ON_ERROR_STOP on

begin;

select p.id::text as probe_user_id
from public.profiles p
where p.role = 'zamer'
  and p.active = true
  and not exists (
    select 1
    from public.measurements m
    where m.created_by = p.id or m.measurer_id = p.id
  )
order by p.id
limit 1
\gset

\if :{?probe_user_id}
  set local role authenticated;
  select
    set_config('request.jwt.claim.sub', :'probe_user_id', true) as configured_sub,
    set_config('request.jwt.claim.role', 'authenticated', true) as configured_role
  \gset

  do $contract$
  declare
    violations text[] := array[]::text[];
  begin
    if exists (select 1 from public.measurements) then
      violations := array_append(violations, 'foreign measurements are visible');
    end if;
    if exists (select 1 from public.clients) then
      violations := array_append(violations, 'foreign clients are visible');
    end if;
    if exists (select 1 from public.measurement_photos) then
      violations := array_append(violations, 'foreign photo rows are visible');
    end if;
    if exists (
      select 1
      from storage.objects
      where bucket_id = 'measurement-photos'
    ) then
      violations := array_append(violations, 'foreign Storage objects are visible');
    end if;

    if cardinality(violations) > 0 then
      raise exception 'RLS boundary contract failed: %', array_to_string(violations, '; ');
    end if;
  end
  $contract$;
\else
  \echo 'RLS boundary contract setup failed: no active zamer without owned measurements'
  \quit 3
\endif

rollback;
