-- Analytics (BRD 14): institute performance (current and historic), course performance and
-- student attendance.
--
-- Visibility follows the role-based access of the BRD. Every function works out the caller's
-- scope itself:
--   Principal (and admins)  every course and student;
--   Faculty                 their own courses (assigned classes/subjects) and those students;
--   Student                 only their own records in their own courses.
-- Only submitted attendance registers, published (approved) exam results and saved grades
-- count, so nothing in draft or awaiting approval shows in analytics.

-- Courses in the caller's scope.
create or replace function public.analytics_courses_in_scope()
returns table (course_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.id from public.courses c
   where c.status <> 'archived'
     and (public.is_overseer()
          or (public.app_role() = 'professor' and c.professor_id = auth.uid())
          or (public.app_role() = 'student' and exists (
                select 1 from public.enrollments e where e.course_id = c.id and e.student_id = auth.uid())));
$$;
revoke execute on function public.analytics_courses_in_scope() from public, anon, authenticated;

-- A student sees only their own rows; everyone else every student of the courses in scope.
create or replace function public.analytics_student_visible(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_role() <> 'student' or p_student_id = auth.uid();
$$;
revoke execute on function public.analytics_student_visible(uuid) from public, anon, authenticated;

create or replace function public.analytics_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() in ('super_admin', 'admin', 'principal', 'professor', 'student'), false);
$$;

-- 14.1 Institute performance, month by month (historic), the last p_months months including
-- the current one.
create or replace function public.analytics_monthly(p_months integer default 12)
returns table (month date, attendance_rate numeric, attendance_marked bigint, exam_average numeric, exam_results bigint,
               assignment_average numeric, assignments_graded bigint, on_time_rate numeric, work_handed_in bigint,
               lectures_completed bigint, new_enrollments bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.analytics_allowed() then
    raise exception 'Not allowed';
  end if;
  return query
  with months as (
    select generate_series(date_trunc('month', current_date) - make_interval(months => greatest(least(p_months, 36), 1) - 1),
                           date_trunc('month', current_date), interval '1 month')::date as m
  ),
  scope as (select course_id from public.analytics_courses_in_scope()),
  att as (
    select date_trunc('month', s.held_on)::date m,
           round(100.0 * count(*) filter (where r.status in ('present', 'late')) / nullif(count(*) filter (where r.status <> 'excused'), 0), 1) rate,
           count(*) n
      from public.attendance_records r
      join public.attendance_sessions s on s.id = r.session_id and s.submitted_at is not null
     where s.course_id in (select course_id from scope) and public.analytics_student_visible(r.student_id)
     group by 1
  ),
  ex as (
    select date_trunc('month', x.held_on)::date m, round(avg(r.marks / x.max_marks * 100) filter (where not r.absent), 1) avg, count(*) n
      from public.exam_results r
      join public.exams x on x.id = r.exam_id and x.results_status = 'approved'
     where x.course_id in (select course_id from scope) and public.analytics_student_visible(r.student_id)
     group by 1
  ),
  gr as (
    select date_trunc('month', s.graded_at)::date m, round(avg(s.score / a.max_score * 100), 1) avg, count(*) n
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
     where s.status = 'graded' and a.course_id in (select course_id from scope) and public.analytics_student_visible(s.student_id)
     group by 1
  ),
  hi as (
    select date_trunc('month', s.submitted_at)::date m,
           round(100.0 * count(*) filter (where not s.late) / nullif(count(*), 0), 1) rate, count(*) n
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
     where s.status in ('submitted', 'graded') and a.course_id in (select course_id from scope) and public.analytics_student_visible(s.student_id)
     group by 1
  ),
  lp as (
    select date_trunc('month', p.completed_at)::date m, count(*) n
      from public.lecture_progress p
     where p.course_id in (select course_id from scope) and public.analytics_student_visible(p.student_id)
     group by 1
  ),
  en as (
    select date_trunc('month', e.enrolled_at)::date m, count(*) n
      from public.enrollments e
     where e.course_id in (select course_id from scope) and public.analytics_student_visible(e.student_id)
     group by 1
  )
  select months.m, att.rate, coalesce(att.n, 0), ex.avg, coalesce(ex.n, 0), gr.avg, coalesce(gr.n, 0), hi.rate, coalesce(hi.n, 0),
         coalesce(lp.n, 0), coalesce(en.n, 0)
    from months
    left join att on att.m = months.m
    left join ex on ex.m = months.m
    left join gr on gr.m = months.m
    left join hi on hi.m = months.m
    left join lp on lp.m = months.m
    left join en on en.m = months.m
   order by months.m;
end;
$$;
revoke execute on function public.analytics_monthly(integer) from public, anon;
grant execute on function public.analytics_monthly(integer) to authenticated;

-- 14.1 Current performance: totals over everything recorded so far, plus headcounts.
create or replace function public.analytics_current()
returns table (courses bigint, students bigint, faculty bigint, attendance_rate numeric, exam_average numeric, exam_pass_rate numeric,
               assignment_average numeric, on_time_rate numeric, completion_rate numeric, pending_grading bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.analytics_allowed() then
    raise exception 'Not allowed';
  end if;
  return query
  with scope as (select course_id from public.analytics_courses_in_scope())
  select
    (select count(*) from scope),
    (select count(distinct e.student_id) from public.enrollments e where e.course_id in (select course_id from scope) and public.analytics_student_visible(e.student_id)),
    (select count(distinct c.professor_id) from public.courses c where c.id in (select course_id from scope)),
    (select round(100.0 * count(*) filter (where r.status in ('present', 'late')) / nullif(count(*) filter (where r.status <> 'excused'), 0), 1)
       from public.attendance_records r join public.attendance_sessions s on s.id = r.session_id and s.submitted_at is not null
      where s.course_id in (select course_id from scope) and public.analytics_student_visible(r.student_id)),
    (select round(avg(r.marks / x.max_marks * 100) filter (where not r.absent), 1)
       from public.exam_results r join public.exams x on x.id = r.exam_id and x.results_status = 'approved'
      where x.course_id in (select course_id from scope) and public.analytics_student_visible(r.student_id)),
    (select round(100.0 * count(*) filter (where not r.absent and r.marks / x.max_marks >= 0.5) / nullif(count(*), 0), 1)
       from public.exam_results r join public.exams x on x.id = r.exam_id and x.results_status = 'approved'
      where x.course_id in (select course_id from scope) and public.analytics_student_visible(r.student_id)),
    (select round(avg(s.score / a.max_score * 100), 1)
       from public.submissions s join public.assignments a on a.id = s.assignment_id
      where s.status = 'graded' and a.course_id in (select course_id from scope) and public.analytics_student_visible(s.student_id)),
    (select round(100.0 * count(*) filter (where not s.late) / nullif(count(*), 0), 1)
       from public.submissions s join public.assignments a on a.id = s.assignment_id
      where s.status in ('submitted', 'graded') and a.course_id in (select course_id from scope) and public.analytics_student_visible(s.student_id)),
    (select round(100.0 * (select count(*) from public.lecture_progress p
                             join public.enrollments e on e.course_id = p.course_id and e.student_id = p.student_id
                            where p.course_id in (select course_id from scope) and public.analytics_student_visible(p.student_id))
                  / nullif((select count(*) from public.lectures l
                              join public.enrollments e on e.course_id = l.course_id
                             where l.course_id in (select course_id from scope) and public.analytics_student_visible(e.student_id)), 0), 1)),
    (select count(*) from public.submissions s join public.assignments a on a.id = s.assignment_id
      where s.status = 'submitted' and a.course_id in (select course_id from scope) and public.analytics_student_visible(s.student_id));
end;
$$;
revoke execute on function public.analytics_current() from public, anon;
grant execute on function public.analytics_current() to authenticated;

-- 14.2 Course performance.
create or replace function public.analytics_course_performance()
returns table (course_id uuid, title text, code text, faculty_name text, students bigint, attendance_rate numeric,
               exam_average numeric, exam_pass_rate numeric, assignment_average numeric, on_time_rate numeric, completion_rate numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.analytics_allowed() then
    raise exception 'Not allowed';
  end if;
  return query
  select c.id, c.title, c.code, p.full_name,
    (select count(*) from public.enrollments e where e.course_id = c.id and public.analytics_student_visible(e.student_id)),
    (select round(100.0 * count(*) filter (where r.status in ('present', 'late')) / nullif(count(*) filter (where r.status <> 'excused'), 0), 1)
       from public.attendance_records r join public.attendance_sessions s on s.id = r.session_id and s.submitted_at is not null
      where s.course_id = c.id and public.analytics_student_visible(r.student_id)),
    (select round(avg(r.marks / x.max_marks * 100) filter (where not r.absent), 1)
       from public.exam_results r join public.exams x on x.id = r.exam_id and x.results_status = 'approved'
      where x.course_id = c.id and public.analytics_student_visible(r.student_id)),
    (select round(100.0 * count(*) filter (where not r.absent and r.marks / x.max_marks >= 0.5) / nullif(count(*), 0), 1)
       from public.exam_results r join public.exams x on x.id = r.exam_id and x.results_status = 'approved'
      where x.course_id = c.id and public.analytics_student_visible(r.student_id)),
    (select round(avg(s.score / a.max_score * 100), 1)
       from public.submissions s join public.assignments a on a.id = s.assignment_id
      where s.status = 'graded' and a.course_id = c.id and public.analytics_student_visible(s.student_id)),
    (select round(100.0 * count(*) filter (where not s.late) / nullif(count(*), 0), 1)
       from public.submissions s join public.assignments a on a.id = s.assignment_id
      where s.status in ('submitted', 'graded') and a.course_id = c.id and public.analytics_student_visible(s.student_id)),
    (select round(100.0 * (select count(*) from public.lecture_progress lp
                             join public.enrollments e on e.course_id = lp.course_id and e.student_id = lp.student_id
                            where lp.course_id = c.id and public.analytics_student_visible(lp.student_id))
                  / nullif((select count(*) from public.lectures l
                              join public.enrollments e on e.course_id = l.course_id
                             where l.course_id = c.id and public.analytics_student_visible(e.student_id)), 0), 1))
    from public.courses c
    left join public.profiles p on p.id = c.professor_id
   where c.id in (select course_id from public.analytics_courses_in_scope())
   order by c.title;
end;
$$;
revoke execute on function public.analytics_course_performance() from public, anon;
grant execute on function public.analytics_course_performance() to authenticated;

-- 14.3 Student attendance: each student in each course, between two dates.
create or replace function public.analytics_attendance(p_from date default null, p_to date default null)
returns table (student_id uuid, full_name text, user_code text, course_id uuid, course_title text, class_name text,
               sessions bigint, present bigint, late bigint, absent bigint, excused bigint, rate numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.analytics_allowed() then
    raise exception 'Not allowed';
  end if;
  return query
  select e.student_id, p.full_name, p.user_code, c.id, c.title, b.name,
         count(r.session_id),
         count(*) filter (where r.status = 'present'),
         count(*) filter (where r.status = 'late'),
         count(*) filter (where r.status = 'absent'),
         count(*) filter (where r.status = 'excused'),
         round(100.0 * count(*) filter (where r.status in ('present', 'late')) / nullif(count(*) filter (where r.status <> 'excused'), 0), 1)
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    join public.profiles p on p.id = e.student_id
    left join public.course_batches b on b.id = e.batch_id
    left join public.attendance_sessions s on s.course_id = e.course_id and s.submitted_at is not null
      and (p_from is null or s.held_on >= p_from) and (p_to is null or s.held_on <= p_to)
    left join public.attendance_records r on r.session_id = s.id and r.student_id = e.student_id
   where e.course_id in (select course_id from public.analytics_courses_in_scope())
     and public.analytics_student_visible(e.student_id)
   group by e.student_id, p.full_name, p.user_code, c.id, c.title, b.name
   order by c.title, p.full_name;
end;
$$;
revoke execute on function public.analytics_attendance(date, date) from public, anon;
grant execute on function public.analytics_attendance(date, date) to authenticated;
