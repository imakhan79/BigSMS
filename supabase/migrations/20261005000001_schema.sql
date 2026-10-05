-- BigSMS LMS: core schema, helper functions and workflow triggers.
-- Roles: admin, professor, student, parent.

-- Types ---------------------------------------------------------------------
create type public.user_role as enum ('admin', 'professor', 'student', 'parent');
create type public.user_status as enum ('pending', 'active', 'inactive');
create type public.course_status as enum ('draft', 'pending_approval', 'published', 'rejected', 'archived');
create type public.material_type as enum ('video', 'pdf', 'book', 'notes', 'worksheet');
create type public.submission_status as enum ('submitted', 'graded');
create type public.kpi_metric as enum ('completion_rate', 'avg_quiz_score', 'submission_rate', 'enrolled_students');
create type public.kpi_comparison as enum ('below', 'above');
create type public.alert_status as enum ('open', 'acknowledged', 'resolved');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Users ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.user_role not null default 'student',
  status      public.user_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

create table public.parent_students (
  parent_id   uuid not null references public.profiles (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (parent_id, student_id)
);
create index parent_students_student_idx on public.parent_students (student_id);

-- Courses -------------------------------------------------------------------
create table public.course_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  professor_id  uuid not null references public.profiles (id) on delete restrict,
  category_id   uuid references public.course_categories (id) on delete set null,
  title         text not null,
  description   text not null default '',
  outline       text not null default '',
  status        public.course_status not null default 'draft',
  review_note   text,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index courses_professor_idx on public.courses (professor_id);
create index courses_category_idx on public.courses (category_id);
create index courses_status_idx on public.courses (status);

create table public.enrollments (
  course_id    uuid not null references public.courses (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  enrolled_at  timestamptz not null default now(),
  primary key (course_id, student_id)
);
create index enrollments_student_idx on public.enrollments (student_id);

create table public.lectures (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  title       text not null,
  content     text not null default '',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, course_id)
);
create index lectures_course_idx on public.lectures (course_id, position);

create table public.materials (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  lecture_id    uuid references public.lectures (id) on delete cascade,
  type          public.material_type not null,
  title         text not null,
  file_path     text,
  external_url  text,
  created_at    timestamptz not null default now(),
  check (file_path is not null or external_url is not null)
);
create index materials_course_idx on public.materials (course_id);
create index materials_lecture_idx on public.materials (lecture_id);

create table public.lecture_progress (
  student_id    uuid not null references public.profiles (id) on delete cascade,
  lecture_id    uuid not null,
  course_id     uuid not null,
  completed_at  timestamptz not null default now(),
  primary key (student_id, lecture_id),
  foreign key (lecture_id, course_id) references public.lectures (id, course_id) on delete cascade
);
create index lecture_progress_lecture_idx on public.lecture_progress (lecture_id, course_id);
create index lecture_progress_course_idx on public.lecture_progress (course_id);

-- Assignments ---------------------------------------------------------------
create table public.assignments (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  title         text not null,
  instructions  text not null default '',
  due_at        timestamptz,
  max_score     integer not null default 100 check (max_score > 0),
  published     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index assignments_course_idx on public.assignments (course_id);

create table public.submissions (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments (id) on delete cascade,
  student_id     uuid not null references public.profiles (id) on delete cascade,
  content        text not null,
  link_url       text,
  status         public.submission_status not null default 'submitted',
  score          numeric check (score >= 0),
  feedback       text,
  submitted_at   timestamptz not null default now(),
  graded_at      timestamptz,
  graded_by      uuid references public.profiles (id) on delete set null,
  unique (assignment_id, student_id)
);
create index submissions_student_idx on public.submissions (student_id);

-- Question bank and quizzes -------------------------------------------------
create table public.questions (
  id             uuid primary key default gen_random_uuid(),
  created_by     uuid references public.profiles (id) on delete set null,
  category_id    uuid references public.course_categories (id) on delete set null,
  prompt         text not null,
  options        text[] not null check (array_length(options, 1) between 2 and 6),
  correct_index  integer not null,
  difficulty     text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (correct_index >= 0 and correct_index < array_length(options, 1))
);
create index questions_created_by_idx on public.questions (created_by);
create index questions_category_idx on public.questions (category_id);

create table public.quizzes (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses (id) on delete cascade,
  title        text not null,
  description  text not null default '',
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index quizzes_course_idx on public.quizzes (course_id);

create table public.quiz_questions (
  quiz_id      uuid not null references public.quizzes (id) on delete cascade,
  question_id  uuid not null references public.questions (id) on delete cascade,
  position     integer not null default 0,
  primary key (quiz_id, question_id)
);
create index quiz_questions_question_idx on public.quiz_questions (question_id);

create table public.quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  answers       jsonb not null default '{}',
  score         integer not null,
  total         integer not null,
  submitted_at  timestamptz not null default now(),
  unique (quiz_id, student_id)
);
create index quiz_attempts_student_idx on public.quiz_attempts (student_id);

-- Notifications, KPIs, alerts, settings, audit ------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  body        text not null default '',
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.kpi_definitions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  metric      public.kpi_metric not null,
  comparison  public.kpi_comparison not null default 'below',
  threshold   numeric not null,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.alerts (
  id           uuid primary key default gen_random_uuid(),
  kpi_id       uuid not null references public.kpi_definitions (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  value        numeric not null,
  message      text not null,
  status       public.alert_status not null default 'open',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id) on delete set null
);
create index alerts_kpi_idx on public.alerts (kpi_id);
create index alerts_course_idx on public.alerts (course_id);
create index alerts_open_idx on public.alerts (created_at desc) where status = 'open';

create table public.system_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  table_name  text not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- updated_at triggers
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses for each row execute function public.set_updated_at();
create trigger lectures_updated_at before update on public.lectures for each row execute function public.set_updated_at();
create trigger assignments_updated_at before update on public.assignments for each row execute function public.set_updated_at();
create trigger questions_updated_at before update on public.questions for each row execute function public.set_updated_at();
create trigger quizzes_updated_at before update on public.quizzes for each row execute function public.set_updated_at();
create trigger kpi_definitions_updated_at before update on public.kpi_definitions for each row execute function public.set_updated_at();
create trigger system_settings_updated_at before update on public.system_settings for each row execute function public.set_updated_at();

-- Access helpers (security definer so policies can use them without RLS recursion)
create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.app_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and status = 'active';
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() = 'admin', false);
$$;

create or replace function public.is_professor_of(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_role() = 'professor'
     and exists (select 1 from public.courses where id = p_course_id and professor_id = auth.uid());
$$;

create or replace function public.is_enrolled(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_role() = 'student'
     and exists (
       select 1 from public.enrollments e
       join public.courses c on c.id = e.course_id
       where e.course_id = p_course_id and e.student_id = auth.uid() and c.status = 'published'
     );
$$;

create or replace function public.is_parent_of(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_role() = 'parent'
     and exists (select 1 from public.parent_students where parent_id = auth.uid() and student_id = p_student_id);
$$;

create or replace function public.parent_sees_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_role() = 'parent'
     and exists (
       select 1 from public.parent_students ps
       join public.enrollments e on e.student_id = ps.student_id
       join public.courses c on c.id = e.course_id
       where ps.parent_id = auth.uid() and e.course_id = p_course_id and c.status = 'published'
     );
$$;

-- Admin, owning professor, or an enrolled student (published courses only).
create or replace function public.can_view_course_content(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.is_professor_of(p_course_id) or public.is_enrolled(p_course_id);
$$;

-- Everything above, plus parents of an enrolled student.
create or replace function public.can_view_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_view_course_content(p_course_id) or public.parent_sees_course(p_course_id);
$$;

create or replace function public.assignment_course(p_assignment_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select course_id from public.assignments where id = p_assignment_id;
$$;

create or replace function public.quiz_course(p_quiz_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select course_id from public.quizzes where id = p_quiz_id;
$$;

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.notify(p_user_id uuid, p_title text, p_body text, p_link text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, title, body, link) values (p_user_id, p_title, p_body, p_link);
$$;
revoke execute on function public.notify(uuid, text, text, text) from public, anon, authenticated;

-- New auth users get a pending profile; admins activate them.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_user_meta_data ->> 'role' in ('professor', 'student', 'parent')
         then (new.raw_user_meta_data ->> 'role')::public.user_role
         else 'student' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins (or server-side service role, where auth.uid() is null) may change role/status/email.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role or new.status is distinct from old.status or new.email is distinct from old.email then
    raise exception 'Only administrators can change role, status or email';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Course approval workflow:
--   professor: draft/rejected -> pending_approval, pending_approval -> draft, any -> archived
--   admin:     pending_approval -> published/rejected, any -> archived
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

create trigger courses_guard before update on public.courses
  for each row execute function public.guard_course_update();

create or replace function public.notify_course_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  admin_id uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'pending_approval' then
    for admin_id in select id from public.profiles where role = 'admin' and status = 'active' loop
      perform public.notify(admin_id, 'Course awaiting approval', new.title, '/admin/courses');
    end loop;
  elsif new.status = 'published' then
    perform public.notify(new.professor_id, 'Course approved', new.title || ' is now published.', '/professor/courses/' || new.id);
  elsif new.status = 'rejected' then
    perform public.notify(new.professor_id, 'Course rejected', coalesce(new.review_note, new.title), '/professor/courses/' || new.id);
  end if;
  return new;
end;
$$;

create trigger courses_notify after update on public.courses
  for each row execute function public.notify_course_status();

create or replace function public.notify_enrollment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(new.student_id, 'Enrolled in a course',
    (select title from public.courses where id = new.course_id), '/student/courses/' || new.course_id);
  return new;
end;
$$;

create trigger enrollments_notify after insert on public.enrollments
  for each row execute function public.notify_enrollment();

-- Students may only submit/edit their own work before grading; professors only grade.
create or replace function public.guard_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

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

  -- grader
  new.content := old.content;
  new.link_url := old.link_url;
  new.student_id := old.student_id;
  new.assignment_id := old.assignment_id;
  if new.status = 'graded' then
    if new.score is null then
      raise exception 'A score is required to grade a submission';
    end if;
    new.graded_at := now();
    new.graded_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger submissions_guard before insert or update on public.submissions
  for each row execute function public.guard_submission();

create or replace function public.notify_submission_graded()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'graded' and old.status is distinct from 'graded' then
    perform public.notify(new.student_id, 'Assignment graded',
      (select title from public.assignments where id = new.assignment_id),
      '/student/courses/' || public.assignment_course(new.assignment_id));
  end if;
  return new;
end;
$$;

create trigger submissions_notify after update on public.submissions
  for each row execute function public.notify_submission_graded();

-- Audit trail
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'key', concat_ws(':', rec ->> 'course_id', rec ->> 'parent_id', rec ->> 'student_id')),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.audit_row();
create trigger audit_parent_students after insert or update or delete on public.parent_students for each row execute function public.audit_row();
create trigger audit_course_categories after insert or update or delete on public.course_categories for each row execute function public.audit_row();
create trigger audit_courses after insert or update or delete on public.courses for each row execute function public.audit_row();
create trigger audit_enrollments after insert or update or delete on public.enrollments for each row execute function public.audit_row();
create trigger audit_kpi_definitions after insert or update or delete on public.kpi_definitions for each row execute function public.audit_row();
create trigger audit_alerts after update on public.alerts for each row execute function public.audit_row();
create trigger audit_system_settings after insert or update or delete on public.system_settings for each row execute function public.audit_row();
