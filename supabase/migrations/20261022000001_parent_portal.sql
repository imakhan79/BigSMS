-- Parent portal.
--
-- A parent sees exactly what their linked children (parent_students) can see as students, and
-- nothing else: read-only, the same gates as the student (published courses, published and
-- assigned work, submitted registers, approved exam results, the live timetable, their own
-- fees and certificates). Parents never write.
--
-- The Parent role was switched off by 20261012000002 (is_parent_of / parent_sees_course always
-- false, the role unassignable). This switches it back on and adds the parent clause to every
-- student-visible table added since.

-- A parent of an active student.
create or replace function public.is_parent_of(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_role() = 'parent'
     and exists (
       select 1 from public.parent_students ps
       join public.profiles s on s.id = ps.student_id and s.status = 'active'
      where ps.parent_id = auth.uid() and ps.student_id = p_student_id);
$$;

-- A course one of the parent's children sees (mirrors is_enrolled: published courses only).
create or replace function public.parent_sees_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_role() = 'parent'
     and exists (
       select 1 from public.parent_students ps
       join public.profiles s on s.id = ps.student_id and s.status = 'active'
       join public.enrollments e on e.student_id = ps.student_id
       join public.courses c on c.id = e.course_id
      where ps.parent_id = auth.uid() and e.course_id = p_course_id and c.status = 'published');
$$;

-- Lectures and materials a child sees.
create or replace function public.can_view_course_content(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_overseer() or public.is_professor_of(p_course_id) or public.is_enrolled(p_course_id)
      or public.parent_sees_course(p_course_id);
$$;

-- Children of the caller (a parent), active only.
create or replace function public.my_children()
returns table (student_id uuid)
language sql stable security definer set search_path = '' as $$
  select ps.student_id from public.parent_students ps
    join public.profiles s on s.id = ps.student_id and s.status = 'active'
   where public.app_role() = 'parent' and ps.parent_id = auth.uid();
$$;
revoke execute on function public.my_children() from public, anon;
grant execute on function public.my_children() to authenticated;

-- The role can be assigned again (by admins; self sign-up still offers Student and Faculty only).
drop trigger if exists profiles_no_parent_role on public.profiles;
drop function if exists public.guard_no_parent_role();

-- Attendance: a child's records from submitted registers.
drop policy attendance_sessions_select on public.attendance_sessions;
create policy attendance_sessions_select on public.attendance_sessions for select to authenticated using (
  (select public.is_overseer()) or (select public.manages_students()) or public.is_professor_of(course_id)
  or ((public.is_enrolled(course_id) or public.parent_sees_course(course_id)) and submitted_at is not null)
);
drop policy attendance_records_select on public.attendance_records;
create policy attendance_records_select on public.attendance_records for select to authenticated using (
  (select public.is_overseer()) or (select public.manages_students())
  or public.is_professor_of(public.attendance_course(session_id))
  or (((student_id = (select auth.uid()) and (select public.is_active())) or public.is_parent_of(student_id))
      and public.attendance_submitted(session_id))
);

-- Assignments assigned to a child, and the child's submissions.
drop policy assignments_select on public.assignments;
create policy assignments_select on public.assignments for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(course_id)
  or (published and public.is_assigned(id, (select auth.uid())) and (select public.is_active()))
  or (published and exists (select 1 from public.my_children() c where public.is_assigned(id, c.student_id)))
);
drop policy assignment_students_select on public.assignment_students;
create policy assignment_students_select on public.assignment_students for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.assignment_course(assignment_id))
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);
drop policy submissions_select on public.submissions;
create policy submissions_select on public.submissions for select to authenticated using (
  (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
  or public.is_professor_of(public.assignment_course(assignment_id))
  or (select public.is_overseer())
);

-- Exams assigned to a child; papers once started; answers; results once approved.
drop policy exams_select on public.exams;
create policy exams_select on public.exams for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(course_id)
  or (assigned_at is not null and public.is_exam_assigned(id, (select auth.uid())) and (select public.is_active()))
  or (assigned_at is not null and exists (select 1 from public.my_children() c where public.is_exam_assigned(id, c.student_id)))
);
drop policy exam_students_select on public.exam_students;
create policy exam_students_select on public.exam_students for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.exam_course(exam_id))
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);
drop policy exam_papers_select on public.exam_papers;
create policy exam_papers_select on public.exam_papers for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.exam_course(exam_id))
  or (((public.is_exam_assigned(exam_id, (select auth.uid())) and (select public.is_active()))
       or exists (select 1 from public.my_children() c where public.is_exam_assigned(exam_id, c.student_id)))
      and exists (select 1 from public.exams x where x.id = exam_id and x.assigned_at is not null
                   and (x.starts_at is null or x.starts_at <= now())))
);
drop policy exam_submissions_select on public.exam_submissions;
create policy exam_submissions_select on public.exam_submissions for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.exam_course(exam_id))
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);
drop policy exam_results_select on public.exam_results;
create policy exam_results_select on public.exam_results for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.exam_course(exam_id))
  or (((student_id = (select auth.uid()) and (select public.is_active())) or public.is_parent_of(student_id))
      and public.exam_published(exam_id))
);

-- Live timetable and calendar of a child's classes.
create or replace function public.parent_in_timetable_class(p_course_id uuid, p_batch_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.my_children() c
      join public.enrollments e on e.student_id = c.student_id
     where e.course_id = p_course_id and (p_batch_id is null or e.batch_id = p_batch_id)
  );
$$;
drop policy timetable_select on public.timetable_slots;
create policy timetable_select on public.timetable_slots for select to authenticated using (
  (select public.manages_timetable()) or (select public.is_overseer())
  or (state = 'live' and (public.is_professor_of(course_id) or public.in_timetable_class(course_id, batch_id)
                          or public.parent_in_timetable_class(course_id, batch_id)))
);
drop policy calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events for select to authenticated using (
  (select public.manages_timetable()) or (select public.is_overseer())
  or (state = 'live' and (select public.is_active())
      and (course_id is null or public.is_professor_of(course_id) or public.in_timetable_class(course_id, null)
           or public.parent_in_timetable_class(course_id, null)))
);

-- A child's fees.
drop policy invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated using (
  (select public.manages_finance())
  or (select public.manages_students())
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);
drop policy payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using (
  (select public.manages_finance())
  or (select public.manages_students())
  or (public.invoice_student(invoice_id) = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(public.invoice_student(invoice_id))
);

-- A child's attendance per course (the student's own function, for a parent).
create or replace function public.child_attendance(p_student_id uuid)
returns table (course_id uuid, title text, sessions bigint, present bigint, late bigint, absent bigint, excused bigint, rate numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_parent_of(p_student_id) then
    raise exception 'Not allowed';
  end if;
  return query
    select c.id, c.title, count(r.session_id),
           count(*) filter (where r.status = 'present'), count(*) filter (where r.status = 'late'),
           count(*) filter (where r.status = 'absent'), count(*) filter (where r.status = 'excused'),
           round(100.0 * count(*) filter (where r.status in ('present', 'late'))
                 / nullif(count(*) filter (where r.status <> 'excused'), 0), 1)
      from public.attendance_records r
      join public.attendance_sessions s on s.id = r.session_id and s.submitted_at is not null
      join public.courses c on c.id = s.course_id
     where r.student_id = p_student_id
     group by c.id, c.title
     order by c.title;
end;
$$;
revoke execute on function public.child_attendance(uuid) from public, anon;
grant execute on function public.child_attendance(uuid) to authenticated;
