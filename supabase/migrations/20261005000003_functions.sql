-- BigSMS LMS: RPCs for quizzes, progress, analytics and KPI evaluation.

-- Quiz questions without the correct answers.
create or replace function public.get_quiz_questions(p_quiz_id uuid)
returns table (question_id uuid, prompt text, options text[], "position" integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_course uuid;
  v_published boolean;
begin
  select course_id, published into v_course, v_published from public.quizzes where id = p_quiz_id;
  if v_course is null then
    raise exception 'Quiz not found';
  end if;
  if not (public.is_admin() or public.is_professor_of(v_course) or (v_published and public.is_enrolled(v_course))) then
    raise exception 'Not allowed';
  end if;

  return query
    select q.id, q.prompt, q.options, qq.position
    from public.quiz_questions qq
    join public.questions q on q.id = qq.question_id
    where qq.quiz_id = p_quiz_id
    order by qq.position, q.created_at;
end;
$$;

-- Grades a quiz server-side. p_answers = {"<question_id>": <option index>, ...}
create or replace function public.submit_quiz(p_quiz_id uuid, p_answers jsonb)
returns public.quiz_attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_course uuid;
  v_published boolean;
  v_score integer;
  v_total integer;
  v_attempt public.quiz_attempts;
begin
  select course_id, published into v_course, v_published from public.quizzes where id = p_quiz_id;
  if v_course is null or not v_published or not public.is_enrolled(v_course) then
    raise exception 'Not allowed to take this quiz';
  end if;

  select count(*),
         count(*) filter (where (p_answers ->> q.id::text) ~ '^\d+$' and (p_answers ->> q.id::text)::int = q.correct_index)
    into v_total, v_score
  from public.quiz_questions qq
  join public.questions q on q.id = qq.question_id
  where qq.quiz_id = p_quiz_id;

  insert into public.quiz_attempts (quiz_id, student_id, answers, score, total)
  values (p_quiz_id, auth.uid(), p_answers, v_score, v_total)
  returning * into v_attempt;

  return v_attempt;
exception when unique_violation then
  raise exception 'You have already submitted this quiz';
end;
$$;

-- Per-course metrics. Admins see all courses, professors their own.
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
    where public.is_admin() or (public.app_role() = 'professor' and c.professor_id = auth.uid())
  ),
  enr as (
    select e.course_id, count(*) as n from public.enrollments e group by e.course_id
  ),
  lec as (
    select l.course_id, count(*) as n from public.lectures l group by l.course_id
  ),
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
  asg as (
    select a.course_id, count(*) as n from public.assignments a where a.published group by a.course_id
  ),
  sub as (
    select a.course_id, count(*) as n
    from public.submissions s join public.assignments a on a.id = s.assignment_id
    where a.published
    group by a.course_id
  )
  select
    v.id,
    v.title,
    p.full_name,
    v.status,
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

-- Progress of one student across their published courses (student-visible data only).
-- Callable by the student, their parent, or an admin.
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
  if not ((p_student_id = auth.uid() and public.is_active()) or public.is_parent_of(p_student_id) or public.is_admin()) then
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

-- Per-student progress inside one course, for the owning professor or an admin.
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
  if not (public.is_admin() or public.is_professor_of(p_course_id)) then
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

-- Checks every enabled KPI against every published course. Opens an alert (and
-- notifies the professor) when a threshold is breached and no open alert exists.
create or replace function public.evaluate_kpis()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  k public.kpi_definitions;
  s record;
  v_value numeric;
  v_breached boolean;
  v_created integer := 0;
  v_professor uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can evaluate KPIs';
  end if;

  for k in select * from public.kpi_definitions where enabled loop
    for s in select * from public.course_stats() cs where cs.status = 'published' loop
      v_value := case k.metric
        when 'completion_rate' then s.completion_rate
        when 'avg_quiz_score' then s.avg_quiz_score
        when 'submission_rate' then s.submission_rate
        when 'enrolled_students' then s.enrolled
      end;
      v_breached := case k.comparison when 'below' then v_value < k.threshold else v_value > k.threshold end;

      if v_breached and not exists (
        select 1 from public.alerts a where a.kpi_id = k.id and a.course_id = s.course_id and a.status <> 'resolved'
      ) then
        insert into public.alerts (kpi_id, course_id, value, message)
        values (k.id, s.course_id, v_value,
                format('%s: %s is %s (threshold %s %s)', s.title, k.name, v_value, k.comparison, k.threshold));
        select professor_id into v_professor from public.courses where id = s.course_id;
        perform public.notify(v_professor, 'KPI alert: ' || k.name,
                format('%s is %s (threshold %s %s)', s.title, v_value, k.comparison, k.threshold),
                '/professor/courses/' || s.course_id);
        v_created := v_created + 1;
      end if;
    end loop;
  end loop;

  return v_created;
end;
$$;

revoke execute on function public.get_quiz_questions(uuid) from public, anon;
revoke execute on function public.submit_quiz(uuid, jsonb) from public, anon;
revoke execute on function public.course_stats() from public, anon;
revoke execute on function public.student_progress(uuid) from public, anon;
revoke execute on function public.course_student_progress(uuid) from public, anon;
revoke execute on function public.evaluate_kpis() from public, anon;
grant execute on function public.get_quiz_questions(uuid) to authenticated;
grant execute on function public.submit_quiz(uuid, jsonb) to authenticated;
grant execute on function public.course_stats() to authenticated;
grant execute on function public.student_progress(uuid) to authenticated;
grant execute on function public.course_student_progress(uuid) to authenticated;
grant execute on function public.evaluate_kpis() to authenticated;
