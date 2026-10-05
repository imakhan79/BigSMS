-- Principal: academic head. Approves/rejects submitted courses and has read-only
-- oversight of all courses, content, progress, analytics and KPI alerts.
-- System administration (users, settings, KPI configuration, audit) stays with Admin.

create or replace function public.is_principal()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() = 'principal', false);
$$;

-- Admin or Principal: may see everything academic.
create or replace function public.is_overseer()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() in ('admin', 'principal'), false);
$$;

create or replace function public.can_view_course_content(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_overseer() or public.is_professor_of(p_course_id) or public.is_enrolled(p_course_id);
$$;

-- Course workflow: principal may approve or reject a pending course.
create or replace function public.guard_course_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    if new.status is distinct from old.status and new.status in ('published', 'rejected') then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  if public.is_principal() then
    if new.status is not distinct from old.status
       or old.status <> 'pending_approval'
       or new.status not in ('published', 'rejected') then
      raise exception 'Principals can only approve or reject courses awaiting approval';
    end if;
    if (to_jsonb(new) - array['status', 'review_note', 'reviewed_by', 'reviewed_at', 'updated_at'])
       is distinct from (to_jsonb(old) - array['status', 'review_note', 'reviewed_by', 'reviewed_at', 'updated_at']) then
      raise exception 'Principals cannot edit course content';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    return new;
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
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  return new;
end;
$$;

-- Submitted courses notify admins and principals.
create or replace function public.notify_course_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  reviewer record;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'pending_approval' then
    for reviewer in select id, role from public.profiles where role in ('admin', 'principal') and status = 'active' loop
      perform public.notify(reviewer.id, 'Course awaiting approval', new.title,
        case when reviewer.role = 'principal' then '/principal/courses' else '/admin/courses' end);
    end loop;
  elsif new.status = 'published' then
    perform public.notify(new.professor_id, 'Course approved', new.title || ' is now published.', '/professor/courses/' || new.id);
  elsif new.status = 'rejected' then
    perform public.notify(new.professor_id, 'Course rejected', coalesce(new.review_note, new.title), '/professor/courses/' || new.id);
  end if;
  return new;
end;
$$;

-- Read policies: admin checks become overseer checks --------------------------
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select public.is_overseer())
  or ((select public.app_role()) = 'professor' and role = 'student')
  or ((select public.is_active()) and role in ('professor', 'principal'))
  or public.is_parent_of(id)
);

drop policy parent_students_select on public.parent_students;
create policy parent_students_select on public.parent_students for select to authenticated using (
  (select public.is_overseer())
  or (parent_id = (select auth.uid()) and (select public.is_active()))
);

drop policy courses_update on public.courses;
create policy courses_update on public.courses for update to authenticated
  using ((select public.is_overseer()) or public.is_professor_of(id))
  with check ((select public.is_overseer()) or professor_id = (select auth.uid()));

drop policy enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(course_id)
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);

drop policy progress_select on public.lecture_progress;
create policy progress_select on public.lecture_progress for select to authenticated using (
  (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
  or public.is_professor_of(course_id)
  or (select public.is_overseer())
);

drop policy assignments_select on public.assignments;
create policy assignments_select on public.assignments for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(course_id)
  or (published and (public.is_enrolled(course_id) or public.parent_sees_course(course_id)))
);

drop policy submissions_select on public.submissions;
create policy submissions_select on public.submissions for select to authenticated using (
  (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
  or public.is_professor_of(public.assignment_course(assignment_id))
  or (select public.is_overseer())
);

drop policy quizzes_select on public.quizzes;
create policy quizzes_select on public.quizzes for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(course_id)
  or (published and (public.is_enrolled(course_id) or public.parent_sees_course(course_id)))
);

drop policy quiz_attempts_select on public.quiz_attempts;
create policy quiz_attempts_select on public.quiz_attempts for select to authenticated using (
  (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
  or public.is_professor_of(public.quiz_course(quiz_id))
  or (select public.is_overseer())
);

drop policy kpis_select on public.kpi_definitions;
create policy kpis_select on public.kpi_definitions for select to authenticated
  using ((select public.app_role()) in ('admin', 'principal', 'professor'));

drop policy alerts_select on public.alerts;
create policy alerts_select on public.alerts for select to authenticated
  using ((select public.is_overseer()) or public.is_professor_of(course_id));

-- RPCs ------------------------------------------------------------------------
create or replace function public.course_stats()
returns table (
  course_id uuid,
  title text,
  professor_name text,
  status public.course_status,
  enrolled bigint,
  lectures bigint,
  completion_rate numeric,
  avg_quiz_score numeric,
  submission_rate numeric
)
language sql stable security definer set search_path = '' as $$
  with visible as (
    select c.* from public.courses c
    where public.is_overseer() or (public.app_role() = 'professor' and c.professor_id = auth.uid())
  ),
  enr as (select e.course_id, count(*) as n from public.enrollments e group by e.course_id),
  lec as (select l.course_id, count(*) as n from public.lectures l group by l.course_id),
  done as (
    select lp.course_id, count(*) as n
    from public.lecture_progress lp
    join public.enrollments e on e.course_id = lp.course_id and e.student_id = lp.student_id
    group by lp.course_id
  ),
  quiz as (
    select qz.course_id, avg(a.score::numeric / nullif(a.total, 0) * 100) as pct
    from public.quiz_attempts a join public.quizzes qz on qz.id = a.quiz_id
    group by qz.course_id
  ),
  asg as (select a.course_id, count(*) as n from public.assignments a where a.published group by a.course_id),
  sub as (
    select a.course_id, count(*) as n
    from public.submissions s join public.assignments a on a.id = s.assignment_id
    where a.published
    group by a.course_id
  )
  select
    v.id, v.title, p.full_name, v.status,
    coalesce(enr.n, 0),
    coalesce(lec.n, 0),
    round(coalesce(done.n::numeric / nullif(enr.n * lec.n, 0) * 100, 0), 1),
    round(coalesce(quiz.pct, 0), 1),
    round(coalesce(sub.n::numeric / nullif(enr.n * asg.n, 0) * 100, 0), 1)
  from visible v
  join public.profiles p on p.id = v.professor_id
  left join enr on enr.course_id = v.id
  left join lec on lec.course_id = v.id
  left join done on done.course_id = v.id
  left join quiz on quiz.course_id = v.id
  left join asg on asg.course_id = v.id
  left join sub on sub.course_id = v.id
  order by v.title;
$$;

create or replace function public.student_progress(p_student_id uuid)
returns table (
  course_id uuid,
  title text,
  professor_name text,
  lectures_total bigint,
  lectures_done bigint,
  completion_rate numeric,
  quiz_avg numeric,
  assignment_avg numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not ((p_student_id = auth.uid() and public.is_active()) or public.is_parent_of(p_student_id) or public.is_overseer()) then
    raise exception 'Not allowed';
  end if;

  return query
    select
      c.id,
      c.title,
      p.full_name,
      (select count(*) from public.lectures l where l.course_id = c.id),
      (select count(*) from public.lecture_progress lp where lp.course_id = c.id and lp.student_id = p_student_id),
      round(coalesce(
        (select count(*) from public.lecture_progress lp where lp.course_id = c.id and lp.student_id = p_student_id)::numeric
        / nullif((select count(*) from public.lectures l where l.course_id = c.id), 0) * 100, 0), 1),
      (select round(avg(a.score::numeric / nullif(a.total, 0) * 100), 1)
         from public.quiz_attempts a join public.quizzes qz on qz.id = a.quiz_id
        where qz.course_id = c.id and a.student_id = p_student_id),
      (select round(avg(s.score / asg.max_score * 100), 1)
         from public.submissions s join public.assignments asg on asg.id = s.assignment_id
        where asg.course_id = c.id and s.student_id = p_student_id and s.status = 'graded')
    from public.enrollments e
    join public.courses c on c.id = e.course_id and c.status = 'published'
    join public.profiles p on p.id = c.professor_id
    where e.student_id = p_student_id
    order by c.title;
end;
$$;

create or replace function public.course_student_progress(p_course_id uuid)
returns table (
  student_id uuid,
  full_name text,
  email text,
  completion_rate numeric,
  quiz_avg numeric,
  assignment_avg numeric
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
      p.email,
      round(coalesce(
        (select count(*) from public.lecture_progress lp where lp.course_id = p_course_id and lp.student_id = p.id)::numeric
        / nullif((select count(*) from public.lectures l where l.course_id = p_course_id), 0) * 100, 0), 1),
      (select round(avg(a.score::numeric / nullif(a.total, 0) * 100), 1)
         from public.quiz_attempts a join public.quizzes qz on qz.id = a.quiz_id
        where qz.course_id = p_course_id and a.student_id = p.id),
      (select round(avg(s.score / asg.max_score * 100), 1)
         from public.submissions s join public.assignments asg on asg.id = s.assignment_id
        where asg.course_id = p_course_id and s.student_id = p.id and s.status = 'graded')
    from public.enrollments e
    join public.profiles p on p.id = e.student_id
    where e.course_id = p_course_id
    order by p.full_name;
end;
$$;
