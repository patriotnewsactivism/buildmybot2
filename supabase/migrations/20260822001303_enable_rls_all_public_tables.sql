-- BuildMyBot accesses production data through server-side service_role calls.
-- Keep every table in the exposed public schema deny-by-default for anon and
-- authenticated clients unless a narrowly scoped policy is added deliberately.
-- Each ALTER TABLE needs a brief exclusive lock. Run during low traffic; if a
-- lock timeout occurs, clear the conflicting transaction and retry the migration.

set local lock_timeout = '5s';

do $migration$
declare
  target record;
begin
  for target in
    select n.nspname as schema_name, c.relname as table_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
    order by c.relname
  loop
    execute pg_catalog.format(
      'alter table %I.%I enable row level security',
      target.schema_name,
      target.table_name
    );
  end loop;
end
$migration$;

do $assertion$
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ) then
    raise exception 'RLS hardening incomplete: at least one public table still has RLS disabled';
  end if;
end
$assertion$;
