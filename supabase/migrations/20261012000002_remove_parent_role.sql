-- The Parent role is removed. The enum value, existing accounts and parent_students rows stay
-- (nothing is deleted), but parent accounts can no longer read any student data, cannot be
-- created by sign-up, and the role cannot be assigned. The app sends them to /pending.

-- Every parent read policy goes through these two helpers.
create or replace function public.is_parent_of(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select false;
$$;

create or replace function public.parent_sees_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select false;
$$;

-- Self sign-up offers Student and Faculty only.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_user_meta_data ->> 'role' in ('professor', 'student')
         then (new.raw_user_meta_data ->> 'role')::public.user_role
         else 'student' end
  );
  return new;
end;
$$;

-- Nobody may give an account the Parent role.
create or replace function public.guard_no_parent_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'parent' and (tg_op = 'INSERT' or old.role is distinct from 'parent') then
    raise exception 'The Parent role has been removed';
  end if;
  return new;
end;
$$;
create trigger profiles_no_parent_role before insert or update of role on public.profiles
  for each row execute function public.guard_no_parent_role();
