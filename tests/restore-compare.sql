\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
set search_path = pg_catalog;

select format(
  'select %L || count(*) from auth.%I;',
  format('auth_count|%s|', table_name),
  table_name
)
from information_schema.tables
where table_schema = 'auth' and table_type = 'BASE TABLE'
order by table_name
\gexec

select format(
  'select %L || count(*) from storage.%I;',
  format('storage_count|%s|', table_name),
  table_name
)
from information_schema.tables
where table_schema = 'storage' and table_type = 'BASE TABLE'
order by table_name
\gexec

select 'count|profiles|' || count(*) from public.profiles;
select 'count|clients|' || count(*) from public.clients;
select 'count|measurements|' || count(*) from public.measurements;
select 'count|measurement_photos|' || count(*) from public.measurement_photos;
select 'id_hash|profiles|' || md5(coalesce(string_agg(id::text, ',' order by id::text), '')) from public.profiles;
select 'id_hash|clients|' || md5(coalesce(string_agg(id::text, ',' order by id::text), '')) from public.clients;
select 'link_hash|measurements|' || md5(coalesce(string_agg(concat_ws(':', id::text, coalesce(client_id::text, ''), coalesce(created_by::text, ''), coalesce(measurer_id::text, '')), ',' order by id::text), '')) from public.measurements;
select 'link_hash|measurement_photos|' || md5(coalesce(string_agg(concat_ws(':', id::text, measurement_id::text, file_path), ',' order by id::text), '')) from public.measurement_photos;
select 'id_hash|auth_users|' || md5(coalesce(string_agg(id::text, ',' order by id::text), '')) from auth.users;
select 'link_hash|storage_objects|' || md5(coalesce(string_agg(concat_ws(':', id::text, bucket_id, name, coalesce(owner_id, '')), ',' order by id::text), '')) from storage.objects where bucket_id = 'measurement-photos';

select concat_ws('|', 'column', table_schema, table_name, ordinal_position, column_name, data_type, is_nullable, coalesce(column_default, '<none>'))
from information_schema.columns
where (table_schema = 'public' and table_name in ('profiles', 'clients', 'measurements', 'measurement_photos'))
   or (table_schema = 'storage' and table_name = 'objects')
order by table_schema, table_name, ordinal_position;

select concat_ws('|', 'constraint', namespace.nspname, relation.relname, constraint_row.conname, pg_get_constraintdef(constraint_row.oid))
from pg_constraint constraint_row
join pg_class relation on relation.oid = constraint_row.conrelid
join pg_namespace namespace on namespace.oid = relation.relnamespace
where (namespace.nspname = 'public' and relation.relname in ('profiles', 'clients', 'measurements', 'measurement_photos'))
   or (namespace.nspname = 'storage' and relation.relname = 'objects')
order by namespace.nspname, relation.relname, constraint_row.conname;

select concat_ws('|', 'index', schemaname, tablename, indexname, indexdef)
from pg_indexes
where (schemaname = 'public' and tablename in ('profiles', 'clients', 'measurements', 'measurement_photos'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, indexname;

select concat_ws('|', 'policy', schemaname, tablename, policyname, permissive, roles::text, cmd, coalesce(qual, '<null>'), coalesce(with_check, '<null>'))
from pg_policies
where (schemaname = 'public' and tablename in ('profiles', 'clients', 'measurements', 'measurement_photos'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select concat_ws('|', 'function', function_row.oid::regprocedure::text, function_row.prosecdef, coalesce(array_to_string(function_row.proconfig, ','), '<unset>'), md5(pg_get_functiondef(function_row.oid)))
from pg_proc function_row
join pg_namespace namespace on namespace.oid = function_row.pronamespace
where namespace.nspname = 'public'
  and function_row.proname in ('is_admin', 'can_read_measurement', 'can_read_measurement_photo_object')
order by function_row.oid::regprocedure::text;

select concat_ws('|', 'function_execute', function_row.oid::regprocedure::text, checked_role.role_name,
  case
    when checked_role.role_name = 'PUBLIC' then exists (
      select 1
      from aclexplode(coalesce(function_row.proacl, acldefault('f', function_row.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    )
    else has_function_privilege(checked_role.role_name, function_row.oid, 'EXECUTE')
  end)
from pg_proc function_row
join pg_namespace namespace on namespace.oid = function_row.pronamespace
cross join (values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')) checked_role(role_name)
where namespace.nspname = 'public'
  and function_row.proname in ('is_admin', 'can_read_measurement', 'can_read_measurement_photo_object')
order by function_row.oid::regprocedure::text, checked_role.role_name;
