-- Students see only their own information.
--
-- Students no longer read Faculty, Principal or Admin Manager profiles (which hold email
-- and phone). Where a page needs a name, such as the teacher of a course or the signatories
-- on a certificate, it asks person_name().
--
-- Students cannot edit their profile directly. They submit a change request, which goes to
-- the Admin Manager, who checks it and forwards it to the Principal. The change takes
-- effect only when the Principal approves it.

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select public.is_overseer())
  or ((select public.is_admin_manager()) and role in ('professor', 'staff', 'student', 'parent'))
  or ((select public.app_role()) in ('admin_manager', 'professor', 'staff', 'parent') and role in ('professor', 'principal', 'admin_manager'))
  or public.is_parent_of(id)
);

-- A person's display name only. Students and parents are named only to those who may see them.
create or replace function public.person_name(p_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.full_name from public.profiles p
   where p.id = p_id
     and public.is_active()
     and (p.role not in ('student', 'parent')
          or p.id = auth.uid()
          or public.is_overseer()
          or public.manages_students()
          or public.is_parent_of(p.id));
$$;
revoke execute on function public.person_name(uuid) from public, anon;
grant execute on function public.person_name(uuid) to authenticated;

-- Profile changes: add the student rule, and let approved requests through.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_changed boolean;
begin
  if old.role = 'super_admin' and old.status = 'active'
     and (new.role <> 'super_admin' or new.status <> 'active')
     and not exists (select 1 from public.profiles
                     where role = 'super_admin' and status = 'active' and id <> old.id) then
    raise exception 'At least one active Super Admin is required';
  end if;

  if auth.uid() is null or public.is_super_admin() or public.review_mode() then
    return new;
  end if;

  v_changed := (to_jsonb(new) - array['full_name', 'phone', 'department', 'updated_at'])
               is distinct from (to_jsonb(old) - array['full_name', 'phone', 'department', 'updated_at']);

  if public.is_admin() then
    if (old.role in ('admin', 'super_admin') or new.role in ('admin', 'super_admin')) and old.id <> auth.uid() then
      raise exception 'Only a Super Admin can manage administrator accounts';
    end if;
    if old.id = auth.uid() and v_changed then
      raise exception 'Administrators cannot change their own role, status or user ID';
    end if;
    if new.user_code is distinct from old.user_code then
      raise exception 'Only a Super Admin can change user IDs';
    end if;
    return new;
  end if;

  if public.is_admin_manager() and old.id <> auth.uid() then
    if old.role <> 'student' or new.role <> 'student' then
      raise exception 'Admin Managers manage student accounts only';
    end if;
    if new.status is distinct from old.status and 'offboarded' in (old.status, new.status) then
      raise exception 'Only an Admin can offboard or re-onboard a student';
    end if;
    if (to_jsonb(new) - array['full_name', 'phone', 'department', 'status', 'updated_at'])
       is distinct from (to_jsonb(old) - array['full_name', 'phone', 'department', 'status', 'updated_at']) then
      raise exception 'Admin Managers can change a student''s name, contact details and status only';
    end if;
    return new;
  end if;

  if old.role = 'student' and old.id = auth.uid() then
    raise exception 'Students cannot edit their profile directly. Submit a change request from My profile';
  end if;

  if v_changed then
    raise exception 'You can only change your name and contact details';
  end if;
  return new;
end;
$$;

-- Change requests -----------------------------------------------------------------
create type public.profile_change_status as enum ('submitted', 'forwarded', 'approved', 'rejected', 'withdrawn');

create table public.profile_change_requests (
  id              uuid primary key default gen_random_uuid(),
  request_no      text not null unique,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  changes         jsonb not null,  -- field -> requested value
  current_values  jsonb not null,  -- the same fields as they were when requested
  reason          text not null default '',
  status          public.profile_change_status not null default 'submitted',
  submitted_at    timestamptz not null default now(),
  forwarded_by    uuid references public.profiles (id) on delete set null,
  forwarded_at    timestamptz,
  manager_note    text,
  reviewed_by     uuid references public.profiles (id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text
);
create unique index profile_change_requests_one_open on public.profile_change_requests (student_id)
  where status in ('submitted', 'forwarded');
create index profile_change_requests_status_idx on public.profile_change_requests (status, submitted_at desc);
create index profile_change_requests_forwarded_by_idx on public.profile_change_requests (forwarded_by);
create index profile_change_requests_reviewed_by_idx on public.profile_change_requests (reviewed_by);

alter table public.profile_change_requests enable row level security;
-- Rows change only through the functions below.
create policy profile_change_requests_select on public.profile_change_requests for select to authenticated using (
  (student_id = (select auth.uid()) and (select public.is_active()))
  or (select public.manages_students())
  or (select public.is_overseer())
);

-- The fields a student may ask to change, as they are now.
create or replace function public.student_profile_values(p_student_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'full_name', p.full_name,
    'phone', p.phone,
    'date_of_birth', coalesce(r.date_of_birth::text, ''),
    'gender', coalesce(r.gender, ''),
    'address', coalesce(r.address, ''),
    'guardian_name', coalesce(r.guardian_name, ''),
    'guardian_phone', coalesce(r.guardian_phone, ''),
    'guardian_relation', coalesce(r.guardian_relation, ''))
  from public.profiles p
  left join public.student_records r on r.student_id = p.id
  where p.id = p_student_id;
$$;
revoke execute on function public.student_profile_values(uuid) from public, anon, authenticated;

-- Keeps the allowed fields that differ from the student's current values, cleaned and checked.
create or replace function public.clean_profile_changes(p_student_id uuid, p_changes jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_current jsonb := public.student_profile_values(p_student_id);
  v_out jsonb := '{}';
  v_key text;
  v_value text;
begin
  foreach v_key in array array['full_name', 'phone', 'date_of_birth', 'gender', 'address',
                               'guardian_name', 'guardian_phone', 'guardian_relation'] loop
    if p_changes ? v_key then
      v_value := trim(coalesce(p_changes ->> v_key, ''));
      if length(v_value) > 300 then
        raise exception 'That value is too long';
      end if;
      if v_key = 'full_name' and v_value = '' then
        raise exception 'Name cannot be empty';
      end if;
      if v_key = 'gender' and v_value not in ('', 'female', 'male', 'other') then
        raise exception 'Choose a gender from the list';
      end if;
      if v_key = 'date_of_birth' and v_value <> '' and v_value::date > current_date then
        raise exception 'Date of birth cannot be in the future';
      end if;
      if v_value is distinct from (v_current ->> v_key) then
        v_out := v_out || jsonb_build_object(v_key, v_value);
      end if;
    end if;
  end loop;
  if v_out = '{}' then
    raise exception 'Nothing has changed';
  end if;
  return v_out;
end;
$$;
revoke execute on function public.clean_profile_changes(uuid, jsonb) from public, anon, authenticated;

-- 1. Student submits.
create or replace function public.request_profile_change(p_changes jsonb, p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid := auth.uid();
  v_changes jsonb;
  v_id uuid;
  v_manager uuid;
begin
  if public.app_role() is distinct from 'student' then
    raise exception 'Only students submit profile change requests';
  end if;
  if exists (select 1 from public.profile_change_requests where student_id = v_student and status in ('submitted', 'forwarded')) then
    raise exception 'You already have a request in progress. Withdraw it to make a new one';
  end if;
  v_changes := public.clean_profile_changes(v_student, p_changes);
  insert into public.profile_change_requests (request_no, student_id, changes, current_values, reason)
  values (public.next_document_no('PCR'), v_student, v_changes,
          (select jsonb_object_agg(k, v) from jsonb_each(public.student_profile_values(v_student)) as t(k, v) where v_changes ? k),
          trim(coalesce(p_reason, '')))
  returning id into v_id;

  for v_manager in select id from public.profiles where role = 'admin_manager' and status = 'active' loop
    perform public.notify(v_manager, 'Profile change request',
      (select full_name from public.profiles where id = v_student), '/manager/profile-requests/' || v_id);
  end loop;
  return v_id;
end;
$$;
revoke execute on function public.request_profile_change(jsonb, text) from public, anon;
grant execute on function public.request_profile_change(jsonb, text) to authenticated;

create or replace function public.withdraw_profile_change(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profile_change_requests set status = 'withdrawn'
   where id = p_request_id and student_id = auth.uid() and status in ('submitted', 'forwarded');
  if not found then
    raise exception 'Only your own open requests can be withdrawn';
  end if;
end;
$$;
revoke execute on function public.withdraw_profile_change(uuid) from public, anon;
grant execute on function public.withdraw_profile_change(uuid) to authenticated;

-- 2. Admin Manager forwards to the Principal (optionally correcting the values) or returns it.
create or replace function public.process_profile_change(p_request_id uuid, p_decision text, p_note text default null, p_changes jsonb default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_req public.profile_change_requests;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_changes jsonb;
  v_principal uuid;
  v_name text;
begin
  if not public.manages_students() then
    raise exception 'Profile change requests are processed by the Admin Manager';
  end if;
  if p_decision not in ('forward', 'return') then
    raise exception 'Unknown decision %', p_decision;
  end if;
  select * into v_req from public.profile_change_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_req.status <> 'submitted' then
    raise exception 'This request is not waiting for the Admin Manager';
  end if;
  v_name := (select full_name from public.profiles where id = v_req.student_id);

  if p_decision = 'return' then
    if v_note is null then
      raise exception 'Tell the student why the request is being returned';
    end if;
    update public.profile_change_requests
       set status = 'rejected', forwarded_by = auth.uid(), forwarded_at = now(), manager_note = v_note
     where id = v_req.id;
    perform public.notify(v_req.student_id, 'Profile change request returned', v_note, '/profile');
    return 'rejected';
  end if;

  v_changes := public.clean_profile_changes(v_req.student_id, coalesce(p_changes, v_req.changes));
  update public.profile_change_requests
     set status = 'forwarded', changes = v_changes, forwarded_by = auth.uid(), forwarded_at = now(), manager_note = v_note,
         current_values = (select jsonb_object_agg(k, v) from jsonb_each(public.student_profile_values(v_req.student_id)) as t(k, v)
                            where v_changes ? k)
   where id = v_req.id;
  for v_principal in select id from public.profiles where role = 'principal' and status = 'active' loop
    perform public.notify(v_principal, 'Profile change awaiting your approval', v_name, '/principal/profile-requests/' || v_req.id);
  end loop;
  perform public.notify(v_req.student_id, 'Profile change request forwarded', 'Your request is now with the Principal for approval.', '/profile');
  return 'forwarded';
end;
$$;
revoke execute on function public.process_profile_change(uuid, text, text, jsonb) from public, anon;
grant execute on function public.process_profile_change(uuid, text, text, jsonb) to authenticated;

-- 3. Principal (or a Super Admin) approves, which applies the change, or rejects with a note.
create or replace function public.review_profile_change(p_request_id uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.app_role();
  v_req public.profile_change_requests;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  c jsonb;
begin
  if v_role is null or v_role not in ('principal', 'super_admin') then
    raise exception 'Profile changes are approved by the Principal';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Unknown decision %', p_decision;
  end if;
  select * into v_req from public.profile_change_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_req.status <> 'forwarded' then
    raise exception 'This request is not awaiting approval';
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'Give a reason when rejecting a request';
  end if;

  if p_decision = 'approve' then
    c := v_req.changes;
    perform set_config('bigsms.review', 'on', true);
    update public.profiles
       set full_name = case when c ? 'full_name' then c ->> 'full_name' else full_name end,
           phone = case when c ? 'phone' then c ->> 'phone' else phone end
     where id = v_req.student_id;
    if c ?| array['date_of_birth', 'gender', 'address', 'guardian_name', 'guardian_phone', 'guardian_relation'] then
      insert into public.student_records as r (student_id, date_of_birth, gender, address, guardian_name, guardian_phone, guardian_relation)
      values (v_req.student_id,
              nullif(c ->> 'date_of_birth', '')::date,
              coalesce(c ->> 'gender', ''), coalesce(c ->> 'address', ''), coalesce(c ->> 'guardian_name', ''),
              coalesce(c ->> 'guardian_phone', ''), coalesce(c ->> 'guardian_relation', ''))
      on conflict (student_id) do update set
        date_of_birth = case when c ? 'date_of_birth' then excluded.date_of_birth else r.date_of_birth end,
        gender = case when c ? 'gender' then excluded.gender else r.gender end,
        address = case when c ? 'address' then excluded.address else r.address end,
        guardian_name = case when c ? 'guardian_name' then excluded.guardian_name else r.guardian_name end,
        guardian_phone = case when c ? 'guardian_phone' then excluded.guardian_phone else r.guardian_phone end,
        guardian_relation = case when c ? 'guardian_relation' then excluded.guardian_relation else r.guardian_relation end;
    end if;
    perform set_config('bigsms.review', 'off', true);
  end if;

  update public.profile_change_requests
     set status = case when p_decision = 'approve' then 'approved' else 'rejected' end::public.profile_change_status,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
   where id = v_req.id;

  perform public.notify(v_req.student_id,
    case when p_decision = 'approve' then 'Profile change approved' else 'Profile change rejected' end,
    coalesce(v_note, case when p_decision = 'approve' then 'Your profile has been updated.' else '' end), '/profile');
  if v_req.forwarded_by is not null then
    perform public.notify(v_req.forwarded_by,
      case when p_decision = 'approve' then 'Profile change approved' else 'Profile change rejected' end,
      (select full_name from public.profiles where id = v_req.student_id), '/manager/profile-requests/' || v_req.id);
  end if;
  return case when p_decision = 'approve' then 'approved' else 'rejected' end;
end;
$$;
revoke execute on function public.review_profile_change(uuid, text, text) from public, anon;
grant execute on function public.review_profile_change(uuid, text, text) to authenticated;

create trigger audit_profile_change_requests after insert or update on public.profile_change_requests
  for each row execute function public.audit_row();
