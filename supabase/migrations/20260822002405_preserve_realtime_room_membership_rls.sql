-- A fresh deployment of remote_schema creates Realtime policies that check
-- public.room_members. Preserve only the authenticated user's own membership
-- visibility after the public-schema RLS sweep. The current production schema
-- does not include this optional table, so this migration is intentionally a
-- no-op there.

do $migration$
begin
  if pg_catalog.to_regclass('public.room_members') is not null
     and not exists (
       select 1
       from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename = 'room_members'
         and policyname = 'room_members_self_read'
     )
  then
    execute $policy$
      create policy "room_members_self_read"
      on public.room_members
      for select
      to authenticated
      using (user_id = (select auth.uid()))
    $policy$;
  end if;
end
$migration$;

do $assertion$
begin
  if pg_catalog.to_regclass('public.room_members') is not null
     and not exists (
       select 1
       from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename = 'room_members'
         and policyname = 'room_members_self_read'
     )
  then
    raise exception 'room_members Realtime membership policy was not preserved';
  end if;
end
$assertion$;
