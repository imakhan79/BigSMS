-- Certificate eligibility follows the final report.
--
-- Overall flow: ... Examinations -> Faculty grading / results -> Final report -> Certificate
-- eligibility -> Principal approval. A student can be put on a certificate list only once their
-- final report has been submitted by Faculty:
--   * a list for a course needs that course's final report;
--   * a list not tied to a course needs a submitted final report in every course the student
--     is enrolled in.
-- Eligibility now also shows the final report (percentage, grade) and the published exam
-- average, and counts only submitted attendance registers.

alter table public.certificate_list_entries
  add column final_percentage numeric(5, 1),
  add column final_grade      text,
  add column exam_average     numeric(5, 1);

drop function public.student_eligibility(uuid, uuid);
create function public.student_eligibility(p_student_id uuid, p_course_id uuid)
returns table (completion_rate numeric, attendance_rate numeric, outstanding_fees numeric, exam_average numeric,
               final_percentage numeric, final_grade text, final_submitted boolean)
language sql stable security definer set search_path = '' as $$
  select
    case when p_course_id is null then null else
      round(coalesce(
        (select count(*) from public.lecture_progress lp where lp.course_id = p_course_id and lp.student_id = p_student_id)::numeric
        / nullif((select count(*) from public.lectures l where l.course_id = p_course_id), 0) * 100, 0), 1)
    end,
    (select round(100.0 * count(*) filter (where r.status in ('present', 'late'))
                  / nullif(count(*) filter (where r.status <> 'excused'), 0), 1)
       from public.attendance_records r
       join public.attendance_sessions s on s.id = r.session_id and s.submitted_at is not null
      where r.student_id = p_student_id and (p_course_id is null or s.course_id = p_course_id)),
    (select coalesce(sum(i.amount - i.amount_paid), 0)
       from public.invoices i
      where i.student_id = p_student_id and i.status in ('unpaid', 'partial')),
    (select round(avg(r.marks / x.max_marks * 100) filter (where not r.absent), 1)
       from public.exam_results r
       join public.exams x on x.id = r.exam_id and x.results_status = 'approved'
      where r.student_id = p_student_id and (p_course_id is null or x.course_id = p_course_id)),
    (select round(avg(f.percentage), 1)
       from public.final_reports f
      where f.student_id = p_student_id and f.submitted_at is not null and (p_course_id is null or f.course_id = p_course_id)),
    case when p_course_id is null then null else
      (select nullif(f.grade, '') from public.final_reports f
        where f.student_id = p_student_id and f.course_id = p_course_id and f.submitted_at is not null)
    end,
    case when p_course_id is not null then
      exists (select 1 from public.final_reports f
               where f.student_id = p_student_id and f.course_id = p_course_id and f.submitted_at is not null)
    else
      exists (select 1 from public.enrollments e where e.student_id = p_student_id)
      and not exists (select 1 from public.enrollments e
                       where e.student_id = p_student_id
                         and not exists (select 1 from public.final_reports f
                                          where f.course_id = e.course_id and f.student_id = p_student_id and f.submitted_at is not null))
    end;
$$;
revoke execute on function public.student_eligibility(uuid, uuid) from public, anon, authenticated;

create or replace function public.guard_certificate_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_list public.certificate_lists;
  v_elig record;
begin
  if coalesce(current_setting('bigsms.review', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select * into v_list from public.certificate_lists where id = coalesce(new.list_id, old.list_id);
  if v_list.status not in ('draft', 'rejected') then
    raise exception 'A list that has been submitted or approved cannot be changed';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.list_id is distinct from old.list_id or new.student_id is distinct from old.student_id then
      raise exception 'Add the student to the list again instead';
    end if;
    new.completion_rate := old.completion_rate;
    new.attendance_rate := old.attendance_rate;
    new.outstanding_fees := old.outstanding_fees;
    new.exam_average := old.exam_average;
    new.final_percentage := old.final_percentage;
    new.final_grade := old.final_grade;
    new.certificate_id := old.certificate_id;
    new.added_by := old.added_by;
    new.added_at := old.added_at;
    new.note := trim(new.note);
    return new;
  end if;

  if not exists (select 1 from public.profiles where id = new.student_id and role = 'student') then
    raise exception 'Only students can be added to a certificate list';
  end if;
  if v_list.course_id is not null
     and not exists (select 1 from public.enrollments where course_id = v_list.course_id and student_id = new.student_id) then
    raise exception 'That student is not enrolled in this course';
  end if;
  if exists (select 1 from public.certificates
             where student_id = new.student_id and status = 'issued' and kind = v_list.kind
               and course_id is not distinct from v_list.course_id) then
    raise exception 'That student already holds this certificate';
  end if;
  select * into v_elig from public.student_eligibility(new.student_id, v_list.course_id);
  if not v_elig.final_submitted then
    raise exception '% is not eligible yet: %',
      (select full_name from public.profiles where id = new.student_id),
      case when v_list.course_id is null then 'Faculty have not submitted a final report in every course they are enrolled in'
           else 'the course''s Faculty have not submitted their final report' end;
  end if;
  new.completion_rate := v_elig.completion_rate;
  new.attendance_rate := v_elig.attendance_rate;
  new.outstanding_fees := v_elig.outstanding_fees;
  new.exam_average := v_elig.exam_average;
  new.final_percentage := v_elig.final_percentage;
  new.final_grade := v_elig.final_grade;
  new.note := trim(new.note);
  new.certificate_id := null;
  new.added_by := coalesce(auth.uid(), new.added_by);
  new.added_at := now();
  return new;
end;
$$;

drop function public.certificate_candidates(uuid);
create function public.certificate_candidates(p_course_id uuid)
returns table (student_id uuid, full_name text, user_code text, completion_rate numeric, quiz_avg numeric,
               assignment_avg numeric, attendance_rate numeric, outstanding_fees numeric, exam_average numeric,
               final_percentage numeric, final_grade text, final_submitted boolean, has_certificate boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.manages_students() or public.is_overseer()) then
    raise exception 'Not allowed';
  end if;
  return query
    select p.id, p.full_name, p.user_code, el.completion_rate,
           (select round(avg(a.score::numeric / nullif(a.total, 0) * 100), 1)
              from public.quiz_attempts a join public.quizzes qz on qz.id = a.quiz_id
             where qz.course_id = p_course_id and a.student_id = p.id),
           (select round(avg(s.score / asg.max_score * 100), 1)
              from public.submissions s join public.assignments asg on asg.id = s.assignment_id
             where asg.course_id = p_course_id and s.student_id = p.id and s.status = 'graded'),
           el.attendance_rate, el.outstanding_fees, el.exam_average, el.final_percentage, el.final_grade, el.final_submitted,
           exists (select 1 from public.certificates c
                    where c.student_id = p.id and c.course_id = p_course_id and c.status = 'issued')
      from public.enrollments e
      join public.profiles p on p.id = e.student_id and p.status = 'active'
      cross join lateral public.student_eligibility(p.id, p_course_id) el
     where e.course_id = p_course_id
     order by p.full_name;
end;
$$;
revoke execute on function public.certificate_candidates(uuid) from public, anon;
grant execute on function public.certificate_candidates(uuid) to authenticated;

-- Submitting refreshes every figure and re-checks that each final report is still submitted.
create or replace function public.submit_certificate_list(p_list_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_list public.certificate_lists;
  v_principal uuid;
  v_count integer;
  v_missing text;
begin
  if not public.prepares_certificates() then
    raise exception 'Certificate lists are prepared by the Admin Manager';
  end if;
  select * into v_list from public.certificate_lists where id = p_list_id for update;
  if not found then
    raise exception 'List not found';
  end if;
  if v_list.status not in ('draft', 'rejected') then
    raise exception 'This list has already been submitted';
  end if;
  select count(*) into v_count from public.certificate_list_entries where list_id = v_list.id;
  if v_count = 0 then
    raise exception 'Add at least one eligible student before submitting';
  end if;
  select string_agg(p.full_name, ', ') into v_missing
    from public.certificate_list_entries e
    join public.profiles p on p.id = e.student_id
   where e.list_id = v_list.id
     and not (select el.final_submitted from public.student_eligibility(e.student_id, v_list.course_id) el);
  if v_missing is not null then
    raise exception 'Final reports are not submitted for: %. Remove them or wait for Faculty', v_missing;
  end if;

  perform set_config('bigsms.review', 'on', true);
  update public.certificate_list_entries e
     set (completion_rate, attendance_rate, outstanding_fees, exam_average, final_percentage, final_grade) =
         (select el.completion_rate, el.attendance_rate, el.outstanding_fees, el.exam_average, el.final_percentage, el.final_grade
            from public.student_eligibility(e.student_id, v_list.course_id) el)
   where e.list_id = v_list.id;
  update public.certificate_lists
     set status = 'submitted', submitted_at = now(), reviewed_by = null, reviewed_at = null
   where id = v_list.id;
  perform set_config('bigsms.review', 'off', true);

  for v_principal in select id from public.profiles where role = 'principal' and status = 'active' loop
    perform public.notify(v_principal, 'Certificate list awaiting your approval',
      v_list.title || ' (' || v_count || ' student' || case when v_count = 1 then '' else 's' end || ')',
      '/principal/certificates/' || v_list.id);
  end loop;
end;
$$;

-- Existing entries get the new figures for the record.
select set_config('bigsms.review', 'on', true);
update public.certificate_list_entries e
   set (exam_average, final_percentage, final_grade) =
       (select el.exam_average, el.final_percentage, el.final_grade
          from public.certificate_lists l, public.student_eligibility(e.student_id, l.course_id) el
         where l.id = e.list_id);
select set_config('bigsms.review', 'off', true);
