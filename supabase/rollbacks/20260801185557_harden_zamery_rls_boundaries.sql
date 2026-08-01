begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop policy if exists storage_measurement_photos_read on storage.objects;
drop function if exists public.can_read_measurement_photo_object(text);

alter function public.is_admin() set search_path = public;
alter function public.can_read_measurement(public.measurements) set search_path = public;

grant execute on function public.is_admin() to public, anon, authenticated, service_role;
grant execute on function public.can_read_measurement(public.measurements) to public, anon, authenticated, service_role;

alter policy profiles_insert_admin on public.profiles to public;
alter policy profiles_select_own_or_admin on public.profiles to public;
alter policy profiles_update_own_or_admin on public.profiles to public;
alter policy clients_insert on public.clients to public;
alter policy clients_update on public.clients to public;
alter policy measurements_insert on public.measurements to public;
alter policy measurements_read on public.measurements to public;
alter policy measurements_update on public.measurements to public;
alter policy photos_delete_admin on public.measurement_photos to public;
alter policy photos_insert on public.measurement_photos to public;
alter policy photos_read on public.measurement_photos to public;
alter policy storage_measurement_photos_delete_admin on storage.objects to public;

alter policy clients_read
on public.clients
to public
using (
  public.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = any (array['constructor'::text, 'manager'::text, 'viewer'::text])
  )
);

create policy clients_select_all_authenticated
on public.clients for select to authenticated using (true);

create policy measurements_select_all_authenticated
on public.measurements for select to authenticated using (true);

create policy measurement_photos_select_all_authenticated
on public.measurement_photos for select to authenticated using (true);

create policy authenticated_delete_measurement_photos
on public.measurement_photos for delete to authenticated using (true);

create policy measurement_photos_bucket_select_all_authenticated
on storage.objects for select to authenticated
using (bucket_id = 'measurement-photos');

create policy authenticated_delete_measurement_photo_objects
on storage.objects for delete to authenticated
using (bucket_id = 'measurement-photos');

create policy storage_measurement_photos_read
on storage.objects
for select
to public
using (
  bucket_id = 'measurement-photos'
  and auth.role() = 'authenticated'
);

alter policy storage_measurement_photos_insert
on storage.objects
to public
with check (
  bucket_id = 'measurement-photos'
  and auth.role() = 'authenticated'
);

do $verification$
begin
  if to_regprocedure('public.can_read_measurement_photo_object(text)') is not null then
    raise exception 'new helper remains after rollback';
  end if;

  if (
    select count(*)
    from pg_policies
    where (schemaname, tablename, policyname) in (
      ('public', 'clients', 'clients_select_all_authenticated'),
      ('public', 'measurements', 'measurements_select_all_authenticated'),
      ('public', 'measurement_photos', 'measurement_photos_select_all_authenticated'),
      ('public', 'measurement_photos', 'authenticated_delete_measurement_photos'),
      ('storage', 'objects', 'measurement_photos_bucket_select_all_authenticated'),
      ('storage', 'objects', 'authenticated_delete_measurement_photo_objects')
    )
  ) <> 6 then
    raise exception 'pre-change policies were not restored';
  end if;
end
$verification$;

commit;
