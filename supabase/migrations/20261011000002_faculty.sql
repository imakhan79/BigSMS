-- Faculty (professor role): limited, class-scoped access to students.
--
-- Faculty can view, for students enrolled in their own courses (their assigned classes) only:
--   name, System ID, attendance, marks, progress, assignments and submission status,
--   class timetable, exam results and the final report.
-- Faculty can enter attendance, exam marks, assignment grades and submission status,
-- and final reports.
-- Faculty cannot see student contact details, student records or any financial data,
-- cannot edit student profiles, and cannot enrol or remove students (the Admin Manager does).
--
-- Results are entered as a draft and then submitted. Once submitted they are locked:
-- Faculty may request a change, which takes effect only when the Principal approves it.
-- Graded assignments are submitted when the grade is saved.

-- Set inside security-definer functions while they apply an approved or system change.
create or replace function public.review_mode()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('bigsms.review', true), '') = 'on';
$$;

-- Visibility ----------------------------------------------------------------------
-- Faculty no longer read student profiles (which hold email and phone). They see their
-- students' name and System ID through class_roster().
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select public.is_overseer())
  or ((select public.is_admin_manager()) and role in ('professor', 'staff', 'student', 'parent'))
  or ((select public.is_active()) and role in ('professor', 'principal', 'admin_manager'))
  or public.is_parent_of(id)
);

-- Enrollment belongs to the student office.
drop policy enrollments_insert on public.enrollments;
create policy enrollments_insert on public.enrollments for insert to authenticated with check (
  (select public.manages_students())
  and exists (select 1 from public.profiles p where p.id = student_id and p.role = 'student')
);
drop policy enrollments_delete on public.enrollments;
create policy enrollments_delete on public.enrollments for delete to authenticated
  using ((select public.manages_students()));

-- Students in one class, or (no course given) in every class the caller teaches.
create or replace function public.class_roster(p_course_id uuid default null)
returns table (course_id uuid, student_id uuid, full_name text, user_code text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_course_id is not null and not (public.is_overseer() or public.is_professor_of(p_course_id)) then
    raise exception 'You can only see students in your own classes';
  end if;
  return query
    select e.course_id, p.id, p.full_name, p.user_code
      from public.enrollments e
      join public.courses c on c.id = e.course_id
      join public.profiles p on p.id = e.student_id
     where (p_course_id is null and public.app_role() = 'professor' and c.professor_id = auth.uid())
        or e.course_id = p_course_id
     order by p.full_name;
end;
$$;
revoke execute on function public.class_roster(uuid) from public, anon;
grant execute on function public.class_roster(uuid) to authenticated;

-- Per-student progress in one course. Email is for overseers only; Faculty get the System ID.
drop function public.course_student_progress(uuid);
create function public.course_student_progress(p_course_id uuid)
returns table (
  student_id uuid,
  full_name text,
  email text,
  user_code text,
  completion_rate numeric,
  quiz_avg numeric,
  assignment_avg numeric,
  attendance_rate numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_overseer() or public.is_professor_of(p_course_id)) then
    raise exception 'Not allowed';
  end if;

  return query
    select
      p.id,
      p.full_name,
      case when public.is_overseer() then p.email end,
      p.user_code,
      round(coalesce(
        (select count(*) from public.lecture_progress lp where lp.course_id = p_course_id and lp.student_id = p.id)::numeric
        / nullif((select count(*) from public.lectures l where l.course_id = p_course_id), 0) * 100, 0), 1),
      (select round(avg(a.score::numeric / nullif(a.total, 0) * 100), 1)
         from public.quiz_attempts a join public.quizzes qz on qz.id = a.quiz_id
        where qz.course_id = p_course_id and a.student_id = p.id),
      (select round(avg(s.score / asg.max_score * 100), 1)
         from public.submissions s join public.assignments asg on asg.id = s.assignment_id
        where asg.course_id = p_course_id and s.student_id = p.id and s.status = 'graded'),
      (select round(100.0 * count(*) filter (where r.status in ('present', 'late'))
                    / nullif(count(*) filter (where r.status <> 'excused'), 0), 1)
         from public.attendance_records r join public.attendance_sessions s on s.id = r.session_id
        where s.course_id = p_course_id and r.student_id = p.id)
    from public.enrollments e
    join public.profiles p on p.id = e.student_id
    where e.course_id = p_course_id
    order by p.full_name;
end;
$$;
revoke execute on function public.course_student_progress(uuid) from public, anon;
grant execute on function public.course_student_progress(uuid) to authenticated;

-- Attendance: draft, then submitted ---------------------------------------------
alter table public.attendance_sessions
  add column submitted_at timestamptz,
  add column submitted_by uuid references public.profiles (id) on delete set null;
create index attendance_sessions_submitted_by_idx on public.attendance_sessions (submitted_by);
-- Registers taken before this change count as submitted.
update public.attendance_sessions set submitted_at = created_at, submitted_by = taken_by;

create or replace function public.attendance_locked(p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_role() = 'professor' and not public.review_mode()
     and exists (select 1 from public.attendance_sessions where id = p_session_id and submitted_at is not null);
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
    if auth.uid() is not null and not public.review_mode() then
      if old.submitted_at is not null and public.app_role() = 'professor'
         and (new.held_on, new.topic) is distinct from (old.held_on, old.topic) then
        raise exception 'This attendance has been submitted. Request a change; the Principal must approve it';
      end if;
      new.submitted_at := old.submitted_at;
      new.submitted_by := old.submitted_by;
    end if;
  end if;
  new.topic := trim(new.topic);
  if new.held_on > current_date then
    raise exception 'Attendance cannot be taken for a future date';
  end if;
  return new;
end;
$$;
drop trigger attendance_sessions_guard on public.attendance_sessions;
create trigger attendance_sessions_guard before insert or update or delete on public.attendance_sessions
  for each row execute function public.guard_attendance_session();

create or replace function public.guard_attendance_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.attendance_locked(new.session_id) then
    raise exception 'This attendance has been submitted. Request a change; the Principal must approve it';
  end if;
  if tg_op = 'UPDATE' and (new.session_id is distinct from old.session_id or new.student_id is distinct from old.student_id) then
    raise exception 'Mark a different student with a new record';
  end if;
  if not exists (
    select 1 from public.enrollments
     where course_id = public.attendance_course(new.session_id) and student_id = new.student_id
  ) then
    raise exception 'That student is not enrolled in this course';
  end if;
  new.note := trim(new.note);
  if not public.review_mode() then
    new.marked_by := coalesce(auth.uid(), new.marked_by);
  end if;
  new.marked_at := now();
  return new;
end;
$$;

create or replace function public.guard_attendance_record_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.attendance_locked(old.session_id) then
    raise exception 'This attendance has been submitted. Request a change; the Principal must approve it';
  end if;
  return old;
end;
$$;
create trigger attendance_records_guard_delete before delete on public.attendance_records
  for each row execute function public.guard_attendance_record_delete();

-- Absences are announced once the register is submitted, not while it is a draft.
create or replace function public.notify_absent(p_student_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
  v_held date;
  v_parent uuid;
begin
  select c.title, s.held_on into v_title, v_held
    from public.attendance_sessions s join public.courses c on c.id = s.course_id
   where s.id = p_session_id;
  perform public.notify(p_student_id, 'Marked absent', v_title || ' on ' || to_char(v_held, 'DD Mon YYYY'), '/student/attendance');
  for v_parent in select parent_id from public.parent_students where student_id = p_student_id loop
    perform public.notify(v_parent, 'Your child was marked absent',
      (select full_name from public.profiles where id = p_student_id) || ': ' || v_title || ' on ' || to_char(v_held, 'DD Mon YYYY'),
      '/parent/children/' || p_student_id || '?tab=attendance');
  end loop;
end;
$$;
revoke execute on function public.notify_absent(uuid, uuid) from public, anon, authenticated;

create or replace function public.notify_absence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'absent' or (tg_op = 'UPDATE' and old.status = 'absent') then
    return new;
  end if;
  if exists (select 1 from public.attendance_sessions where id = new.session_id and submitted_at is not null) then
    perform public.notify_absent(new.student_id, new.session_id);
  end if;
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
  if not (public.is_professor_of(v_session.course_id) or public.is_admin()) then
    raise exception 'Only the class''s Faculty can submit its attendance';
  end if;
  if v_session.submitted_at is not null then
    raise exception 'This attendance has already been submitted';
  end if;
  select count(*) into v_missing
    from public.enrollments e
   where e.course_id = v_session.course_id
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
revoke execute on function public.submit_attendance(uuid) from public, anon;
grant execute on function public.submit_attendance(uuid) to authenticated;

-- Assignments: submission status and grading -------------------------------------
-- Faculty may record a status for a student who did not submit online (handed in on
-- paper, missing, excused). A saved grade is final; changing it needs the Principal.
drop policy submissions_insert on public.submissions;
create policy submissions_insert on public.submissions for insert to authenticated with check (
  (student_id = (select auth.uid())
    and public.is_enrolled(public.assignment_course(assignment_id))
    and exists (select 1 from public.assignments a where a.id = assignment_id and a.published))
  or public.is_professor_of(public.assignment_course(assignment_id))
);

create or replace function public.guard_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
begin
  if auth.uid() is null or public.is_admin() or public.review_mode() then
    return new;
  end if;

  -- The student's own work: editable until graded.
  if new.student_id = auth.uid() then
    if tg_op = 'UPDATE' and old.status = 'graded' then
      raise exception 'Graded submissions cannot be changed';
    end if;
    new.status := 'submitted';
    new.score := null;
    new.feedback := null;
    new.graded_at := null;
    new.graded_by := null;
    new.submitted_at := now();
    return new;
  end if;

  -- Faculty
  select max_score into v_max from public.assignments where id = new.assignment_id;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.enrollments
                    where course_id = public.assignment_course(new.assignment_id) and student_id = new.student_id) then
      raise exception 'That student is not enrolled in this course';
    end if;
    if new.status not in ('submitted', 'missing', 'excused') then
      raise exception 'Record the submission status first, then grade it';
    end if;
    new.content := case when new.status = 'submitted' then 'Handed in (recorded by Faculty)' else '' end;
    new.link_url := null;
    new.score := null;
    new.feedback := null;
    new.graded_at := null;
    new.graded_by := null;
    new.submitted_at := now();
    return new;
  end if;

  if old.status = 'graded' then
    raise exception 'This grade has been submitted. Request a change; the Principal must approve it';
  end if;
  new.content := old.content;
  new.link_url := old.link_url;
  new.student_id := old.student_id;
  new.assignment_id := old.assignment_id;
  new.submitted_at := old.submitted_at;
  if new.status = 'graded' then
    if new.score is null then
      raise exception 'A score is required to grade a submission';
    end if;
    if new.score > v_max then
      raise exception 'Score cannot be more than %', v_max;
    end if;
    new.graded_at := now();
    new.graded_by := auth.uid();
  else
    new.score := null;
    new.graded_at := null;
    new.graded_by := null;
  end if;
  return new;
end;
$$;

-- Grades must not disappear or change scale behind the Principal's back.
create or replace function public.guard_assignment_grades()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.app_role() is distinct from 'professor' or public.review_mode() then
    return coalesce(new, old);
  end if;
  if not exists (select 1 from public.submissions where assignment_id = old.id and status = 'graded') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'This assignment has submitted grades and cannot be deleted';
  end if;
  if new.max_score is distinct from old.max_score then
    raise exception 'The maximum score cannot change once grades are submitted';
  end if;
  return new;
end;
$$;
create trigger assignments_grades_guard before update or delete on public.assignments
  for each row execute function public.guard_assignment_grades();

-- Exams and marks -----------------------------------------------------------------
create table public.exams (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  kind          text not null default 'class_test' check (kind in ('class_test', 'midterm', 'final', 'practical', 'other')),
  held_on       date not null default current_date,
  max_marks     numeric(6, 2) not null check (max_marks > 0),
  created_by    uuid references public.profiles (id) on delete set null,
  submitted_at  timestamptz,
  submitted_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index exams_course_idx on public.exams (course_id, held_on desc);
create index exams_created_by_idx on public.exams (created_by);
create index exams_submitted_by_idx on public.exams (submitted_by);
create trigger exams_updated_at before update on public.exams
  for each row execute function public.set_updated_at();

create table public.exam_results (
  exam_id     uuid not null references public.exams (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  marks       numeric(6, 2) check (marks >= 0),
  absent      boolean not null default false,
  remarks     text not null default '',
  entered_by  uuid references public.profiles (id) on delete set null,
  entered_at  timestamptz not null default now(),
  primary key (exam_id, student_id),
  check ((absent and marks is null) or (not absent and marks is not null))
);
create index exam_results_student_idx on public.exam_results (student_id);
create index exam_results_entered_by_idx on public.exam_results (entered_by);

create or replace function public.exam_course(p_exam_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select course_id from public.exams where id = p_exam_id;
$$;

create or replace function public.exam_submitted(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.exams where id = p_exam_id and submitted_at is not null);
$$;

create or replace function public.guard_exam()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.submitted_at is not null and public.app_role() = 'professor' and not public.review_mode() then
      raise exception 'Submitted exam results cannot be deleted';
    end if;
    return old;
  end if;
  new.title := trim(new.title);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if auth.uid() is not null and not public.review_mode() then
      new.submitted_at := null;
      new.submitted_by := null;
    end if;
    return new;
  end if;
  if new.course_id is distinct from old.course_id then
    raise exception 'An exam cannot move to another course';
  end if;
  if auth.uid() is not null and not public.review_mode() then
    if old.submitted_at is not null and public.app_role() = 'professor'
       and (new.title, new.kind, new.held_on, new.max_marks) is distinct from (old.title, old.kind, old.held_on, old.max_marks) then
      raise exception 'These exam results have been submitted. Request a change; the Principal must approve it';
    end if;
    new.submitted_at := old.submitted_at;
    new.submitted_by := old.submitted_by;
  end if;
  if new.max_marks < old.max_marks and exists (select 1 from public.exam_results where exam_id = old.id and marks > new.max_marks) then
    raise exception 'Some students already have more marks than the new maximum';
  end if;
  return new;
end;
$$;
create trigger exams_guard before insert or update or delete on public.exams
  for each row execute function public.guard_exam();

create or replace function public.exam_locked(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_role() = 'professor' and not public.review_mode() and public.exam_submitted(p_exam_id);
$$;

create or replace function public.guard_exam_result()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max numeric;
begin
  if tg_op = 'DELETE' then
    if public.exam_locked(old.exam_id) then
      raise exception 'These exam results have been submitted. Request a change; the Principal must approve it';
    end if;
    return old;
  end if;
  if public.exam_locked(new.exam_id) then
    raise exception 'These exam results have been submitted. Request a change; the Principal must approve it';
  end if;
  if tg_op = 'UPDATE' and (new.exam_id is distinct from old.exam_id or new.student_id is distinct from old.student_id) then
    raise exception 'Enter marks for a different student with a new record';
  end if;
  if not exists (select 1 from public.enrollments where course_id = public.exam_course(new.exam_id) and student_id = new.student_id) then
    raise exception 'That student is not enrolled in this course';
  end if;
  select max_marks into v_max from public.exams where id = new.exam_id;
  if new.absent then
    new.marks := null;
  elsif new.marks > v_max then
    raise exception 'Marks cannot be more than %', v_max;
  end if;
  new.remarks := trim(new.remarks);
  if not public.review_mode() then
    new.entered_by := coalesce(auth.uid(), new.entered_by);
  end if;
  new.entered_at := now();
  return new;
end;
$$;
create trigger exam_results_guard before insert or update or delete on public.exam_results
  for each row execute function public.guard_exam_result();

create or replace function public.submit_exam(p_exam_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_exam public.exams;
  v_missing integer;
begin
  select * into v_exam from public.exams where id = p_exam_id for update;
  if not found then
    raise exception 'Exam not found';
  end if;
  if not (public.is_professor_of(v_exam.course_id) or public.is_admin()) then
    raise exception 'Only the class''s Faculty can submit its results';
  end if;
  if v_exam.submitted_at is not null then
    raise exception 'These results have already been submitted';
  end if;
  if v_exam.held_on > current_date then
    raise exception 'Results can be submitted once the exam has been held';
  end if;
  select count(*) into v_missing
    from public.enrollments e
   where e.course_id = v_exam.course_id
     and not exists (select 1 from public.exam_results r where r.exam_id = v_exam.id and r.student_id = e.student_id);
  if v_missing > 0 then
    raise exception 'Enter marks for every student before submitting (% missing)', v_missing;
  end if;
  perform set_config('bigsms.review', 'on', true);
  update public.exams set submitted_at = now(), submitted_by = auth.uid() where id = v_exam.id;
  perform set_config('bigsms.review', 'off', true);
end;
$$;
revoke execute on function public.submit_exam(uuid) from public, anon;
grant execute on function public.submit_exam(uuid) to authenticated;

alter table public.exams enable row level security;
create policy exams_select on public.exams for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(course_id)
  or (submitted_at is not null and (public.is_enrolled(course_id) or public.parent_sees_course(course_id)))
);
create policy exams_write on public.exams for all to authenticated
  using ((select public.is_admin()) or public.is_professor_of(course_id))
  with check ((select public.is_admin()) or public.is_professor_of(course_id));

alter table public.exam_results enable row level security;
create policy exam_results_select on public.exam_results for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.exam_course(exam_id))
  or (public.exam_submitted(exam_id)
      and ((student_id = (select auth.uid()) and (select public.is_active())) or public.is_parent_of(student_id)))
);
create policy exam_results_write on public.exam_results for all to authenticated
  using ((select public.is_admin()) or public.is_professor_of(public.exam_course(exam_id)))
  with check ((select public.is_admin()) or public.is_professor_of(public.exam_course(exam_id)));

-- Final reports -------------------------------------------------------------------
create table public.final_reports (
  course_id     uuid not null references public.courses (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  percentage    numeric(5, 1) check (percentage between 0 and 100),
  grade         text not null default '' check (length(grade) <= 10),
  remarks       text not null default '',
  entered_by    uuid references public.profiles (id) on delete set null,
  updated_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  submitted_by  uuid references public.profiles (id) on delete set null,
  primary key (course_id, student_id)
);
create index final_reports_student_idx on public.final_reports (student_id);
create index final_reports_entered_by_idx on public.final_reports (entered_by);
create index final_reports_submitted_by_idx on public.final_reports (submitted_by);

create or replace function public.guard_final_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.submitted_at is not null and public.app_role() = 'professor' and not public.review_mode() then
      raise exception 'This final report has been submitted. Request a change; the Principal must approve it';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.course_id is distinct from old.course_id or new.student_id is distinct from old.student_id then
      raise exception 'Write a report for a different student with a new record';
    end if;
    if old.submitted_at is not null and public.app_role() = 'professor' and not public.review_mode() then
      raise exception 'This final report has been submitted. Request a change; the Principal must approve it';
    end if;
  end if;
  if not exists (select 1 from public.enrollments where course_id = new.course_id and student_id = new.student_id) then
    raise exception 'That student is not enrolled in this course';
  end if;
  if auth.uid() is not null and not public.review_mode() then
    new.submitted_at := case when tg_op = 'UPDATE' then old.submitted_at end;
    new.submitted_by := case when tg_op = 'UPDATE' then old.submitted_by end;
    new.entered_by := auth.uid();
  end if;
  new.grade := upper(trim(new.grade));
  new.remarks := trim(new.remarks);
  new.updated_at := now();
  return new;
end;
$$;
create trigger final_reports_guard before insert or update or delete on public.final_reports
  for each row execute function public.guard_final_report();

create or replace function public.submit_final_reports(p_course_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_missing integer;
  v_count integer;
begin
  if not (public.is_professor_of(p_course_id) or public.is_admin()) then
    raise exception 'Only the class''s Faculty can submit its final report';
  end if;
  select count(*) into v_missing
    from public.enrollments e
   where e.course_id = p_course_id
     and not exists (select 1 from public.final_reports f
                      where f.course_id = p_course_id and f.student_id = e.student_id
                        and f.percentage is not null and f.grade <> '');
  if v_missing > 0 then
    raise exception 'Enter a percentage and grade for every student before submitting (% missing)', v_missing;
  end if;
  perform set_config('bigsms.review', 'on', true);
  update public.final_reports set submitted_at = now(), submitted_by = auth.uid()
   where course_id = p_course_id and submitted_at is null;
  get diagnostics v_count = row_count;
  perform set_config('bigsms.review', 'off', true);
  if v_count = 0 then
    raise exception 'There is nothing new to submit';
  end if;
  return v_count;
end;
$$;
revoke execute on function public.submit_final_reports(uuid) from public, anon;
grant execute on function public.submit_final_reports(uuid) to authenticated;

alter table public.final_reports enable row level security;
create policy final_reports_select on public.final_reports for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(course_id)
  or (submitted_at is not null
      and ((student_id = (select auth.uid()) and (select public.is_active())) or public.is_parent_of(student_id)))
);
create policy final_reports_write on public.final_reports for all to authenticated
  using ((select public.is_admin()) or public.is_professor_of(course_id))
  with check ((select public.is_admin()) or public.is_professor_of(course_id));

-- Changes to submitted results: requested by Faculty, approved by the Principal ----
create type public.result_change_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table public.result_changes (
  id            uuid primary key default gen_random_uuid(),
  change_no     text not null unique,
  kind          text not null check (kind in ('attendance', 'exam_result', 'assignment_grade', 'final_report')),
  course_id     uuid not null references public.courses (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  -- attendance: the session; exam_result: the exam; assignment_grade: the assignment; final_report: the course
  target_id     uuid not null,
  label         text not null default '',
  old_value     jsonb not null,
  new_value     jsonb not null,
  reason        text not null check (length(trim(reason)) > 0),
  status        public.result_change_status not null default 'pending',
  requested_by  uuid references public.profiles (id) on delete set null,
  requested_at  timestamptz not null default now(),
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text
);
create unique index result_changes_one_pending on public.result_changes (kind, target_id, student_id) where status = 'pending';
create index result_changes_status_idx on public.result_changes (status, requested_at desc);
create index result_changes_course_idx on public.result_changes (course_id);
create index result_changes_student_idx on public.result_changes (student_id);
create index result_changes_requested_by_idx on public.result_changes (requested_by);
create index result_changes_reviewed_by_idx on public.result_changes (reviewed_by);

alter table public.result_changes enable row level security;
-- Rows change only through the functions below.
create policy result_changes_select on public.result_changes for select to authenticated
  using ((select public.is_overseer()) or public.is_professor_of(course_id));

create or replace function public.request_result_change(
  p_kind text, p_target_id uuid, p_student_id uuid, p_new jsonb, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  v_course uuid;
  v_label text;
  v_old jsonb;
  v_new jsonb;
  v_max numeric;
  v_absent boolean;
  v_num numeric;
  v_id uuid;
  v_principal uuid;
begin
  if public.app_role() is distinct from 'professor' then
    raise exception 'Only Faculty can request a change to results';
  end if;
  if v_reason = '' then
    raise exception 'Give a reason for the change';
  end if;

  if p_kind = 'attendance' then
    select s.course_id, jsonb_build_object('status', r.status, 'note', r.note),
           'Attendance, ' || to_char(s.held_on, 'DD Mon YYYY') || coalesce(nullif(' (' || s.topic || ')', ' ()'), '')
      into v_course, v_old, v_label
      from public.attendance_sessions s
      join public.attendance_records r on r.session_id = s.id and r.student_id = p_student_id
     where s.id = p_target_id and s.submitted_at is not null;
    if coalesce(p_new ->> 'status', '') not in ('present', 'late', 'absent', 'excused') then
      raise exception 'Choose an attendance status';
    end if;
    v_new := jsonb_build_object('status', p_new ->> 'status', 'note', trim(coalesce(p_new ->> 'note', '')));

  elsif p_kind = 'exam_result' then
    select e.course_id, jsonb_build_object('marks', r.marks, 'absent', r.absent, 'remarks', r.remarks), e.max_marks, e.title
      into v_course, v_old, v_max, v_label
      from public.exams e
      join public.exam_results r on r.exam_id = e.id and r.student_id = p_student_id
     where e.id = p_target_id and e.submitted_at is not null;
    v_absent := coalesce((p_new ->> 'absent')::boolean, false);
    v_num := case when v_absent then null else (nullif(p_new ->> 'marks', ''))::numeric end;
    if not v_absent and (v_num is null or v_num < 0 or v_num > v_max) then
      raise exception 'Marks must be between 0 and %', v_max;
    end if;
    v_new := jsonb_build_object('marks', v_num, 'absent', v_absent, 'remarks', trim(coalesce(p_new ->> 'remarks', '')));

  elsif p_kind = 'assignment_grade' then
    select a.course_id, jsonb_build_object('score', s.score, 'feedback', coalesce(s.feedback, '')), a.max_score, a.title
      into v_course, v_old, v_max, v_label
      from public.assignments a
      join public.submissions s on s.assignment_id = a.id and s.student_id = p_student_id
     where a.id = p_target_id and s.status = 'graded';
    v_num := (nullif(p_new ->> 'score', ''))::numeric;
    if v_num is null or v_num < 0 or v_num > v_max then
      raise exception 'Score must be between 0 and %', v_max;
    end if;
    v_new := jsonb_build_object('score', v_num, 'feedback', trim(coalesce(p_new ->> 'feedback', '')));

  elsif p_kind = 'final_report' then
    select f.course_id, jsonb_build_object('percentage', f.percentage, 'grade', f.grade, 'remarks', f.remarks), 'Final report'
      into v_course, v_old, v_label
      from public.final_reports f
     where f.course_id = p_target_id and f.student_id = p_student_id and f.submitted_at is not null;
    v_num := (nullif(p_new ->> 'percentage', ''))::numeric;
    if v_num is null or v_num < 0 or v_num > 100 then
      raise exception 'Percentage must be between 0 and 100';
    end if;
    if trim(coalesce(p_new ->> 'grade', '')) = '' then
      raise exception 'Enter a grade';
    end if;
    v_new := jsonb_build_object('percentage', round(v_num, 1), 'grade', upper(trim(p_new ->> 'grade')),
                                'remarks', trim(coalesce(p_new ->> 'remarks', '')));
  else
    raise exception 'Unknown result type %', p_kind;
  end if;

  if v_course is null then
    raise exception 'Only submitted results need approval to change; edit drafts directly';
  end if;
  if not public.is_professor_of(v_course) then
    raise exception 'You can only change results for your own classes';
  end if;
  if v_new = v_old then
    raise exception 'The new value is the same as the current one';
  end if;
  if exists (select 1 from public.result_changes
              where kind = p_kind and target_id = p_target_id and student_id = p_student_id and status = 'pending') then
    raise exception 'A change to this result is already awaiting the Principal';
  end if;

  insert into public.result_changes (change_no, kind, course_id, student_id, target_id, label, old_value, new_value, reason, requested_by)
  values (public.next_document_no('RC'), p_kind, v_course, p_student_id, p_target_id, v_label, v_old, v_new, v_reason, auth.uid())
  returning id into v_id;

  for v_principal in select id from public.profiles where role = 'principal' and status = 'active' loop
    perform public.notify(v_principal, 'Result change awaiting your approval',
      v_label || ' for ' || (select full_name from public.profiles where id = p_student_id),
      '/principal/changes/' || v_id);
  end loop;
  return v_id;
end;
$$;
revoke execute on function public.request_result_change(text, uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.request_result_change(text, uuid, uuid, jsonb, text) to authenticated;

create or replace function public.withdraw_result_change(p_change_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.result_changes set status = 'withdrawn'
   where id = p_change_id and requested_by = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Only your own pending requests can be withdrawn';
  end if;
end;
$$;
revoke execute on function public.withdraw_result_change(uuid) from public, anon;
grant execute on function public.withdraw_result_change(uuid) to authenticated;

-- The Principal (or a Super Admin) approves, which applies the change, or rejects with a note.
create or replace function public.review_result_change(p_change_id uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.app_role();
  v_change public.result_changes;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v public.result_changes;
begin
  if v_role is null or v_role not in ('principal', 'super_admin') then
    raise exception 'Result changes are approved by the Principal';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Unknown decision %', p_decision;
  end if;
  select * into v_change from public.result_changes where id = p_change_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_change.status <> 'pending' then
    raise exception 'This request has already been decided';
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'Give a reason when rejecting a change';
  end if;

  if p_decision = 'approve' then
    perform set_config('bigsms.review', 'on', true);
    if v_change.kind = 'attendance' then
      update public.attendance_records
         set status = (v_change.new_value ->> 'status')::public.attendance_status,
             note = v_change.new_value ->> 'note',
             marked_by = v_change.requested_by
       where session_id = v_change.target_id and student_id = v_change.student_id;
    elsif v_change.kind = 'exam_result' then
      update public.exam_results
         set marks = (v_change.new_value ->> 'marks')::numeric,
             absent = (v_change.new_value ->> 'absent')::boolean,
             remarks = v_change.new_value ->> 'remarks',
             entered_by = v_change.requested_by
       where exam_id = v_change.target_id and student_id = v_change.student_id;
    elsif v_change.kind = 'assignment_grade' then
      update public.submissions
         set score = (v_change.new_value ->> 'score')::numeric,
             feedback = nullif(v_change.new_value ->> 'feedback', ''),
             graded_at = now(),
             graded_by = v_change.requested_by
       where assignment_id = v_change.target_id and student_id = v_change.student_id and status = 'graded';
    else
      update public.final_reports
         set percentage = (v_change.new_value ->> 'percentage')::numeric,
             grade = v_change.new_value ->> 'grade',
             remarks = v_change.new_value ->> 'remarks',
             entered_by = v_change.requested_by
       where course_id = v_change.target_id and student_id = v_change.student_id;
    end if;
    if not found then
      raise exception 'The result this request changes no longer exists';
    end if;
    perform set_config('bigsms.review', 'off', true);
  end if;

  update public.result_changes
     set status = case when p_decision = 'approve' then 'approved' else 'rejected' end::public.result_change_status,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
   where id = v_change.id
  returning * into v;

  if v.requested_by is not null then
    perform public.notify(v.requested_by,
      case when p_decision = 'approve' then 'Result change approved' else 'Result change rejected' end,
      v.label || ' for ' || (select full_name from public.profiles where id = v.student_id)
        || case when v_note is not null then ': ' || v_note else '' end,
      '/professor/changes');
  end if;
  return v.status::text;
end;
$$;
revoke execute on function public.review_result_change(uuid, text, text) from public, anon;
grant execute on function public.review_result_change(uuid, text, text) to authenticated;

-- Audit trail
create trigger audit_exams after insert or update or delete on public.exams for each row execute function public.audit_row();
create trigger audit_exam_results after insert or update or delete on public.exam_results for each row execute function public.audit_row();
create trigger audit_final_reports after insert or update or delete on public.final_reports for each row execute function public.audit_row();
create trigger audit_result_changes after insert or update on public.result_changes for each row execute function public.audit_row();
