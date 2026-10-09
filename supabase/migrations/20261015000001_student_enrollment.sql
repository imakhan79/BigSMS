-- Student enrollment: in a course, or in a batch of a course.
--
-- Workflow: Admin -> Student Enrollment -> Principal Approval.
--   1. The student office (Super Admin, Admin, Admin Manager) enrolls students in a course or
--      batch. Each student becomes an enrollment request (Pending).
--   2. The Principal reviews the request.
--   3. The Principal approves it, or rejects it with a reason.
--   4. An approved request becomes the student's course/batch enrollment.
-- A rejected request can be modified (course, batch, note) and resubmitted, or withdrawn.
-- Every enrollment needs the Principal's approval: enrollments are created only by
-- review_enrollments(), never inserted directly. Removing a student from a course is unchanged.

-- Course batches --------------------------------------------------------------------------
create table public.course_batches (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  name        text not null check (nullif(trim(name), '') is not null),
  starts_on   date,
  ends_on     date,
  capacity    integer check (capacity > 0),
  status      text not null default 'open' check (status in ('open', 'closed')),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index course_batches_name_key on public.course_batches (course_id, lower(name));
create trigger course_batches_updated_at before update on public.course_batches
  for each row execute function public.set_updated_at();
create trigger audit_course_batches after insert or update or delete on public.course_batches
  for each row execute function public.audit_row();

alter table public.course_batches enable row level security;
create policy course_batches_select on public.course_batches for select to authenticated using (
  (select public.manages_students()) or (select public.manages_courses()) or (select public.is_overseer())
  or public.can_view_course(course_id)
);
create policy course_batches_write on public.course_batches for all to authenticated
  using ((select public.manages_students()) or (select public.manages_courses()))
  with check ((select public.manages_students()) or (select public.manages_courses()));

-- Enrollments record their batch and the approval that created them.
alter table public.enrollments
  add column batch_id    uuid references public.course_batches (id) on delete set null,
  add column approved_by uuid references public.profiles (id) on delete set null,
  add column request_id  uuid;
create index enrollments_batch_idx on public.enrollments (batch_id);

-- Only review_enrollments() creates or changes enrollments (no insert or update policy).
-- Removing a student stays with the office.
drop policy enrollments_insert on public.enrollments;

-- Enrollment requests ---------------------------------------------------------------------
create type public.enrollment_request_status as enum ('pending', 'approved', 'rejected', 'withdrawn');

create table public.enrollment_requests (
  id            uuid primary key default gen_random_uuid(),
  request_no    text not null unique,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  course_id     uuid not null references public.courses (id) on delete cascade,
  batch_id      uuid references public.course_batches (id) on delete set null,
  note          text not null default '',
  status        public.enrollment_request_status not null default 'pending',
  submitted_by  uuid references public.profiles (id) on delete set null,
  submitted_at  timestamptz not null default now(),
  resubmissions integer not null default 0,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index enrollment_requests_status_idx on public.enrollment_requests (status, submitted_at);
create index enrollment_requests_student_idx on public.enrollment_requests (student_id);
create index enrollment_requests_course_idx on public.enrollment_requests (course_id);
-- One open request (pending or rejected) per student and course.
create unique index enrollment_requests_open_key on public.enrollment_requests (student_id, course_id)
  where status in ('pending', 'rejected');
create trigger enrollment_requests_updated_at before update on public.enrollment_requests
  for each row execute function public.set_updated_at();
create trigger audit_enrollment_requests after insert or update on public.enrollment_requests
  for each row execute function public.audit_row();

alter table public.enrollment_requests enable row level security;
-- Read only; every change goes through the functions below.
create policy enrollment_requests_select on public.enrollment_requests for select to authenticated using (
  (select public.manages_students()) or (select public.is_principal())
);

-- Checks shared by submit and resubmit.
create or replace function public.check_enrollment_target(p_student_id uuid, p_course_id uuid, p_batch_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_course public.courses;
  v_batch public.course_batches;
  v_name text;
begin
  select coalesce(nullif(full_name, ''), email) into v_name from public.profiles
   where id = p_student_id and role = 'student' and status = 'active';
  if v_name is null then
    raise exception 'Only active students can be enrolled';
  end if;
  select * into v_course from public.courses where id = p_course_id;
  if not found then
    raise exception 'Course not found';
  end if;
  if v_course.status = 'archived' then
    raise exception '% is archived', v_course.title;
  end if;
  if p_batch_id is not null then
    select * into v_batch from public.course_batches where id = p_batch_id;
    if not found or v_batch.course_id <> p_course_id then
      raise exception 'That batch does not belong to %', v_course.title;
    end if;
    if v_batch.status <> 'open' then
      raise exception 'Batch % is closed', v_batch.name;
    end if;
  end if;
  if exists (select 1 from public.enrollments
              where student_id = p_student_id and course_id = p_course_id
                and batch_id is not distinct from p_batch_id) then
    raise exception '% is already enrolled in %', v_name,
      v_course.title || case when p_batch_id is null then '' else ' (' || v_batch.name || ')' end;
  end if;
end;
$$;
revoke execute on function public.check_enrollment_target(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.notify_principals(p_title text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  for v_user in select id from public.profiles where role = 'principal' and status = 'active' loop
    perform public.notify(v_user, p_title, p_body, '/enrollment');
  end loop;
end;
$$;
revoke execute on function public.notify_principals(text, text) from public, anon, authenticated;

-- Step 1: the office enrolls one or more students in a course or batch. Returns the number
-- of requests created. Students who already have an open request for the course are refused.
create or replace function public.submit_enrollments(p_student_ids uuid[], p_course_id uuid, p_batch_id uuid default null, p_note text default '')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid;
  v_count integer := 0;
  v_title text;
begin
  if not public.manages_students() then
    raise exception 'Only the student office can enroll students';
  end if;
  if coalesce(array_length(p_student_ids, 1), 0) = 0 then
    raise exception 'Choose at least one student';
  end if;
  foreach v_student in array (select array_agg(distinct s) from unnest(p_student_ids) s) loop
    perform public.check_enrollment_target(v_student, p_course_id, p_batch_id);
    if exists (select 1 from public.enrollment_requests
                where student_id = v_student and course_id = p_course_id and status in ('pending', 'rejected')) then
      raise exception '% already has an open enrollment request for this course. Modify that one instead',
        (select coalesce(nullif(full_name, ''), email) from public.profiles where id = v_student);
    end if;
    insert into public.enrollment_requests (request_no, student_id, course_id, batch_id, note, submitted_by)
    values (public.next_document_no('ENR'), v_student, p_course_id, p_batch_id, trim(coalesce(p_note, '')), auth.uid());
    v_count := v_count + 1;
  end loop;

  select title into v_title from public.courses where id = p_course_id;
  perform public.notify_principals('Enrollments awaiting approval',
    v_count || ' student' || case when v_count = 1 then '' else 's' end || ' for ' || v_title);
  return v_count;
end;
$$;

-- A rejected (or still pending) request can be modified and resubmitted.
create or replace function public.resubmit_enrollment(p_request_id uuid, p_course_id uuid, p_batch_id uuid default null, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrollment_requests;
begin
  if not public.manages_students() then
    raise exception 'Only the student office can modify enrollment requests';
  end if;
  select * into v_request from public.enrollment_requests where id = p_request_id for update;
  if not found then
    raise exception 'Enrollment request not found';
  end if;
  if v_request.status not in ('pending', 'rejected') then
    raise exception 'This request is % and can no longer be changed', v_request.status;
  end if;
  perform public.check_enrollment_target(v_request.student_id, p_course_id, p_batch_id);
  if p_course_id <> v_request.course_id and exists (
       select 1 from public.enrollment_requests
        where student_id = v_request.student_id and course_id = p_course_id
          and status in ('pending', 'rejected') and id <> p_request_id) then
    raise exception 'This student already has an open request for that course';
  end if;

  update public.enrollment_requests
     set course_id = p_course_id, batch_id = p_batch_id, note = trim(coalesce(p_note, '')),
         status = 'pending', submitted_by = auth.uid(), submitted_at = now(),
         resubmissions = resubmissions + case when v_request.status = 'rejected' then 1 else 0 end
   where id = p_request_id;

  if v_request.status = 'rejected' then
    perform public.notify_principals('Enrollment resubmitted', v_request.request_no || ' is waiting for your approval');
  end if;
end;
$$;

create or replace function public.withdraw_enrollment(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.manages_students() then
    raise exception 'Only the student office can withdraw enrollment requests';
  end if;
  update public.enrollment_requests set status = 'withdrawn'
   where id = p_request_id and status in ('pending', 'rejected');
  if not found then
    raise exception 'Only pending or rejected requests can be withdrawn';
  end if;
end;
$$;

-- Steps 2-4: the Principal approves or rejects pending requests (one or many). Approving
-- creates the enrollment, or moves an enrolled student to the requested batch.
-- Returns the number of requests decided.
create or replace function public.review_enrollments(p_request_ids uuid[], p_decision text, p_note text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrollment_requests;
  v_batch public.course_batches;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_title text;
  v_count integer := 0;
begin
  if not public.is_principal() then
    raise exception 'Only the Principal can approve enrollments';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Unknown decision %', p_decision;
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'Give a reason when rejecting an enrollment';
  end if;

  for v_request in
    select * from public.enrollment_requests
     where id = any(p_request_ids) and status = 'pending'
     order by submitted_at
       for update
  loop
    select title into v_title from public.courses where id = v_request.course_id;

    if p_decision = 'approve' then
      perform public.check_enrollment_target(v_request.student_id, v_request.course_id, v_request.batch_id);
      if v_request.batch_id is not null then
        select * into v_batch from public.course_batches where id = v_request.batch_id for update;
        if v_batch.capacity is not null and (
             select count(*) from public.enrollments
              where batch_id = v_batch.id and student_id <> v_request.student_id) >= v_batch.capacity then
          raise exception 'Batch % of % is full (% students)', v_batch.name, v_title, v_batch.capacity;
        end if;
      end if;

      insert into public.enrollments (course_id, student_id, batch_id, approved_by, request_id)
      values (v_request.course_id, v_request.student_id, v_request.batch_id, auth.uid(), v_request.id)
      on conflict (course_id, student_id) do update
        set batch_id = excluded.batch_id, approved_by = excluded.approved_by, request_id = excluded.request_id;

      update public.enrollment_requests
         set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
       where id = v_request.id;
      if v_request.submitted_by is not null then
        perform public.notify(v_request.submitted_by, 'Enrollment approved',
          v_request.request_no || ': ' || v_title, '/enrollment');
      end if;
    else
      update public.enrollment_requests
         set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
       where id = v_request.id;
      if v_request.submitted_by is not null then
        perform public.notify(v_request.submitted_by, 'Enrollment rejected',
          v_request.request_no || ' (' || v_title || '): ' || v_note, '/enrollment?status=rejected');
      end if;
    end if;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'None of those requests are waiting for approval';
  end if;
  return v_count;
end;
$$;

revoke execute on function public.submit_enrollments(uuid[], uuid, uuid, text) from public, anon;
revoke execute on function public.resubmit_enrollment(uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.withdraw_enrollment(uuid) from public, anon;
revoke execute on function public.review_enrollments(uuid[], text, text) from public, anon;
grant execute on function public.submit_enrollments(uuid[], uuid, uuid, text) to authenticated;
grant execute on function public.resubmit_enrollment(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.withdraw_enrollment(uuid) to authenticated;
grant execute on function public.review_enrollments(uuid[], text, text) to authenticated;
