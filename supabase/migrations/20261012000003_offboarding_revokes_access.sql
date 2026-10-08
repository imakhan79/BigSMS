-- Offboarding revokes access automatically (HR 5.5).
-- Data access already ends with the status change, because every role check goes through
-- app_role(), which only matches active accounts. This also ends sign-in: an offboarded
-- account is banned in Supabase Auth and its sessions (and their refresh tokens) are deleted,
-- so it is signed out everywhere and cannot sign in again. Re-onboarding lifts the ban.

create or replace function public.sync_auth_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'offboarded' and old.status is distinct from 'offboarded' then
    update auth.users set banned_until = 'infinity' where id = new.id;
    delete from auth.sessions where user_id = new.id;
  elsif old.status = 'offboarded' and new.status is distinct from 'offboarded' then
    update auth.users set banned_until = null where id = new.id;
  end if;
  return null;
end;
$$;
create trigger profiles_sync_auth_access after update of status on public.profiles
  for each row execute function public.sync_auth_access();

-- Accounts offboarded before this change.
update auth.users u set banned_until = 'infinity'
  from public.profiles p
 where p.id = u.id and p.status = 'offboarded';
delete from auth.sessions s
 using public.profiles p
 where p.id = s.user_id and p.status = 'offboarded';

-- An account that is not active cannot change its own details or read its notifications.
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (
  (id = (select auth.uid()) and (select public.is_active()))
  or (select public.is_admin())
  or ((select public.is_admin_manager()) and role = 'student')
);

drop policy notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()));
drop policy notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()));
