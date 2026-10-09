-- Attendance management.
--
-- Staff and Faculty: a daily attendance register for every employee (Super Admin, Admin,
--   Admin Manager, Principal, Faculty, Staff), kept by the Principal and the Admin Manager.
--   Nobody marks their own attendance. Admins read every record; employees read their own.
-- Students: Faculty keep course registers (operations and faculty migrations). A register can
--   now be for one class (batch) of the course, and only its students can be marked. Only the
--   course's Faculty enter student attendance; the Principal, Admins and the Admin Manager read
--   it, and students read their own once the register is submitted.

-- Staff and Faculty attendance -------------------------------------------------------
create type public.staff_attendance_status as enum ('present', 'late', 'half_day', 'absent', 'leave');

create or replace function public.marks_staff_attendance()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() in ('principal', 'admin_manager'), false);
$$;

create table public.staff_attendance (
  employee_id  uuid not null references public.profiles (id) on delete restrict,
  attended_on  date not null,
  status       public.staff_attendance_status not null,
  check_in     time,
  check_out    time,
  note         text not null default '',
  marked_by    uuid references public.profiles (id) on delete set null,
  marked_at    timestamptz not null default now(),
  primary key (employee_id, attended_on),
  check (check_out is null or check_in is null or check_out >= check_in)
);
create index staff_attendance_day_idx on public.staff_attendance (attended_on desc);
create index staff_attendance_marked_by_idx on public.staff_attendance (marked_by);

create or replace function public.guard_staff_attendance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.employee_id = auth.uid() then
    raise exception 'You cannot mark your own attendance';
  end if;
  if tg_op = 'UPDATE' and (new.employee_id, new.attended_on) is distinct from (old.employee_id, old.attended_on) then
    raise exception 'Mark a different day or employee with a new record';
  end if;
  if not public.is_employee(new.employee_id) then
    raise exception 'Staff attendance is only for staff, Faculty and administrators';
  end if;
  if new.attended_on > current_date then
    raise exception 'Attendance cannot be marked for a future date';
  end if;
  if new.status in ('absent', 'leave') then
    new.check_in := null;
    new.check_out := null;
  end if;
  new.note := trim(new.note);
  new.marked_by := coalesce(auth.uid(), new.marked_by);
  new.marked_at := now();
  return new;
end;
$$;
create trigger staff_attendance_guard before insert or update on public.staff_attendance
  for each row execute function public.guard_staff_attendance();

alter table public.staff_attendance enable row level security;
create policy staff_attendance_select on public.staff_attendance for select to authenticated using (
  (select public.marks_staff_attendance())
  or (select public.is_overseer())
  or (employee_id = (select auth.uid()) and (select public.is_active()))
);
create policy staff_attendance_write on public.staff_attendance for all to authenticated
  using ((select public.marks_staff_attendance())) with check ((select public.marks_staff_attendance()));

create trigger audit_staff_attendance after insert or update or delete on public.staff_attendance
  for each row execute function public.audit_row();

-- The day's register: every active employee and their record, if marked. The Admin Manager
-- cannot read administrator profiles, so the names come from here.
create or replace function public.staff_attendance_register(p_day date)
returns table (employee_id uuid, full_name text, user_code text, role public.user_role, department text,
               status public.staff_attendance_status, check_in time, check_out time, note text, marked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (public.marks_staff_attendance() or public.is_overseer()) then
    raise exception 'Only the Principal, the Admin Manager and Admins can see staff attendance';
  end if;
  return query
    select p.id, p.full_name, p.user_code, p.role, p.department,
           a.status, a.check_in, a.check_out, a.note, a.marked_at
      from public.profiles p
      left join public.staff_attendance a on a.employee_id = p.id and a.attended_on = p_day
     where p.status = 'active' and public.is_employee(p.id)
     order by p.role, p.full_name;
end;
$$;
revoke execute on function public.staff_attendance_register(date) from public, anon;
grant execute on function public.staff_attendance_register(date) to authenticated;

-- Totals per employee between two dates. Half a day counts as half attended; leave is
-- left out of the rate.
create or replace function public.staff_attendance_summary(p_from date, p_to date)
returns table (employee_id uuid, full_name text, user_code text, role public.user_role, days bigint,
               present bigint, late bigint, half_day bigint, absent bigint, leave bigint, rate numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (public.marks_staff_attendance() or public.is_overseer()) then
    raise exception 'Only the Principal, the Admin Manager and Admins can see staff attendance';
  end if;
  return query
    select p.id, p.full_name, p.user_code, p.role,
           count(a.attended_on),
           count(*) filter (where a.status = 'present'),
           count(*) filter (where a.status = 'late'),
           count(*) filter (where a.status = 'half_day'),
           count(*) filter (where a.status = 'absent'),
           count(*) filter (where a.status = 'leave'),
           round(100.0 * (count(*) filter (where a.status in ('present', 'late')) + 0.5 * count(*) filter (where a.status = 'half_day'))
                 / nullif(count(*) filter (where a.status <> 'leave'), 0), 1)
      from public.profiles p
      left join public.staff_attendance a on a.employee_id = p.id and a.attended_on between p_from and p_to
     where public.is_employee(p.id)
       and (p.status = 'active' or a.attended_on is not null)
     group by p.id, p.full_name, p.user_code, p.role
     order by p.role, p.full_name;
end;
$$;
revoke execute on function public.staff_attendance_summary(date, date) from public, anon;
grant execute on function public.staff_attendance_summary(date, date) to authenticated;

-- Student attendance by class ---------------------------------------------------------
alter table public.attendance_sessions
  add column batch_id uuid references public.course_batches (id) on delete restrict;
create index attendance_sessions_batch_idx on public.attendance_sessions (batch_id);

create or replace function public.attendance_submitted(p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attendance_sessions where id = p_session_id and submitted_at is not null);
$$;

-- Is the student in the register's class: enrolled in its course and, for a batch
-- register, in that batch.
create or replace function public.in_attendance_class(p_session_id uuid, p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.attendance_sessions s
      join public.enrollments e on e.course_id = s.course_id and e.student_id = p_student_id
     where s.id = p_session_id and (s.batch_id is null or e.batch_id = s.batch_id)
  );
$$;

create or replace function public.guard_attendance_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.submitted_at is not null and public.app_role() = 'professor' and not public.review_mode() then
      raise exception 'Submitted attendance cannot be deleted';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.taken_by := coalesce(auth.uid(), new.taken_by);
    if auth.uid() is not null and not public.review_mode() then
      new.submitted_at := null;
      new.submitted_by := null;
    end if;
  else
    if new.course_id is distinct from old.course_id then
      raise exception 'An attendance session cannot move to another course';
    end if;
    if new.batch_id is distinct from old.batch_id then
      raise exception 'An attendance session cannot move to another class';
    end if;
    if auth.uid() is not null and not public.review_mode() then
      if old.submitted_at is not null and public.app_role() = 'professor'
         and (new.held_on, new.topic) is distinct from (old.held_on, old.topic) then
        raise exception 'This attendance has been submitted. Request a change; the Principal must approve it';
      end if;
      new.submitted_at := old.submitted_at;
      new.submitted_by := old.submitted_by;
    end if;
  end if;
  if new.batch_id is not null
     and not exists (select 1 from public.course_batches where id = new.batch_id and course_id = new.course_id) then
    raise exception 'That class is not a batch of this course';
  end if;
  new.topic := trim(new.topic);
  if new.held_on > current_date then
    raise exception 'Attendance cannot be taken for a future date';
  end if;
  return new;
end;
$$;

create or replace function public.guard_attendance_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.attendance_locked(new.session_id) then
    raise exception 'This attendance has been submitted. Request a change; the Principal must approve it';
  end if;
  if tg_op = 'UPDATE' and (new.session_id is distinct from old.session_id or new.student_id is distinct from old.student_id) then
    raise exception 'Mark a different student with a new record';
  end if;
  -- An approved change may correct a record of a student who has since changed batch.
  if (tg_op = 'INSERT' or not public.review_mode()) and not public.in_attendance_class(new.session_id, new.student_id) then
    raise exception 'That student is not in this class';
  end if;
  new.note := trim(new.note);
  if not public.review_mode() then
    new.marked_by := coalesce(auth.uid(), new.marked_by);
  end if;
  new.marked_at := now();
  return new;
end;
$$;

create or replace function public.submit_attendance(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_session public.attendance_sessions;
  v_missing integer;
  v_student uuid;
begin
  select * into v_session from public.attendance_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Attendance session not found';
  end if;
  if not public.is_professor_of(v_session.course_id) then
    raise exception 'Only the class''s Faculty can submit its attendance';
  end if;
  if v_session.submitted_at is not null then
    raise exception 'This attendance has already been submitted';
  end if;
  select count(*) into v_missing
    from public.enrollments e
   where e.course_id = v_session.course_id
     and (v_session.batch_id is null or e.batch_id = v_session.batch_id)
     and not exists (select 1 from public.attendance_records r where r.session_id = v_session.id and r.student_id = e.student_id);
  if v_missing > 0 then
    raise exception 'Mark every student before submitting (% not marked)', v_missing;
  end if;

  perform set_config('bigsms.review', 'on', true);
  update public.attendance_sessions set submitted_at = now(), submitted_by = auth.uid() where id = v_session.id;
  perform set_config('bigsms.review', 'off', true);

  for v_student in select student_id from public.attendance_records where session_id = v_session.id and status = 'absent' loop
    perform public.notify_absent(v_student, v_session.id);
  end loop;
end;
$$;

-- Only the course's Faculty enter student attendance. The Principal, Admins and the Admin
-- Manager read it; students read their own records of submitted registers.
drop policy attendance_sessions_select on public.attendance_sessions;
create policy attendance_sessions_select on public.attendance_sessions for select to authenticated using (
  (select public.is_overseer()) or (select public.manages_students()) or public.is_professor_of(course_id)
  or (public.is_enrolled(course_id) and submitted_at is not null)
);
drop policy attendance_sessions_write on public.attendance_sessions;
create policy attendance_sessions_write on public.attendance_sessions for all to authenticated
  using (public.is_professor_of(course_id)) with check (public.is_professor_of(course_id));

drop policy attendance_records_select on public.attendance_records;
create policy attendance_records_select on public.attendance_records for select to authenticated using (
  (select public.is_overseer()) or (select public.manages_students())
  or public.is_professor_of(public.attendance_course(session_id))
  or (student_id = (select auth.uid()) and (select public.is_active()) and public.attendance_submitted(session_id))
);
drop policy attendance_records_write on public.attendance_records;
create policy attendance_records_write on public.attendance_records for all to authenticated
  using (public.is_professor_of(public.attendance_course(session_id)))
  with check (public.is_professor_of(public.attendance_course(session_id)));

-- The class roster now carries each student's batch.
drop function public.class_roster(uuid);
create function public.class_roster(p_course_id uuid default null)
returns table (course_id uuid, student_id uuid, full_name text, user_code text, batch_id uuid, batch_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_course_id is not null and not (public.is_overseer() or public.is_professor_of(p_course_id)) then
    raise exception 'You can only see students in your own classes';
  end if;
  return query
    select e.course_id, p.id, p.full_name, p.user_code, b.id, b.name
      from public.enrollments e
      join public.courses c on c.id = e.course_id
      join public.profiles p on p.id = e.student_id
      left join public.course_batches b on b.id = e.batch_id
     where (p_course_id is null and public.app_role() = 'professor' and c.professor_id = auth.uid())
        or e.course_id = p_course_id
     order by p.full_name;
end;
$$;
revoke execute on function public.class_roster(uuid) from public, anon;
grant execute on function public.class_roster(uuid) to authenticated;

-- Per-student attendance in one course, from submitted registers. For the Principal, Admins,
-- the Admin Manager and the course's Faculty.
create or replace function public.course_attendance_students(p_course_id uuid)
returns table (student_id uuid, full_name text, user_code text, batch_name text,
               sessions bigint, present bigint, late bigint, absent bigint, excused bigint, rate numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (public.is_overseer() or public.manages_students() or public.is_professor_of(p_course_id)) then
    raise exception 'Not allowed';
  end if;
  return query
    select p.id, p.full_name, p.user_code, b.name,
           count(r.session_id),
           count(*) filter (where r.status = 'present'),
           count(*) filter (where r.status = 'late'),
           count(*) filter (where r.status = 'absent'),
           count(*) filter (where r.status = 'excused'),
           round(100.0 * count(*) filter (where r.status in ('present', 'late'))
                 / nullif(count(*) filter (where r.status <> 'excused'), 0), 1)
      from public.enrollments e
      join public.profiles p on p.id = e.student_id
      left join public.course_batches b on b.id = e.batch_id
      left join public.attendance_sessions s on s.course_id = e.course_id and s.submitted_at is not null
      left join public.attendance_records r on r.session_id = s.id and r.student_id = e.student_id
     where e.course_id = p_course_id
     group by p.id, p.full_name, p.user_code, b.name
     order by p.full_name;
end;
$$;
revoke execute on function public.course_attendance_students(uuid) from public, anon;
grant execute on function public.course_attendance_students(uuid) to authenticated;

-- Attendance by course counts submitted registers only, like the per-student view.
create or replace function public.course_attendance()
returns table (course_id uuid, title text, professor_name text, sessions bigint, last_held date, marked bigint, rate numeric)
language sql stable set search_path = '' as $$
  select c.id, c.title, p.full_name,
         count(distinct s.id), max(s.held_on), count(r.student_id),
         round(100.0 * count(*) filter (where r.status in ('present', 'late'))
               / nullif(count(*) filter (where r.status <> 'excused'), 0), 1)
    from public.courses c
    join public.profiles p on p.id = c.professor_id
    left join public.attendance_sessions s on s.course_id = c.id and s.submitted_at is not null
    left join public.attendance_records r on r.session_id = s.id
   where c.status = 'published'
   group by c.id, c.title, p.full_name
   order by c.title;
$$;
