\set ON_ERROR_STOP on

begin;

set local statement_timeout = '30s';

do $catalog_contract$
declare
  function_oid oid;
begin
  if exists (
    select 1
    from pg_policies
    where (schemaname, tablename, policyname) in (
      ('public', 'clients', 'clients_select_all_authenticated'),
      ('public', 'measurements', 'measurements_select_all_authenticated'),
      ('public', 'measurement_photos', 'measurement_photos_select_all_authenticated'),
      ('public', 'measurement_photos', 'authenticated_delete_measurement_photos'),
      ('storage', 'objects', 'measurement_photos_bucket_select_all_authenticated'),
      ('storage', 'objects', 'authenticated_delete_measurement_photo_objects')
    )
  ) then
    raise exception 'broad read/delete policy remains';
  end if;

  foreach function_oid in array array[
    'public.is_admin()'::regprocedure::oid,
    'public.can_read_measurement(public.measurements)'::regprocedure::oid,
    'public.can_read_measurement_photo_object(text)'::regprocedure::oid
  ] loop
    if not exists (
      select 1 from pg_proc
      where oid = function_oid
        and prosecdef
        and proconfig = array['search_path=pg_catalog']
    ) then
      raise exception 'unsafe SECURITY DEFINER configuration: %', function_oid::regprocedure;
    end if;

    if not has_function_privilege('authenticated', function_oid, 'EXECUTE')
       or has_function_privilege('anon', function_oid, 'EXECUTE')
       or has_function_privilege('service_role', function_oid, 'EXECUTE') then
      raise exception 'unexpected EXECUTE grants: %', function_oid::regprocedure;
    end if;
  end loop;
end
$catalog_contract$;

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004');

insert into public.profiles (id, full_name, role, active) values
  ('10000000-0000-4000-8000-000000000001', 'CODEX SYNTHETIC ADMIN', 'admin', true),
  ('10000000-0000-4000-8000-000000000002', 'CODEX SYNTHETIC OWNER', 'zamer', true),
  ('10000000-0000-4000-8000-000000000003', 'CODEX SYNTHETIC FOREIGN', 'zamer', true),
  ('10000000-0000-4000-8000-000000000004', 'CODEX SYNTHETIC CONSTRUCTOR', 'constructor', true);

insert into public.clients (id, name, phone, address, city, created_by) values (
  '20000000-0000-4000-8000-000000000001',
  'CODEX SYNTHETIC CLIENT',
  '+70000000000',
  'CODEX SYNTHETIC ADDRESS',
  'TEST',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.measurements (id, number, client_id, created_by, measurer_id) values (
  '30000000-0000-4000-8000-000000000001',
  'CODEX-SYNTHETIC-RLS-20260801',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
);

insert into public.measurement_photos (id, measurement_id, photo_type, file_path, added_by) values (
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'CODEX SYNTHETIC',
  'codex-synthetic/20260801/rls-photo.jpg',
  '10000000-0000-4000-8000-000000000002'
);

insert into storage.objects (id, bucket_id, name, owner, owner_id) values (
  '50000000-0000-4000-8000-000000000001',
  'measurement-photos',
  'codex-synthetic/20260801/rls-photo.jpg',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002'
);

set local role authenticated;

do $role_contract$
declare
  affected integer;
begin
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  if (select count(*) from public.measurements where id = '30000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.clients where id = '20000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.measurement_photos where id = '40000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from storage.objects where id = '50000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'owner zamer cannot read the complete linked resource graph';
  end if;

  if not public.can_read_measurement_photo_object('codex-synthetic/20260801/rls-photo.jpg') then
    raise exception 'owner zamer object helper denied the linked path';
  end if;

  delete from public.measurement_photos where id = '40000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'zamer deleted a photo row';
  end if;

  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
  if (select count(*) from public.measurements where id = '30000000-0000-4000-8000-000000000001') <> 0
     or (select count(*) from public.clients where id = '20000000-0000-4000-8000-000000000001') <> 0
     or (select count(*) from public.measurement_photos where id = '40000000-0000-4000-8000-000000000001') <> 0
     or (select count(*) from storage.objects where id = '50000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'unrelated authenticated user can read foreign resources';
  end if;

  if public.can_read_measurement_photo_object('codex-synthetic/20260801/rls-photo.jpg') then
    raise exception 'object helper bypassed ownership for unrelated user';
  end if;

  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
  if (select count(*) from public.measurements where id = '30000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.clients where id = '20000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.measurement_photos where id = '40000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from storage.objects where id = '50000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'constructor rights diverge from current can_read_measurement behavior';
  end if;

  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
  if not public.is_admin()
     or (select count(*) from storage.objects where id = '50000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'admin cannot address the Storage object for API deletion';
  end if;

  delete from public.measurement_photos where id = '40000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'admin could not delete a photo row';
  end if;
end
$role_contract$;

reset role;

-- Restore the row removed by the transactional admin test so the orphan assertion
-- describes the complete graph. Storage deletion itself is exercised through the
-- Storage API because Supabase intentionally blocks direct table DELETE operations.
insert into public.measurement_photos (id, measurement_id, photo_type, file_path, added_by) values (
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'CODEX SYNTHETIC',
  'codex-synthetic/20260801/rls-photo.jpg',
  '10000000-0000-4000-8000-000000000002'
);

do $orphan_contract$
begin
  if exists (
    select 1
    from public.measurement_photos photo
    left join public.measurements measurement on measurement.id = photo.measurement_id
    where measurement.id is null
  ) then
    raise exception 'orphan photo row exists';
  end if;

  if exists (
    select 1
    from storage.objects object
    left join public.measurement_photos photo on photo.file_path = object.name
    where object.bucket_id = 'measurement-photos'
      and photo.id is null
  ) then
    raise exception 'orphan Storage metadata exists';
  end if;
end
$orphan_contract$;

rollback;
