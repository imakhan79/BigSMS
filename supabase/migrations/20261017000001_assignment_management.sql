-- Assignment management (BRD 10).
--
-- Formulation -> Assigned to students -> Student submission -> Faculty grading -> Submission/grade status.
--
-- 10.1 Faculty formulate assignments as drafts (title, instructions, due date, maximum score).
-- 10.2 Assigning publishes the assignment to the whole course, one class (batch) or chosen
--      students, and notifies them. Only assigned students see and submit it.
-- 10.3 Students submit and resubmit until graded. Submissions after the due date are accepted
--      and marked late.
-- 10.4 Faculty grade submissions. A saved grade is final; changing it needs the Principal's
--      approval (request_result_change / review_result_change, kind 'assignment_grade').
-- 10.5 Each assigned student's status: not submitted, submitted (on time or late), graded,
--      missing or excused.
--
-- Only the course's Faculty formulate, assign and grade. Admins and the Principal read.

-- 10.1 / 10.2 Formulation and assignment ----------------------------------------------
alter table public.assignments
  add column audience    text not null default 'course' check (audience in ('course', 'batch', 'students')),
  add column batch_id    uuid references public.course_batches (id) on delete restrict,
  add column assigned_at timestamptz,
  add column assigned_by uuid references public.profiles (id) on delete set null,
  add constraint assignments_audience_batch check ((audience = 'batch') = (batch_id is not null));
create index assignments_batch_idx on public.assignments (batch_id);
create index assignments_assigned_by_idx on public.assignments (assigned_by);
update public.assignments set assigned_at = created_at where published;

-- Students chosen for an assignment whose audience is 'students'.
create table public.assignment_students (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  primary key (assignment_id, student_id)
);
create index assignment_students_student_idx on public.assignment_students (student_id);

-- Is the student one of the assignment's students: enrolled in its course and in its audience.
create or replace function public.is_assigned(p_assignment_id uuid, p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments a
      join public.enrollments e on e.course_id = a.course_id and e.student_id = p_student_id
     where a.id = p_assignment_id
       and case a.audience
             when 'course' then true
             when 'batch' then e.batch_id = a.batch_id
             else exists (select 1 from public.assignment_students x where x.assignment_id = a.id and x.student_id = p_student_id)
           end
  );
$$;

-- The assignment's students.
create or replace function public.assignment_audience(p_assignment_id uuid)
returns table (student_id uuid)
language sql stable security definer set search_path = '' as $$
  select e.student_id
    from public.assignments a
    join public.enrollments e on e.course_id = a.course_id
   where a.id = p_assignment_id and public.is_assigned(a.id, e.student_id);
$$;
revoke execute on function public.assignment_audience(uuid) from public, anon, authenticated;

create or replace function public.guard_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.course_id is distinct from old.course_id then
    raise exception 'An assignment cannot move to another course';
  end if;
  new.title := trim(new.title);
  new.instructions := trim(new.instructions);
  if new.title = '' then
    raise exception 'Give the assignment a title';
  end if;
  if new.audience <> 'batch' then
    new.batch_id := null;
  elsif not exists (select 1 from public.course_batches where id = new.batch_id and course_id = new.course_id) then
    raise exception 'That class is not a batch of this course';
  end if;

  if public.review_mode() or auth.uid() is null then
    return new;
  end if;
  -- Assigning goes through assign_assignment(), which notifies the students.
  if new.published and (tg_op = 'INSERT' or not old.published) then
    raise exception 'Use Assign to students to publish an assignment';
  end if;
  if tg_op = 'UPDATE' then
    if exists (select 1 from public.submissions where assignment_id = old.id) then
      if not new.published then
        raise exception 'Students have already handed in work for this assignment, so it cannot be withdrawn';
      end if;
      if (new.audience, new.batch_id) is distinct from (old.audience, old.batch_id) then
        raise exception 'Students have already handed in work, so who the assignment is for cannot change';
      end if;
    end if;
    new.assigned_at := old.assigned_at;
    new.assigned_by := old.assigned_by;
    if not new.published then
      new.assigned_at := null;
      new.assigned_by := null;
    end if;
  else
    new.assigned_at := null;
    new.assigned_by := null;
  end if;
  return new;
end;
$$;
create trigger assignments_guard before insert or update on public.assignments
  for each row execute function public.guard_assignment();

create or replace function public.guard_assignment_student()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.enrollments
     where course_id = public.assignment_course(coalesce(new.assignment_id, old.assignment_id))
       and student_id = coalesce(new.student_id, old.student_id)
  ) and tg_op = 'INSERT' then
    raise exception 'That student is not enrolled in this course';
  end if;
  if exists (select 1 from public.submissions
              where assignment_id = coalesce(new.assignment_id, old.assignment_id)
                and student_id = coalesce(new.student_id, old.student_id)) and tg_op = 'DELETE' then
    raise exception 'That student has already handed in work for this assignment';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger assignment_students_guard before insert or delete on public.assignment_students
  for each row execute function public.guard_assignment_student();

-- Assign (publish) a draft and notify its students.
create or replace function public.assign_assignment(p_assignment_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_a public.assignments;
  v_count integer;
  v_student uuid;
begin
  select * into v_a from public.assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'Assignment not found';
  end if;
  if not public.is_professor_of(v_a.course_id) then
    raise exception 'Only the course''s Faculty can assign its assignments';
  end if;
  if v_a.published then
    raise exception 'This assignment has already been assigned';
  end if;
  select count(*) into v_count from public.assignment_audience(v_a.id);
  if v_count = 0 then
    raise exception 'No enrolled students would receive this assignment';
  end if;

  perform set_config('bigsms.review', 'on', true);
  update public.assignments set published = true, assigned_at = now(), assigned_by = auth.uid() where id = v_a.id;
  perform set_config('bigsms.review', 'off', true);

  for v_student in select student_id from public.assignment_audience(v_a.id) loop
    perform public.notify(v_student, 'New assignment',
      v_a.title || case when v_a.due_at is null then '' else ', due ' || to_char(v_a.due_at at time zone 'Asia/Karachi', 'DD Mon YYYY HH24:MI') end,
      '/student/courses/' || v_a.course_id || '?tab=assignments');
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.assign_assignment(uuid) from public, anon;
grant execute on function public.assign_assignment(uuid) to authenticated;

-- Only the course's Faculty formulate and assign. Students see assignments assigned to them.
drop policy assignments_select on public.assignments;
create policy assignments_select on public.assignments for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(course_id)
  or (published and public.is_assigned(id, (select auth.uid())) and (select public.is_active()))
);
drop policy assignments_manage on public.assignments;
create policy assignments_manage on public.assignments for all to authenticated
  using (public.is_professor_of(course_id)) with check (public.is_professor_of(course_id));

alter table public.assignment_students enable row level security;
create policy assignment_students_select on public.assignment_students for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.assignment_course(assignment_id))
  or (student_id = (select auth.uid()) and (select public.is_active()))
);
create policy assignment_students_write on public.assignment_students for all to authenticated
  using (public.is_professor_of(public.assignment_course(assignment_id)))
  with check (public.is_professor_of(public.assignment_course(assignment_id)));

create trigger audit_assignments after insert or update or delete on public.assignments
  for each row execute function public.audit_row();

-- 10.3 / 10.5 Submissions: late marking and status ---------------------------------------
alter table public.submissions add column late boolean not null default false;
update public.submissions s
   set late = a.due_at is not null and s.submitted_at > a.due_at
  from public.assignments a
 where a.id = s.assignment_id and s.status in ('submitted', 'graded');

create or replace function public.past_due(p_assignment_id uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select due_at < p_at from public.assignments where id = p_assignment_id), false);
$$;

create or replace function public.guard_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
begin
  if auth.uid() is null or public.review_mode() then
    return new;
  end if;

  -- The student's own work: accepted after the due date (marked late) and editable until graded.
  if new.student_id = auth.uid() then
    if tg_op = 'UPDATE' and old.status = 'graded' then
      raise exception 'Graded submissions cannot be changed';
    end if;
    if not public.is_assigned(new.assignment_id, new.student_id) then
      raise exception 'This assignment is not assigned to you';
    end if;
    if nullif(trim(new.content), '') is null and nullif(trim(coalesce(new.link_url, '')), '') is null then
      raise exception 'Write your answer or add a link';
    end if;
    new.status := 'submitted';
    new.score := null;
    new.feedback := null;
    new.graded_at := null;
    new.graded_by := null;
    new.submitted_at := now();
    new.late := public.past_due(new.assignment_id, new.submitted_at);
    return new;
  end if;

  -- Faculty
  select max_score into v_max from public.assignments where id = new.assignment_id;
  if tg_op = 'INSERT' then
    if not public.is_assigned(new.assignment_id, new.student_id) then
      raise exception 'This assignment is not assigned to that student';
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
    new.late := new.status = 'submitted' and public.past_due(new.assignment_id, new.submitted_at);
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
  new.late := old.late;
  if new.status = 'submitted' and old.status in ('missing', 'excused') then
    -- Handed in on paper now.
    new.content := 'Handed in (recorded by Faculty)';
    new.submitted_at := now();
    new.late := public.past_due(new.assignment_id, new.submitted_at);
  elsif new.status in ('missing', 'excused') then
    new.late := false;
  end if;
  if new.status = 'graded' then
    if old.status not in ('submitted') then
      raise exception 'Only handed-in work can be graded';
    end if;
    if new.score is null then
      raise exception 'A score is required to grade a submission';
    end if;
    if new.score > v_max then
      raise exception 'Score cannot be more than %', v_max;
    end if;
    new.feedback := nullif(trim(coalesce(new.feedback, '')), '');
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

-- A new due date re-marks which submissions are late.
create or replace function public.remark_late_submissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('bigsms.review', 'on', true);
  update public.submissions
     set late = new.due_at is not null and submitted_at > new.due_at
   where assignment_id = new.id and status in ('submitted', 'graded');
  perform set_config('bigsms.review', 'off', true);
  return new;
end;
$$;
create trigger assignments_remark_late after update of due_at on public.assignments
  for each row when (new.due_at is distinct from old.due_at)
  execute function public.remark_late_submissions();

-- Students submit only assignments assigned to them. Grades change only by Faculty before
-- they are saved, or through the Principal's approval; admins read.
drop policy submissions_insert on public.submissions;
create policy submissions_insert on public.submissions for insert to authenticated with check (
  (student_id = (select auth.uid()) and (select public.is_active())
    and exists (select 1 from public.assignments a where a.id = assignment_id and a.published)
    and public.is_assigned(assignment_id, student_id))
  or public.is_professor_of(public.assignment_course(assignment_id))
);
drop policy submissions_update on public.submissions;
create policy submissions_update on public.submissions for update to authenticated
  using (
    (student_id = (select auth.uid()) and (select public.is_active()) and public.is_assigned(assignment_id, student_id))
    or public.is_professor_of(public.assignment_course(assignment_id))
  )
  with check (
    (student_id = (select auth.uid()) and (select public.is_active()) and public.is_assigned(assignment_id, student_id))
    or public.is_professor_of(public.assignment_course(assignment_id))
  );
drop policy submissions_select on public.submissions;
create policy submissions_select on public.submissions for select to authenticated using (
  (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_professor_of(public.assignment_course(assignment_id))
  or (select public.is_overseer())
);

-- 10.5 Submission status per assignment: counts over the assignment's students.
create or replace function public.assignment_status(p_course_id uuid)
returns table (assignment_id uuid, assigned bigint, submitted bigint, late bigint, graded bigint, missing bigint, excused bigint, pending bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (public.is_overseer() or public.is_professor_of(p_course_id)) then
    raise exception 'Not allowed';
  end if;
  return query
    select a.id,
           count(e.student_id),
           count(*) filter (where s.status = 'submitted'),
           count(*) filter (where s.late and s.status in ('submitted', 'graded')),
           count(*) filter (where s.status = 'graded'),
           count(*) filter (where s.status = 'missing'),
           count(*) filter (where s.status = 'excused'),
           count(*) filter (where e.student_id is not null and s.id is null)
      from public.assignments a
      left join public.enrollments e on e.course_id = a.course_id and public.is_assigned(a.id, e.student_id)
      left join public.submissions s on s.assignment_id = a.id and s.student_id = e.student_id
     where a.course_id = p_course_id
     group by a.id;
end;
$$;
revoke execute on function public.assignment_status(uuid) from public, anon;
grant execute on function public.assignment_status(uuid) to authenticated;
