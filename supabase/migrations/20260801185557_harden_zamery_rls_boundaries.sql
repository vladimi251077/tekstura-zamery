begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Remove permissive policies that turn authentication into unrestricted access.
drop policy if exists clients_select_all_authenticated on public.clients;
drop policy if exists measurements_select_all_authenticated on public.measurements;
drop policy if exists measurement_photos_select_all_authenticated on public.measurement_photos;
drop policy if exists authenticated_delete_measurement_photos on public.measurement_photos;
drop policy if exists measurement_photos_bucket_select_all_authenticated on storage.objects;
drop policy if exists authenticated_delete_measurement_photo_objects on storage.objects;

-- The existing authorization functions already use fully qualified object names.
-- Keep their behavior unchanged while fixing their definer search path and grants.
alter function public.is_admin() set search_path = pg_catalog;
alter function public.can_read_measurement(public.measurements) set search_path = pg_catalog;

revoke execute on function public.is_admin() from public, anon, service_role;
revoke execute on function public.can_read_measurement(public.measurements) from public, anon, service_role;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_read_measurement(public.measurements) to authenticated;

-- Policies that invoke the restricted helper functions must only target signed-in users.
alter policy profiles_insert_admin on public.profiles to authenticated;
alter policy profiles_select_own_or_admin on public.profiles to authenticated;
alter policy profiles_update_own_or_admin on public.profiles to authenticated;
alter policy clients_insert on public.clients to authenticated;
alter policy clients_update on public.clients to authenticated;
alter policy measurements_insert on public.measurements to authenticated;
alter policy measurements_read on public.measurements to authenticated;
alter policy measurements_update on public.measurements to authenticated;
alter policy photos_delete_admin on public.measurement_photos to authenticated;
alter policy photos_insert on public.measurement_photos to authenticated;
alter policy photos_read on public.measurement_photos to authenticated;
alter policy storage_measurement_photos_delete_admin on storage.objects to authenticated;

-- A client is readable when the current authorization function permits at least one
-- measurement linked to it. This preserves zamer access even when another user created
-- the client row, without inventing new manufacturer/manager role semantics.
alter policy clients_read
on public.clients
to authenticated
using (
  public.is_admin()
  or created_by = (select auth.uid())
  or exists (
    select 1
    from public.measurements measurement
    where measurement.client_id = clients.id
      and public.can_read_measurement(measurement)
  )
);

create or replace function public.can_read_measurement_photo_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.measurement_photos photo
      join public.measurements measurement
        on measurement.id = photo.measurement_id
      where photo.file_path = object_name
        and public.can_read_measurement(measurement)
    );
$function$;

revoke execute on function public.can_read_measurement_photo_object(text) from public, anon, service_role;
grant execute on function public.can_read_measurement_photo_object(text) to authenticated;

drop policy if exists storage_measurement_photos_read on storage.objects;
create policy storage_measurement_photos_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'measurement-photos'
  and public.can_read_measurement_photo_object(name)
);

alter policy storage_measurement_photos_insert
on storage.objects
to authenticated
with check (bucket_id = 'measurement-photos');

do $verification$
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
    raise exception 'permissive authenticated policy remains';
  end if;

  if exists (
    select 1
    from pg_policies
    where ((schemaname = 'public' and tablename in ('clients', 'measurements', 'measurement_photos'))
        or (schemaname = 'storage' and tablename = 'objects'))
      and cmd in ('SELECT', 'DELETE')
      and coalesce(qual, '') in ('true', '(bucket_id = ''measurement-photos''::text)')
  ) then
    raise exception 'broad read/delete policy remains';
  end if;

  foreach function_oid in array array[
    'public.is_admin()'::regprocedure::oid,
    'public.can_read_measurement(public.measurements)'::regprocedure::oid,
    'public.can_read_measurement_photo_object(text)'::regprocedure::oid
  ] loop
    if not exists (
      select 1
      from pg_proc
      where oid = function_oid
        and prosecdef
        and proconfig = array['search_path=pg_catalog']
    ) then
      raise exception 'security definer function is not hardened: %', function_oid::regprocedure;
    end if;

    if not has_function_privilege('authenticated', function_oid, 'EXECUTE')
       or has_function_privilege('anon', function_oid, 'EXECUTE')
       or has_function_privilege('service_role', function_oid, 'EXECUTE') then
      raise exception 'unexpected function EXECUTE grants: %', function_oid::regprocedure;
    end if;
  end loop;
end
$verification$;

commit;
