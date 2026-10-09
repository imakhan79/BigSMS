-- Examination management.
--
-- Exam formulation -> Exam assigned to students -> Student submission -> Exam grading -> Exam results.
--
-- Formulation: Faculty draft an exam (type, total marks, date, and for an online exam the start
--   time, duration and question paper). The paper is kept apart and students can open it only
--   once the exam has started.
-- Assignment: Faculty assign the exam to the whole course, one class (batch) or chosen
--   students, who are notified. Only assigned students see it.
-- Submission: in an online exam, students answer during the exam window (start + duration) and
--   may resubmit until it closes. Paper exams are sat in class.
-- Grading: Faculty enter marks only for the exam's students (their own course and class).
-- Results: Faculty submit the results to the Principal. The Principal approves them, which
--   publishes them to students, or returns them with a note for correction and resubmission.
--   Once published, changes go through request_result_change(), approved by the Principal.
--
-- Only the course's Faculty formulate, assign and grade. The Principal approves. Admins read.

-- Formulation and assignment ------------------------------------------------------------
alter table public.exams
  add column instructions     text not null default '',
  add column mode             text not null default 'offline' check (mode in ('offline', 'online')),
  add column starts_at        timestamptz,
  add column duration_minutes integer check (duration_minutes between 5 and 600),
  add column audience         text not null default 'course' check (audience in ('course', 'batch', 'students')),
  add column batch_id         uuid references public.course_batches (id) on delete restrict,
  add column assigned_at      timestamptz,
  add column assigned_by      uuid references public.profiles (id) on delete set null,
  add column results_status   text not null default 'draft' check (results_status in ('draft', 'pending', 'approved', 'returned')),
  add column review_note      text not null default '',
  add column approved_at      timestamptz,
  add column approved_by      uuid references public.profiles (id) on delete set null,
  add constraint exams_audience_batch check ((audience = 'batch') = (batch_id is not null)),
  add constraint exams_online_window check (mode = 'offline' or (starts_at is not null and duration_minutes is not null));
create index exams_batch_idx on public.exams (batch_id);
create index exams_assigned_by_idx on public.exams (assigned_by);
create index exams_approved_by_idx on public.exams (approved_by);

-- Exams that existed already were sat in class and are assigned to their course. Results that
-- were submitted were already visible to students, so they count as approved.
update public.exams set assigned_at = created_at, assigned_by = created_by;
update public.exams set results_status = 'approved', approved_at = submitted_at where submitted_at is not null;

-- The question paper, readable by students only once the exam has started.
create table public.exam_papers (
  exam_id    uuid primary key references public.exams (id) on delete cascade,
  paper      text not null default '',
  updated_at timestamptz not null default now()
);
create trigger exam_papers_updated_at before update on public.exam_papers
  for each row execute function public.set_updated_at();

create table public.exam_students (
  exam_id    uuid not null references public.exams (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (exam_id, student_id)
);
create index exam_students_student_idx on public.exam_students (student_id);

create or replace function public.is_exam_assigned(p_exam_id uuid, p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.exams x
      join public.enrollments e on e.course_id = x.course_id and e.student_id = p_student_id
     where x.id = p_exam_id
       and case x.audience
             when 'course' then true
             when 'batch' then e.batch_id = x.batch_id
             else exists (select 1 from public.exam_students s where s.exam_id = x.id and s.student_id = p_student_id)
           end
  );
$$;

create or replace function public.exam_audience(p_exam_id uuid)
returns table (student_id uuid)
language sql stable security definer set search_path = '' as $$
  select e.student_id
    from public.exams x
    join public.enrollments e on e.course_id = x.course_id
   where x.id = p_exam_id and public.is_exam_assigned(x.id, e.student_id);
$$;
revoke execute on function public.exam_audience(uuid) from public, anon, authenticated;

create or replace function public.exam_published(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.exams where id = p_exam_id and results_status = 'approved');
$$;

-- Is the online exam open for answers now.
create or replace function public.exam_open(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.exams
     where id = p_exam_id and mode = 'online' and assigned_at is not null
       and now() >= starts_at and now() <= starts_at + make_interval(mins => duration_minutes)
  );
$$;

create or replace function public.guard_exam()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if public.app_role() = 'professor' and not public.review_mode()
       and (old.submitted_at is not null or old.results_status = 'approved') then
      raise exception 'Exams with submitted results cannot be deleted';
    end if;
    if public.app_role() = 'professor' and not public.review_mode()
       and exists (select 1 from public.exam_submissions where exam_id = old.id) then
      raise exception 'Students have answered this exam, so it cannot be deleted';
    end if;
    return old;
  end if;

  new.title := trim(new.title);
  new.instructions := trim(new.instructions);
  if new.mode = 'offline' then
    new.starts_at := null;
    new.duration_minutes := null;
  end if;
  if new.starts_at is not null then
    new.held_on := (new.starts_at at time zone 'Asia/Karachi')::date;
  end if;
  if new.audience <> 'batch' then
    new.batch_id := null;
  elsif not exists (select 1 from public.course_batches where id = new.batch_id and course_id = new.course_id) then
    raise exception 'That class is not a batch of this course';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if auth.uid() is not null and not public.review_mode() then
      new.submitted_at := null;
      new.submitted_by := null;
      new.assigned_at := null;
      new.assigned_by := null;
      new.results_status := 'draft';
      new.review_note := '';
      new.approved_at := null;
      new.approved_by := null;
    end if;
    return new;
  end if;

  if new.course_id is distinct from old.course_id then
    raise exception 'An exam cannot move to another course';
  end if;
  if auth.uid() is not null and not public.review_mode() then
    -- Assignment and the results workflow change only through their functions.
    new.submitted_at := old.submitted_at;
    new.submitted_by := old.submitted_by;
    new.assigned_at := old.assigned_at;
    new.assigned_by := old.assigned_by;
    new.results_status := old.results_status;
    new.review_note := old.review_note;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    if public.app_role() = 'professor' then
      if old.results_status in ('pending', 'approved')
         and (new.title, new.kind, new.held_on, new.max_marks) is distinct from (old.title, old.kind, old.held_on, old.max_marks) then
        raise exception 'These exam results have been submitted. Request a change; the Principal must approve it';
      end if;
      if (exists (select 1 from public.exam_submissions where exam_id = old.id)
          or exists (select 1 from public.exam_results where exam_id = old.id))
         and (new.audience, new.batch_id, new.mode) is distinct from (old.audience, old.batch_id, old.mode) then
        raise exception 'Students have answers or marks for this exam, so who it is for and how it is sat cannot change';
      end if;
    end if;
  end if;
  if new.max_marks < old.max_marks and exists (select 1 from public.exam_results where exam_id = old.id and marks > new.max_marks) then
    raise exception 'Some students already have more marks than the new maximum';
  end if;
  return new;
end;
$$;

create or replace function public.guard_exam_student()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and not exists (
    select 1 from public.enrollments where course_id = public.exam_course(new.exam_id) and student_id = new.student_id
  ) then
    raise exception 'That student is not enrolled in this course';
  end if;
  if tg_op = 'DELETE' and (
    exists (select 1 from public.exam_submissions where exam_id = old.exam_id and student_id = old.student_id)
    or exists (select 1 from public.exam_results where exam_id = old.exam_id and student_id = old.student_id)
  ) then
    raise exception 'That student already has answers or marks for this exam';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger exam_students_guard before insert or delete on public.exam_students
  for each row execute function public.guard_exam_student();

-- Assign a draft exam and notify its students.
create or replace function public.assign_exam(p_exam_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_exam public.exams;
  v_count integer;
  v_student uuid;
begin
  select * into v_exam from public.exams where id = p_exam_id for update;
  if not found then
    raise exception 'Exam not found';
  end if;
  if not public.is_professor_of(v_exam.course_id) then
    raise exception 'Only the course''s Faculty can assign its exams';
  end if;
  if v_exam.assigned_at is not null then
    raise exception 'This exam has already been assigned';
  end if;
  if v_exam.mode = 'online' and v_exam.starts_at + make_interval(mins => v_exam.duration_minutes) < now() then
    raise exception 'This online exam has already ended. Change its start time first';
  end if;
  select count(*) into v_count from public.exam_audience(v_exam.id);
  if v_count = 0 then
    raise exception 'No enrolled students would sit this exam';
  end if;

  perform set_config('bigsms.review', 'on', true);
  update public.exams set assigned_at = now(), assigned_by = auth.uid() where id = v_exam.id;
  perform set_config('bigsms.review', 'off', true);

  for v_student in select student_id from public.exam_audience(v_exam.id) loop
    perform public.notify(v_student, 'Exam scheduled',
      v_exam.title || ' on ' || case when v_exam.starts_at is null then to_char(v_exam.held_on, 'DD Mon YYYY')
        else to_char(v_exam.starts_at at time zone 'Asia/Karachi', 'DD Mon YYYY HH24:MI') || ' (' || v_exam.duration_minutes || ' min, online)' end,
      '/student/exams');
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.assign_exam(uuid) from public, anon;
grant execute on function public.assign_exam(uuid) to authenticated;

-- Withdraw an assigned exam back to draft, while nobody has answers or marks.
create or replace function public.unassign_exam(p_exam_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_exam public.exams;
begin
  select * into v_exam from public.exams where id = p_exam_id for update;
  if not found or not public.is_professor_of(v_exam.course_id) then
    raise exception 'Only the course''s Faculty can withdraw its exams';
  end if;
  if exists (select 1 from public.exam_submissions where exam_id = v_exam.id)
     or exists (select 1 from public.exam_results where exam_id = v_exam.id) then
    raise exception 'Students have answers or marks for this exam, so it cannot be withdrawn';
  end if;
  perform set_config('bigsms.review', 'on', true);
  update public.exams set assigned_at = null, assigned_by = null where id = v_exam.id;
  perform set_config('bigsms.review', 'off', true);
end;
$$;
revoke execute on function public.unassign_exam(uuid) from public, anon;
grant execute on function public.unassign_exam(uuid) to authenticated;

-- Student submission ---------------------------------------------------------------------
create table public.exam_submissions (
  exam_id      uuid not null references public.exams (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  answer       text not null default '',
  link_url     text,
  submitted_at timestamptz not null default now(),
  primary key (exam_id, student_id)
);
create index exam_submissions_student_idx on public.exam_submissions (student_id);

create or replace function public.guard_exam_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.review_mode() or auth.uid() is null then
    return new;
  end if;
  if new.student_id is distinct from auth.uid() then
    raise exception 'Students submit their own answers';
  end if;
  if tg_op = 'UPDATE' and (new.exam_id, new.student_id) is distinct from (old.exam_id, old.student_id) then
    raise exception 'Answer a different exam with a new submission';
  end if;
  if not public.is_exam_assigned(new.exam_id, new.student_id) then
    raise exception 'You are not sitting this exam';
  end if;
  if not public.exam_open(new.exam_id) then
    raise exception 'This exam is not open for answers. Online answers are accepted only between the start time and the end of the exam';
  end if;
  new.answer := trim(new.answer);
  new.link_url := nullif(trim(coalesce(new.link_url, '')), '');
  if new.answer = '' and new.link_url is null then
    raise exception 'Write your answers or add a link';
  end if;
  new.submitted_at := now();
  return new;
end;
$$;
create trigger exam_submissions_guard before insert or update on public.exam_submissions
  for each row execute function public.guard_exam_submission();

-- Grading ---------------------------------------------------------------------------------
-- Marks only for the exam's students, and only by Faculty while the results are a draft or
-- returned for correction.
create or replace function public.exam_locked(p_exam_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_role() = 'professor' and not public.review_mode()
     and exists (select 1 from public.exams where id = p_exam_id and results_status in ('pending', 'approved'));
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
  if not public.review_mode() then
    if not exists (select 1 from public.exams where id = new.exam_id and assigned_at is not null) then
      raise exception 'Assign the exam to students before entering marks';
    end if;
    if not public.is_exam_assigned(new.exam_id, new.student_id) then
      raise exception 'That student is not sitting this exam';
    end if;
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

-- Results: submitted by Faculty, approved and published by the Principal -------------------
create or replace function public.submit_exam(p_exam_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_exam public.exams;
  v_missing integer;
  v_principal uuid;
begin
  select * into v_exam from public.exams where id = p_exam_id for update;
  if not found then
    raise exception 'Exam not found';
  end if;
  if not public.is_professor_of(v_exam.course_id) then
    raise exception 'Only the class''s Faculty can submit its results';
  end if;
  if v_exam.assigned_at is null then
    raise exception 'Assign the exam to students first';
  end if;
  if v_exam.results_status in ('pending', 'approved') then
    raise exception 'These results have already been submitted';
  end if;
  if v_exam.held_on > current_date then
    raise exception 'Results can be submitted once the exam has been held';
  end if;
  if v_exam.mode = 'online' and now() < v_exam.starts_at + make_interval(mins => v_exam.duration_minutes) then
    raise exception 'Results can be submitted once the online exam has ended';
  end if;
  select count(*) into v_missing
    from public.exam_audience(v_exam.id) a
   where not exists (select 1 from public.exam_results r where r.exam_id = v_exam.id and r.student_id = a.student_id);
  if v_missing > 0 then
    raise exception 'Enter marks for every student before submitting (% missing)', v_missing;
  end if;

  perform set_config('bigsms.review', 'on', true);
  update public.exams
     set submitted_at = now(), submitted_by = auth.uid(), results_status = 'pending'
   where id = v_exam.id;
  perform set_config('bigsms.review', 'off', true);

  for v_principal in select id from public.profiles where role = 'principal' and status = 'active' loop
    perform public.notify(v_principal, 'Exam results awaiting your approval',
      v_exam.title || ' (' || (select title from public.courses where id = v_exam.course_id) || ')',
      '/principal/exams?exam=' || v_exam.id);
  end loop;
end;
$$;

-- The Principal approves (publishes to students) or returns the results with a note.
create or replace function public.review_exam_results(p_exam_id uuid, p_decision text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_exam public.exams;
  v_note text := trim(coalesce(p_note, ''));
  v_student uuid;
begin
  if coalesce(public.app_role() <> 'principal', true) then
    raise exception 'Only the Principal approves exam results';
  end if;
  if p_decision not in ('approve', 'return') then
    raise exception 'Approve or return the results';
  end if;
  select * into v_exam from public.exams where id = p_exam_id for update;
  if not found then
    raise exception 'Exam not found';
  end if;
  if v_exam.results_status <> 'pending' then
    raise exception 'These results are not awaiting approval';
  end if;
  if p_decision = 'return' and v_note = '' then
    raise exception 'Say what needs correcting';
  end if;

  perform set_config('bigsms.review', 'on', true);
  if p_decision = 'approve' then
    update public.exams
       set results_status = 'approved', approved_at = now(), approved_by = auth.uid(), review_note = v_note
     where id = v_exam.id;
  else
    update public.exams
       set results_status = 'returned', submitted_at = null, submitted_by = null, review_note = v_note
     where id = v_exam.id;
  end if;
  perform set_config('bigsms.review', 'off', true);

  if p_decision = 'approve' then
    for v_student in select student_id from public.exam_results where exam_id = v_exam.id loop
      perform public.notify(v_student, 'Exam result published', v_exam.title, '/student/exams');
    end loop;
    perform public.notify(v_exam.submitted_by, 'Exam results approved', v_exam.title || ' is published to students',
      '/professor/courses/' || v_exam.course_id || '?tab=exams&exam=' || v_exam.id);
  else
    perform public.notify(v_exam.submitted_by, 'Exam results returned', v_exam.title || ': ' || v_note,
      '/professor/courses/' || v_exam.course_id || '?tab=exams&exam=' || v_exam.id);
  end if;
end;
$$;
revoke execute on function public.review_exam_results(uuid, text, text) from public, anon;
grant execute on function public.review_exam_results(uuid, text, text) to authenticated;

-- Changes to published results go through the Principal (results awaiting approval are
-- returned instead).
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
     where e.id = p_target_id and e.results_status = 'approved';
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

-- Access -----------------------------------------------------------------------------------
drop policy exams_select on public.exams;
create policy exams_select on public.exams for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(course_id)
  or (assigned_at is not null and public.is_exam_assigned(id, (select auth.uid())) and (select public.is_active()))
);
drop policy exams_write on public.exams;
create policy exams_write on public.exams for all to authenticated
  using (public.is_professor_of(course_id)) with check (public.is_professor_of(course_id));

drop policy exam_results_select on public.exam_results;
create policy exam_results_select on public.exam_results for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.exam_course(exam_id))
  or (student_id = (select auth.uid()) and (select public.is_active()) and public.exam_published(exam_id))
);
drop policy exam_results_write on public.exam_results;
create policy exam_results_write on public.exam_results for all to authenticated
  using (public.is_professor_of(public.exam_course(exam_id)))
  with check (public.is_professor_of(public.exam_course(exam_id)));

alter table public.exam_papers enable row level security;
create policy exam_papers_select on public.exam_papers for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.exam_course(exam_id))
  or (public.is_exam_assigned(exam_id, (select auth.uid())) and (select public.is_active())
      and exists (select 1 from public.exams x where x.id = exam_id and x.assigned_at is not null
                   and (x.starts_at is null or x.starts_at <= now())))
);
create policy exam_papers_write on public.exam_papers for all to authenticated
  using (public.is_professor_of(public.exam_course(exam_id)))
  with check (public.is_professor_of(public.exam_course(exam_id)));

alter table public.exam_students enable row level security;
create policy exam_students_select on public.exam_students for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.exam_course(exam_id))
  or (student_id = (select auth.uid()) and (select public.is_active()))
);
create policy exam_students_write on public.exam_students for all to authenticated
  using (public.is_professor_of(public.exam_course(exam_id)))
  with check (public.is_professor_of(public.exam_course(exam_id)));

alter table public.exam_submissions enable row level security;
create policy exam_submissions_select on public.exam_submissions for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.exam_course(exam_id))
  or (student_id = (select auth.uid()) and (select public.is_active()))
);
create policy exam_submissions_insert on public.exam_submissions for insert to authenticated
  with check (student_id = (select auth.uid()) and (select public.is_active()));
create policy exam_submissions_update on public.exam_submissions for update to authenticated
  using (student_id = (select auth.uid()) and (select public.is_active()))
  with check (student_id = (select auth.uid()) and (select public.is_active()));

create trigger audit_exam_papers after insert or update or delete on public.exam_papers
  for each row execute function public.audit_row();
create trigger audit_exam_students after insert or delete on public.exam_students
  for each row execute function public.audit_row();
create trigger audit_exam_submissions after insert or update or delete on public.exam_submissions
  for each row execute function public.audit_row();

-- Exams awaiting the Principal, with how many students and the class average. For the
-- Principal and admins.
create or replace function public.exam_results_overview(p_status text default null)
returns table (exam_id uuid, title text, kind text, held_on date, max_marks numeric, course_id uuid, course_title text,
               faculty_name text, results_status text, submitted_at timestamptz, approved_at timestamptz,
               students bigint, absent bigint, average numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_overseer() then
    raise exception 'Not allowed';
  end if;
  return query
    select x.id, x.title, x.kind, x.held_on, x.max_marks, c.id, c.title, p.full_name, x.results_status,
           x.submitted_at, x.approved_at,
           count(r.student_id), count(*) filter (where r.absent),
           round(avg(r.marks / x.max_marks * 100) filter (where not r.absent), 1)
      from public.exams x
      join public.courses c on c.id = x.course_id
      left join public.profiles p on p.id = c.professor_id
      left join public.exam_results r on r.exam_id = x.id
     where x.results_status <> 'draft' and (p_status is null or x.results_status = p_status)
     group by x.id, c.id, p.full_name
     order by x.submitted_at desc nulls last, x.held_on desc;
end;
$$;
revoke execute on function public.exam_results_overview(text) from public, anon;
grant execute on function public.exam_results_overview(text) to authenticated;
