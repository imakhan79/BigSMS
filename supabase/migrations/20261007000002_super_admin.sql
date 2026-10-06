-- Super Admin: full system access, the only role that can manage administrator
-- accounts and configure approval workflows. Admin keeps day-to-day operations.
-- Also adds unique user IDs, onboarding/offboarding and configurable course approval steps.

-- Role helpers ----------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() = 'super_admin', false);
$$;

-- Super Admins pass every admin check.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() in ('admin', 'super_admin'), false);
$$;

create or replace function public.is_overseer()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() in ('super_admin', 'admin', 'principal'), false);
$$;

-- Policies that named the admin role directly.
drop policy questions_select on public.questions;
create policy questions_select on public.questions for select to authenticated using (
  (select public.app_role()) in ('super_admin', 'admin', 'professor')
);
drop policy questions_insert on public.questions;
create policy questions_insert on public.questions for insert to authenticated with check (
  (select public.app_role()) in ('super_admin', 'admin', 'professor') and created_by = (select auth.uid())
);
drop policy kpis_select on public.kpi_definitions;
create policy kpis_select on public.kpi_definitions for select to authenticated
  using ((select public.app_role()) in ('super_admin', 'admin', 'principal', 'professor'));

-- Admins may not delete administrator accounts; only a Super Admin can.
drop policy profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated using (
  (select public.is_super_admin())
  or ((select public.is_admin()) and role not in ('admin', 'super_admin'))
);

-- User IDs and lifecycle --------------------------------------------------------
alter table public.profiles
  add column user_code       text unique,
  add column phone           text not null default '',
  add column department      text not null default '',
  add column onboarded_at    timestamptz,
  add column onboarded_by    uuid references public.profiles (id) on delete set null,
  add column offboarded_at   timestamptz,
  add column offboarded_by   uuid references public.profiles (id) on delete set null,
  add column offboard_reason text;

-- One counter per prefix; only touched by next_user_code().
create table public.user_code_counters (
  prefix      text primary key,
  last_value  integer not null default 0
);
alter table public.user_code_counters enable row level security;

create or replace function public.user_code_prefix(p_role public.user_role)
returns text language sql immutable set search_path = '' as $$
  select case p_role
    when 'super_admin' then 'SA'
    when 'admin' then 'ADM'
    when 'principal' then 'PRN'
    when 'professor' then 'FAC'
    when 'staff' then 'STF'
    when 'student' then 'STU'
    when 'parent' then 'PAR'
  end;
$$;

-- Next free code for a role, e.g. STU-0042. Skips codes a Super Admin set by hand.
create or replace function public.next_user_code(p_role public.user_role)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text := public.user_code_prefix(p_role);
  v_n integer;
  v_code text;
begin
  loop
    insert into public.user_code_counters as c (prefix, last_value) values (v_prefix, 1)
    on conflict (prefix) do update set last_value = c.last_value + 1
    returning last_value into v_n;
    v_code := v_prefix || '-' || lpad(v_n::text, 4, '0');
    exit when not exists (select 1 from public.profiles where user_code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke execute on function public.next_user_code(public.user_role) from public, anon, authenticated;

-- Onboarding = first activation: assigns the user ID and stamps who onboarded them.
-- Offboarding = status 'offboarded': access ends, records are kept.
create or replace function public.profile_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if new.user_code is null then
      new.user_code := public.next_user_code(new.role);
    end if;
    if new.onboarded_at is null or (tg_op = 'UPDATE' and old.status = 'offboarded') then
      new.onboarded_at := now();
      new.onboarded_by := auth.uid();
    end if;
    new.offboarded_at := null;
    new.offboarded_by := null;
    new.offboard_reason := null;
  elsif new.status = 'offboarded' and (tg_op = 'INSERT' or old.status is distinct from 'offboarded') then
    new.offboarded_at := now();
    new.offboarded_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Runs after profiles_guard (triggers fire in name order), so the guard sees the caller's values.
create trigger profiles_lifecycle before insert or update on public.profiles
  for each row execute function public.profile_lifecycle();

-- Existing accounts that have been activated get IDs in sign-up order.
do $$
declare
  p record;
begin
  for p in select id, role, created_at from public.profiles
           where status <> 'pending' and user_code is null order by created_at loop
    update public.profiles
       set user_code = public.next_user_code(p.role), onboarded_at = coalesce(onboarded_at, p.created_at)
     where id = p.id;
  end loop;
end;
$$;

-- Profile changes:
--   Super Admin: anything (but the last active Super Admin cannot step down).
--   Admin: manages non-administrator accounts only; cannot grant admin roles.
--   Everyone else: own name and contact details only.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_managed text[] := array['role', 'status', 'email', 'user_code', 'onboarded_at', 'onboarded_by',
                            'offboarded_at', 'offboarded_by', 'offboard_reason'];
  v_changed boolean;
begin
  if old.role = 'super_admin' and old.status = 'active'
     and (new.role <> 'super_admin' or new.status <> 'active')
     and not exists (select 1 from public.profiles
                     where role = 'super_admin' and status = 'active' and id <> old.id) then
    raise exception 'At least one active Super Admin is required';
  end if;

  if auth.uid() is null or public.is_super_admin() then
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

  if v_changed then
    raise exception 'You can only change your name and contact details';
  end if;
  return new;
end;
$$;

-- Accounts created by an administrator are active immediately with a temporary password.
create or replace function public.admin_create_user(
  p_email text,
  p_full_name text,
  p_role public.user_role,
  p_password text,
  p_phone text default '',
  p_department text default ''
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if not public.is_admin() then
    raise exception 'Only administrators can create users';
  end if;
  if p_role in ('admin', 'super_admin') and not public.is_super_admin() then
    raise exception 'Only a Super Admin can create administrator accounts';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Temporary password must be at least 8 characters';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'A user with that email already exists';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', trim(p_full_name)), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', null, now(), now());

  update public.profiles
     set full_name = trim(p_full_name), role = p_role, status = 'active',
         phone = trim(coalesce(p_phone, '')), department = trim(coalesce(p_department, ''))
   where id = v_id;
  return v_id;
end;
$$;
revoke execute on function public.admin_create_user(text, text, public.user_role, text, text, text) from public, anon;
grant execute on function public.admin_create_user(text, text, public.user_role, text, text, text) to authenticated;

-- Configurable approval workflow ------------------------------------------------
-- Ordered approver roles for a workflow. Only course publication uses approvals today.
create table public.approval_steps (
  workflow       text not null check (workflow in ('course_publication')),
  step_order     smallint not null check (step_order > 0),
  approver_role  public.user_role not null check (approver_role in ('admin', 'principal')),
  updated_at     timestamptz not null default now(),
  primary key (workflow, step_order),
  unique (workflow, approver_role)
);
alter table public.approval_steps enable row level security;
create policy approval_steps_select on public.approval_steps for select to authenticated
  using ((select public.is_active()));

insert into public.approval_steps (workflow, step_order, approver_role)
values ('course_publication', 1, 'principal')
on conflict do nothing;

-- Which step a pending course is at (null when not pending).
alter table public.courses add column approval_step smallint;
update public.courses set approval_step = 1 where status = 'pending_approval';

-- Decision history, one row per approve/reject.
create table public.course_approvals (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses (id) on delete cascade,
  step_order     smallint not null,
  reviewer_id    uuid references public.profiles (id) on delete set null,
  reviewer_role  public.user_role not null,
  decision       text not null check (decision in ('approved', 'rejected')),
  note           text,
  created_at     timestamptz not null default now()
);
create index course_approvals_course_idx on public.course_approvals (course_id, created_at);
create index course_approvals_reviewer_idx on public.course_approvals (reviewer_id);
alter table public.course_approvals enable row level security;
create policy course_approvals_select on public.course_approvals for select to authenticated
  using ((select public.is_overseer()) or public.is_professor_of(course_id));

create trigger audit_approval_steps after insert or update or delete on public.approval_steps
  for each row execute function public.audit_row();
create trigger audit_course_approvals after insert on public.course_approvals
  for each row execute function public.audit_row();

-- Course workflow guard:
--   published/rejected and approval_step change only inside review_course()/set_approval_workflow()
--   admins/super admins: archive, restore and edit
--   principals: no direct updates (they review through review_course())
--   professors: draft/rejected -> pending_approval, pending_approval -> draft, any -> archived
create or replace function public.guard_course_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_first smallint;
begin
  if auth.uid() is null or coalesce(current_setting('bigsms.review', true), '') = 'on' then
    return new;
  end if;

  if new.approval_step is distinct from old.approval_step
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or (new.status is distinct from old.status and new.status in ('published', 'rejected')) then
    raise exception 'Courses are approved or rejected through the approval workflow';
  end if;

  if not public.is_admin() then
    if public.is_principal() then
      raise exception 'Principals can only approve or reject courses awaiting approval';
    end if;
    if new.professor_id is distinct from old.professor_id then
      raise exception 'Course owner cannot be changed';
    end if;
    if new.status is distinct from old.status and not (
         (old.status in ('draft', 'rejected') and new.status = 'pending_approval')
      or (old.status = 'pending_approval' and new.status = 'draft')
      or new.status = 'archived'
    ) then
      raise exception 'Course status cannot change from % to %', old.status, new.status;
    end if;
    new.review_note := old.review_note;
  end if;

  if new.status = 'pending_approval' and old.status is distinct from 'pending_approval' then
    select min(step_order) into v_first from public.approval_steps where workflow = 'course_publication';
    if v_first is null then
      raise exception 'No course approval workflow is configured';
    end if;
    new.approval_step := v_first;
  elsif new.status <> 'pending_approval' then
    new.approval_step := null;
  end if;
  return new;
end;
$$;

-- Notify whoever must act at the course's current step.
create or replace function public.notify_step_approvers(p_course public.courses)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role;
  reviewer uuid;
begin
  select approver_role into v_role from public.approval_steps
   where workflow = 'course_publication' and step_order = p_course.approval_step;
  if v_role is null then
    return;
  end if;
  for reviewer in select id from public.profiles where role = v_role and status = 'active' loop
    perform public.notify(reviewer, 'Course awaiting your approval', p_course.title,
      case when v_role = 'principal' then '/principal/courses' else '/admin/courses' end);
  end loop;
end;
$$;
revoke execute on function public.notify_step_approvers(public.courses) from public, anon, authenticated;

create or replace function public.notify_course_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'pending_approval' then
    perform public.notify_step_approvers(new);
  elsif new.status = 'published' then
    perform public.notify(new.professor_id, 'Course approved', new.title || ' is now published.', '/professor/courses/' || new.id);
  elsif new.status = 'rejected' then
    perform public.notify(new.professor_id, 'Course rejected', coalesce(new.review_note, new.title), '/professor/courses/' || new.id);
  end if;
  return new;
end;
$$;

-- Approve or reject a pending course at its current step. A Super Admin may decide at
-- any step; approving as Super Admin publishes immediately.
-- Returns 'advanced', 'published' or 'rejected'.
create or replace function public.review_course(p_course_id uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.app_role();
  v_course public.courses;
  v_step_role public.user_role;
  v_next smallint;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_result text;
begin
  if v_role is null or v_role not in ('super_admin', 'admin', 'principal') then
    raise exception 'Only approvers can review courses';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Unknown decision %', p_decision;
  end if;

  select * into v_course from public.courses where id = p_course_id for update;
  if not found then
    raise exception 'Course not found';
  end if;
  if v_course.status <> 'pending_approval' then
    raise exception 'This course is not awaiting approval';
  end if;

  select approver_role into v_step_role from public.approval_steps
   where workflow = 'course_publication' and step_order = v_course.approval_step;
  if v_role <> 'super_admin' and v_step_role is distinct from v_role then
    raise exception 'This course is waiting for % approval',
      coalesce(initcap(replace(v_step_role::text, '_', ' ')), 'another');
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'Give a reason when rejecting a course';
  end if;

  insert into public.course_approvals (course_id, step_order, reviewer_id, reviewer_role, decision, note)
  values (v_course.id, coalesce(v_course.approval_step, 0), auth.uid(), v_role,
          case when p_decision = 'reject' then 'rejected' else 'approved' end, v_note);

  perform set_config('bigsms.review', 'on', true);

  if p_decision = 'reject' then
    update public.courses
       set status = 'rejected', review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(), approval_step = null
     where id = v_course.id;
    v_result := 'rejected';
  else
    select min(step_order) into v_next from public.approval_steps
     where workflow = 'course_publication' and step_order > coalesce(v_course.approval_step, 0);
    if v_next is not null and v_role <> 'super_admin' then
      update public.courses
         set approval_step = v_next, review_note = coalesce(v_note, review_note)
       where id = v_course.id
      returning * into v_course;
      perform public.notify(v_course.professor_id, 'Course approved by ' || initcap(v_role::text),
        v_course.title || ' moves to the next approval step.', '/professor/courses/' || v_course.id);
      perform public.notify_step_approvers(v_course);
      v_result := 'advanced';
    else
      update public.courses
         set status = 'published', review_note = coalesce(v_note, review_note),
             reviewed_by = auth.uid(), reviewed_at = now(), approval_step = null
       where id = v_course.id;
      v_result := 'published';
    end if;
  end if;

  perform set_config('bigsms.review', 'off', true);
  return v_result;
end;
$$;
revoke execute on function public.review_course(uuid, text, text) from public, anon;
grant execute on function public.review_course(uuid, text, text) to authenticated;

-- Replace a workflow's steps (Super Admin only). Courses already pending restart at step 1.
create or replace function public.set_approval_workflow(p_workflow text, p_roles public.user_role[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_course public.courses;
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can change approval workflows';
  end if;
  if p_workflow <> 'course_publication' then
    raise exception 'Unknown workflow %', p_workflow;
  end if;
  if coalesce(array_length(p_roles, 1), 0) = 0 then
    raise exception 'A workflow needs at least one approval step';
  end if;
  if exists (select 1 from unnest(p_roles) r where r not in ('admin', 'principal')) then
    raise exception 'Approvers must be Admin or Principal';
  end if;
  if (select count(distinct r) from unnest(p_roles) r) <> array_length(p_roles, 1) then
    raise exception 'Each role can appear only once in a workflow';
  end if;

  delete from public.approval_steps where workflow = p_workflow;
  insert into public.approval_steps (workflow, step_order, approver_role)
  select p_workflow, t.ord, t.r from unnest(p_roles) with ordinality as t(r, ord);

  perform set_config('bigsms.review', 'on', true);
  for v_course in
    update public.courses set approval_step = 1
     where status = 'pending_approval'
    returning *
  loop
    perform public.notify_step_approvers(v_course);
  end loop;
  perform set_config('bigsms.review', 'off', true);
end;
$$;
revoke execute on function public.set_approval_workflow(text, public.user_role[]) from public, anon;
grant execute on function public.set_approval_workflow(text, public.user_role[]) to authenticated;
