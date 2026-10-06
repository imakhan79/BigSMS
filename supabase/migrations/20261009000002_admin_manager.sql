-- Admin Manager: runs the student office.
--
-- Access:
--   Reads faculty, staff, student (and their parents') details and student fee records.
--   Manages student applications, student information and documents, fee invoices and
--   payment records, and course enrollment.
--   Compiles the list of students eligible for certificates. The workflow is fixed:
--   Prepared by Admin Manager -> Approved by Principal. Approval issues the certificates.
--
-- Super Admin and Admin keep every right they had; "student office" checks include them.
-- A Super Admin may prepare and approve lists (full system access); an Admin only reads them.

-- Role helpers ----------------------------------------------------------------
create or replace function public.is_admin_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() = 'admin_manager', false);
$$;

-- Super Admin, Admin or Admin Manager: may manage student records, fees and enrollment.
create or replace function public.manages_students()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() in ('super_admin', 'admin', 'admin_manager'), false);
$$;

-- Who may prepare certificate lists.
create or replace function public.prepares_certificates()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() in ('super_admin', 'admin_manager'), false);
$$;

create or replace function public.user_code_prefix(p_role public.user_role)
returns text language sql immutable set search_path = '' as $$
  select case p_role
    when 'super_admin' then 'SA'
    when 'admin' then 'ADM'
    when 'admin_manager' then 'AMG'
    when 'principal' then 'PRN'
    when 'professor' then 'FAC'
    when 'staff' then 'STF'
    when 'student' then 'STU'
    when 'parent' then 'PAR'
  end;
$$;

-- Profiles --------------------------------------------------------------------
-- Faculty, staff, students and parents (guardians) are visible to the Admin Manager.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select public.is_overseer())
  or ((select public.is_admin_manager()) and role in ('professor', 'staff', 'student', 'parent'))
  or ((select public.app_role()) = 'professor' and role = 'student')
  or ((select public.is_active()) and role in ('professor', 'principal'))
  or public.is_parent_of(id)
);

drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()) or ((select public.is_admin_manager()) and role = 'student'))
  with check (id = (select auth.uid()) or (select public.is_admin()) or ((select public.is_admin_manager()) and role = 'student'));

drop policy parent_students_select on public.parent_students;
create policy parent_students_select on public.parent_students for select to authenticated using (
  (select public.is_overseer())
  or (select public.manages_students())
  or (parent_id = (select auth.uid()) and (select public.is_active()))
);

-- Profile changes:
--   Super Admin: anything (but the last active Super Admin cannot step down).
--   Admin: manages non-administrator accounts only; cannot grant admin roles.
--   Admin Manager: a student's name, contact details and status (not offboarding).
--   Everyone else: own name and contact details only.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_managed text[] := array['role', 'status', 'email', 'user_code', 'onboarded_at', 'onboarded_by',
                            'offboarded_at', 'offboarded_by', 'offboard_reason'];
  v_changed boolean;
begin
  if old.role = 'super_admin' and old.status = 'active'
     and (new.role <> 'super_admin' or new.status <> 'active')
     and not exists (select 1 from public.profiles
                     where role = 'super_admin' and status = 'active' and id <> old.id) then
    raise exception 'At least one active Super Admin is required';
  end if;

  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  v_changed := (to_jsonb(new) - array['full_name', 'phone', 'department', 'updated_at'])
               is distinct from (to_jsonb(old) - array['full_name', 'phone', 'department', 'updated_at']);

  if public.is_admin() then
    if (old.role in ('admin', 'super_admin') or new.role in ('admin', 'super_admin')) and old.id <> auth.uid() then
      raise exception 'Only a Super Admin can manage administrator accounts';
    end if;
    if old.id = auth.uid() and v_changed then
      raise exception 'Administrators cannot change their own role, status or user ID';
    end if;
    if new.user_code is distinct from old.user_code then
      raise exception 'Only a Super Admin can change user IDs';
    end if;
    return new;
  end if;

  if public.is_admin_manager() and old.id <> auth.uid() then
    if old.role <> 'student' or new.role <> 'student' then
      raise exception 'Admin Managers manage student accounts only';
    end if;
    if new.status is distinct from old.status and 'offboarded' in (old.status, new.status) then
      raise exception 'Only an Admin can offboard or re-onboard a student';
    end if;
    if (to_jsonb(new) - array['full_name', 'phone', 'department', 'status', 'updated_at'])
       is distinct from (to_jsonb(old) - array['full_name', 'phone', 'department', 'status', 'updated_at']) then
      raise exception 'Admin Managers can change a student''s name, contact details and status only';
    end if;
    return new;
  end if;

  if v_changed then
    raise exception 'You can only change your name and contact details';
  end if;
  return new;
end;
$$;

-- Accounts created by an administrator are active immediately with a temporary password.
-- An Admin Manager may create student accounts only.
create or replace function public.admin_create_user(
  p_email text,
  p_full_name text,
  p_role public.user_role,
  p_password text,
  p_phone text default '',
  p_department text default ''
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if public.is_admin_manager() then
    if p_role <> 'student' then
      raise exception 'Admin Managers can create student accounts only';
    end if;
  elsif not public.is_admin() then
    raise exception 'Only administrators can create users';
  end if;
  if p_role in ('admin', 'super_admin') and not public.is_super_admin() then
    raise exception 'Only a Super Admin can create administrator accounts';
  end if;
  if nullif(trim(coalesce(p_full_name, '')), '') is null then
    raise exception 'Enter the person''s full name';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Temporary password must be at least 8 characters';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'A user with that email already exists';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', trim(p_full_name)), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', null, now(), now());

  update public.profiles
     set full_name = trim(p_full_name), role = p_role, status = 'active',
         phone = trim(coalesce(p_phone, '')), department = trim(coalesce(p_department, ''))
   where id = v_id;
  return v_id;
end;
$$;

-- Student information ---------------------------------------------------------
-- Personal and guardian details kept by the student office, one row per student.
create table public.student_records (
  student_id         uuid primary key references public.profiles (id) on delete cascade,
  date_of_birth      date,
  gender             text not null default '' check (gender in ('', 'female', 'male', 'other')),
  address            text not null default '',
  guardian_name      text not null default '',
  guardian_phone     text not null default '',
  guardian_relation  text not null default '',
  previous_school    text not null default '',
  program            text not null default '',
  admitted_on        date,
  updated_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index student_records_updated_by_idx on public.student_records (updated_by);
create trigger student_records_updated_at before update on public.student_records
  for each row execute function public.set_updated_at();

create or replace function public.guard_student_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
    raise exception 'A student record cannot move to another student';
  end if;
  if not exists (select 1 from public.profiles where id = new.student_id and role = 'student') then
    raise exception 'Student records can only be kept for students';
  end if;
  if new.date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger student_records_guard before insert or update on public.student_records
  for each row execute function public.guard_student_record();

alter table public.student_records enable row level security;
create policy student_records_select on public.student_records for select to authenticated using (
  (select public.manages_students())
  or (select public.is_overseer())
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);
create policy student_records_write on public.student_records for all to authenticated
  using ((select public.manages_students())) with check ((select public.manages_students()));

-- Student applications --------------------------------------------------------
create type public.application_status as enum ('submitted', 'under_review', 'accepted', 'rejected');

create table public.student_applications (
  id                 uuid primary key default gen_random_uuid(),
  application_no     text not null unique,
  full_name          text not null check (length(trim(full_name)) > 0),
  email              text not null,
  phone              text not null default '',
  date_of_birth      date,
  gender             text not null default '' check (gender in ('', 'female', 'male', 'other')),
  address            text not null default '',
  guardian_name      text not null default '',
  guardian_phone     text not null default '',
  guardian_relation  text not null default '',
  previous_school    text not null default '',
  program            text not null default '',
  statement          text not null default '',
  source             text not null default 'online' check (source in ('online', 'office')),
  status             public.application_status not null default 'submitted',
  decision_note      text,
  reviewed_by        uuid references public.profiles (id) on delete set null,
  reviewed_at        timestamptz,
  student_id         uuid references public.profiles (id) on delete set null,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- One open application per email address.
create unique index student_applications_open_email_idx on public.student_applications (lower(email))
  where status in ('submitted', 'under_review');
create index student_applications_status_idx on public.student_applications (status, created_at desc);
create index student_applications_reviewed_by_idx on public.student_applications (reviewed_by);
create index student_applications_student_idx on public.student_applications (student_id);
create index student_applications_created_by_idx on public.student_applications (created_by);
create trigger student_applications_updated_at before update on public.student_applications
  for each row execute function public.set_updated_at();

-- Numbers, source and review stamps are set here. Accepting happens only in accept_application()
-- (bigsms.review = on); a decided application is locked.
create or replace function public.guard_application()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.full_name := trim(new.full_name);
  new.email := lower(trim(new.email));
  if new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if new.date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;

  if tg_op = 'INSERT' then
    new.application_no := public.next_document_no('APP');
    new.source := case when public.manages_students() then 'office' else 'online' end;
    new.created_by := case when new.source = 'office' then auth.uid() end;
    new.status := 'submitted';
    new.decision_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.student_id := null;
    return new;
  end if;

  if coalesce(current_setting('bigsms.review', true), '') = 'on' then
    return new;
  end if;
  if new.application_no is distinct from old.application_no or new.source is distinct from old.source
     or new.created_by is distinct from old.created_by or new.student_id is distinct from old.student_id then
    raise exception 'Application number, source and linked student cannot be changed';
  end if;
  if old.status in ('accepted', 'rejected') then
    raise exception 'This application has already been decided';
  end if;
  if new.status = 'accepted' then
    raise exception 'Accept an application with Accept and create student';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'rejected' and nullif(trim(coalesce(new.decision_note, '')), '') is null then
      raise exception 'Give a reason when rejecting an application';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;
create trigger student_applications_guard before insert or update on public.student_applications
  for each row execute function public.guard_application();

create or replace function public.notify_application()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_manager uuid;
begin
  for v_manager in select id from public.profiles where role = 'admin_manager' and status = 'active' loop
    if v_manager is distinct from new.created_by then
      perform public.notify(v_manager, 'New student application', new.application_no || ': ' || new.full_name,
        '/manager/applications/' || new.id);
    end if;
  end loop;
  return new;
end;
$$;
create trigger student_applications_notify after insert on public.student_applications
  for each row execute function public.notify_application();

-- Online admission form. Open to anyone; field lengths are capped. Returns the application number.
create or replace function public.submit_application(
  p_full_name text,
  p_email text,
  p_phone text default '',
  p_date_of_birth date default null,
  p_gender text default '',
  p_address text default '',
  p_guardian_name text default '',
  p_guardian_phone text default '',
  p_guardian_relation text default '',
  p_previous_school text default '',
  p_program text default '',
  p_statement text default ''
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_no text;
begin
  if length(coalesce(p_full_name, '')) > 120 or length(coalesce(p_email, '')) > 200
     or length(coalesce(p_phone, '')) > 40 or length(coalesce(p_address, '')) > 500
     or length(coalesce(p_guardian_name, '')) > 120 or length(coalesce(p_guardian_phone, '')) > 40
     or length(coalesce(p_guardian_relation, '')) > 40 or length(coalesce(p_previous_school, '')) > 200
     or length(coalesce(p_program, '')) > 120 or length(coalesce(p_statement, '')) > 2000 then
    raise exception 'One of the answers is too long';
  end if;
  if nullif(trim(coalesce(p_full_name, '')), '') is null then
    raise exception 'Enter the applicant''s full name';
  end if;
  if exists (select 1 from public.student_applications
             where lower(email) = lower(trim(p_email)) and status in ('submitted', 'under_review')) then
    raise exception 'An application with this email is already being processed';
  end if;

  insert into public.student_applications (
    full_name, email, phone, date_of_birth, gender, address, guardian_name, guardian_phone,
    guardian_relation, previous_school, program, statement
  ) values (
    p_full_name, p_email, trim(coalesce(p_phone, '')), p_date_of_birth, coalesce(nullif(p_gender, ''), ''),
    trim(coalesce(p_address, '')), trim(coalesce(p_guardian_name, '')), trim(coalesce(p_guardian_phone, '')),
    trim(coalesce(p_guardian_relation, '')), trim(coalesce(p_previous_school, '')), trim(coalesce(p_program, '')),
    trim(coalesce(p_statement, ''))
  ) returning application_no into v_no;
  return v_no;
end;
$$;
revoke execute on function public.submit_application(text, text, text, date, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_application(text, text, text, date, text, text, text, text, text, text, text, text) to anon, authenticated;

-- Accept an application: creates the active student account, copies the details into the
-- student record and links it to the application. Returns the new student's id.
create or replace function public.accept_application(p_application_id uuid, p_password text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_app public.student_applications;
  v_student uuid;
begin
  if not public.manages_students() then
    raise exception 'Only the student office can accept applications';
  end if;
  select * into v_app from public.student_applications where id = p_application_id for update;
  if not found then
    raise exception 'Application not found';
  end if;
  if v_app.status not in ('submitted', 'under_review') then
    raise exception 'This application has already been decided';
  end if;

  v_student := public.admin_create_user(v_app.email, v_app.full_name, 'student', p_password, v_app.phone, v_app.program);
  insert into public.student_records (
    student_id, date_of_birth, gender, address, guardian_name, guardian_phone, guardian_relation,
    previous_school, program, admitted_on
  ) values (
    v_student, v_app.date_of_birth, v_app.gender, v_app.address, v_app.guardian_name, v_app.guardian_phone,
    v_app.guardian_relation, v_app.previous_school, v_app.program, current_date
  );

  perform set_config('bigsms.review', 'on', true);
  update public.student_applications
     set status = 'accepted', student_id = v_student, reviewed_by = auth.uid(), reviewed_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = v_app.id;
  perform set_config('bigsms.review', 'off', true);
  return v_student;
end;
$$;
revoke execute on function public.accept_application(uuid, text, text) from public, anon;
grant execute on function public.accept_application(uuid, text, text) to authenticated;

alter table public.student_applications enable row level security;
create policy student_applications_select on public.student_applications for select to authenticated
  using ((select public.manages_students()));
create policy student_applications_insert on public.student_applications for insert to authenticated
  with check ((select public.manages_students()));
create policy student_applications_update on public.student_applications for update to authenticated
  using ((select public.manages_students())) with check ((select public.manages_students()));

-- Student documents -------------------------------------------------------------
-- Files live in the private student-documents bucket at <student_id>/<file>.
create table public.student_documents (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  doc_type     text not null check (doc_type in ('birth_certificate', 'national_id', 'photo', 'academic_transcript',
                                                 'transfer_certificate', 'medical_record', 'other')),
  title        text not null check (length(trim(title)) > 0),
  file_path    text not null unique,
  file_name    text not null,
  file_size    bigint,
  mime_type    text not null default '',
  status       text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  note         text not null default '',
  uploaded_by  uuid references public.profiles (id) on delete set null,
  verified_by  uuid references public.profiles (id) on delete set null,
  verified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index student_documents_student_idx on public.student_documents (student_id, created_at desc);
create index student_documents_uploaded_by_idx on public.student_documents (uploaded_by);
create index student_documents_verified_by_idx on public.student_documents (verified_by);
create trigger student_documents_updated_at before update on public.student_documents
  for each row execute function public.set_updated_at();

create or replace function public.guard_student_document()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles where id = new.student_id and role = 'student') then
      raise exception 'Documents can only be filed for students';
    end if;
    if split_part(new.file_path, '/', 1) <> new.student_id::text then
      raise exception 'The file must be stored in the student''s folder';
    end if;
    new.title := trim(new.title);
    new.status := 'pending';
    new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
    new.verified_by := null;
    new.verified_at := null;
    return new;
  end if;

  if new.student_id is distinct from old.student_id or new.file_path is distinct from old.file_path
     or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'Upload a new document instead of moving this one';
  end if;
  new.title := trim(new.title);
  new.note := trim(new.note);
  if new.status is distinct from old.status then
    if new.status = 'rejected' and new.note = '' then
      raise exception 'Say why the document was rejected';
    end if;
    new.verified_by := case when new.status = 'pending' then null else auth.uid() end;
    new.verified_at := case when new.status = 'pending' then null else now() end;
  end if;
  return new;
end;
$$;
create trigger student_documents_guard before insert or update on public.student_documents
  for each row execute function public.guard_student_document();

alter table public.student_documents enable row level security;
create policy student_documents_select on public.student_documents for select to authenticated using (
  (select public.manages_students())
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);
create policy student_documents_write on public.student_documents for all to authenticated
  using ((select public.manages_students())) with check ((select public.manages_students()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-documents', 'student-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy student_documents_read on storage.objects for select to authenticated using (
  bucket_id = 'student-documents' and (
    (select public.manages_students())
    or ((storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_active()))
    or public.is_parent_of(public.try_uuid((storage.foldername(name))[1]))
  )
);
create policy student_documents_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'student-documents' and (select public.manages_students())
);
create policy student_documents_modify on storage.objects for update to authenticated using (
  bucket_id = 'student-documents' and (select public.manages_students())
);
create policy student_documents_remove on storage.objects for delete to authenticated using (
  bucket_id = 'student-documents' and (select public.manages_students())
);

-- Fees: the student office keeps invoices and payment records ---------------------
-- Reversing a payment stays with the Super Admin.
drop policy invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated using (
  (select public.manages_students())
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);
drop policy invoices_insert on public.invoices;
create policy invoices_insert on public.invoices for insert to authenticated with check ((select public.manages_students()));
drop policy invoices_update on public.invoices;
create policy invoices_update on public.invoices for update to authenticated
  using ((select public.manages_students())) with check ((select public.manages_students()));

drop policy payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using (
  (select public.manages_students())
  or (public.invoice_student(invoice_id) = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(public.invoice_student(invoice_id))
);
drop policy payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated with check ((select public.manages_students()));

-- Course enrollment ---------------------------------------------------------------
-- The Admin Manager sees the course list (not course content) so they can enrol students.
drop policy courses_select on public.courses;
create policy courses_select on public.courses for select to authenticated
  using (public.can_view_course(id) or (select public.is_admin_manager()));

drop policy enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments for select to authenticated using (
  (select public.is_overseer())
  or (select public.manages_students())
  or public.is_professor_of(course_id)
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);
drop policy enrollments_insert on public.enrollments;
create policy enrollments_insert on public.enrollments for insert to authenticated with check (
  ((select public.manages_students()) or public.is_professor_of(course_id))
  and exists (select 1 from public.profiles p where p.id = student_id and p.role = 'student')
);
drop policy enrollments_delete on public.enrollments;
create policy enrollments_delete on public.enrollments for delete to authenticated using (
  (select public.manages_students()) or public.is_professor_of(course_id)
);

drop policy certificates_select on public.certificates;
create policy certificates_select on public.certificates for select to authenticated using (
  (select public.is_overseer())
  or (select public.manages_students())
  or public.is_professor_of(course_id)
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);

-- Certificate eligibility -----------------------------------------------------------
-- Completion, attendance and unpaid fees for one student, optionally within one course.
create or replace function public.student_eligibility(p_student_id uuid, p_course_id uuid)
returns table (completion_rate numeric, attendance_rate numeric, outstanding_fees numeric)
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
       join public.attendance_sessions s on s.id = r.session_id
      where r.student_id = p_student_id and (p_course_id is null or s.course_id = p_course_id)),
    (select coalesce(sum(i.amount - i.amount_paid), 0)
       from public.invoices i
      where i.student_id = p_student_id and i.status in ('unpaid', 'partial'));
$$;
revoke execute on function public.student_eligibility(uuid, uuid) from public, anon, authenticated;

-- Certificate lists: Prepared by Admin Manager -> Approved by Principal -------------
create type public.certificate_list_status as enum ('draft', 'submitted', 'approved', 'rejected');

create table public.certificate_lists (
  id            uuid primary key default gen_random_uuid(),
  list_no       text not null unique,
  title         text not null check (length(trim(title)) > 0),
  course_id     uuid references public.courses (id) on delete set null,
  kind          text not null default 'completion' check (kind in ('completion', 'achievement', 'participation', 'merit')),
  criteria      text not null default '',
  status        public.certificate_list_status not null default 'draft',
  prepared_by   uuid references public.profiles (id) on delete set null,
  submitted_at  timestamptz,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index certificate_lists_status_idx on public.certificate_lists (status, updated_at desc);
create index certificate_lists_course_idx on public.certificate_lists (course_id);
create index certificate_lists_prepared_by_idx on public.certificate_lists (prepared_by);
create index certificate_lists_reviewed_by_idx on public.certificate_lists (reviewed_by);
create trigger certificate_lists_updated_at before update on public.certificate_lists
  for each row execute function public.set_updated_at();

create table public.certificate_list_entries (
  list_id           uuid not null references public.certificate_lists (id) on delete cascade,
  student_id        uuid not null references public.profiles (id) on delete restrict,
  completion_rate   numeric(5, 1),
  attendance_rate   numeric(5, 1),
  outstanding_fees  numeric(12, 2),
  note              text not null default '',
  certificate_id    uuid references public.certificates (id) on delete set null,
  added_by          uuid references public.profiles (id) on delete set null,
  added_at          timestamptz not null default now(),
  primary key (list_id, student_id)
);
create index certificate_list_entries_student_idx on public.certificate_list_entries (student_id);
create index certificate_list_entries_certificate_idx on public.certificate_list_entries (certificate_id);
create index certificate_list_entries_added_by_idx on public.certificate_list_entries (added_by);

alter table public.certificates add column list_id uuid references public.certificate_lists (id) on delete set null;
create index certificates_list_idx on public.certificates (list_id);

-- Status, numbering and review fields change only inside the functions below (bigsms.review = on).
-- The preparer may edit a draft or a rejected list; submitted and approved lists are locked.
create or replace function public.guard_certificate_list()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.list_no := public.next_document_no('CL');
    new.status := 'draft';
    new.prepared_by := coalesce(auth.uid(), new.prepared_by);
    new.submitted_at := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;
  if coalesce(current_setting('bigsms.review', true), '') = 'on' then
    return new;
  end if;
  if old.status not in ('draft', 'rejected') then
    raise exception 'A list that has been submitted or approved cannot be edited';
  end if;
  if (to_jsonb(new) - array['title', 'course_id', 'kind', 'criteria', 'updated_at'])
     is distinct from (to_jsonb(old) - array['title', 'course_id', 'kind', 'criteria', 'updated_at']) then
    raise exception 'Lists are submitted and approved through the certificate workflow';
  end if;
  if new.course_id is distinct from old.course_id and exists (select 1 from public.certificate_list_entries where list_id = old.id) then
    raise exception 'Remove the students from the list before changing its course';
  end if;
  return new;
end;
$$;
create trigger certificate_lists_guard before insert or update on public.certificate_lists
  for each row execute function public.guard_certificate_list();

-- Students can be added while the list is a draft or rejected. Eligibility figures are
-- computed here, never taken from the caller, and refreshed on submission.
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
  new.completion_rate := v_elig.completion_rate;
  new.attendance_rate := v_elig.attendance_rate;
  new.outstanding_fees := v_elig.outstanding_fees;
  new.note := trim(new.note);
  new.certificate_id := null;
  new.added_by := coalesce(auth.uid(), new.added_by);
  new.added_at := now();
  return new;
end;
$$;
create trigger certificate_list_entries_guard before insert or update or delete on public.certificate_list_entries
  for each row execute function public.guard_certificate_entry();

-- Students enrolled in a course with the figures used to judge eligibility.
create or replace function public.certificate_candidates(p_course_id uuid)
returns table (student_id uuid, full_name text, user_code text, completion_rate numeric, quiz_avg numeric,
               assignment_avg numeric, attendance_rate numeric, outstanding_fees numeric, has_certificate boolean)
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
           el.attendance_rate, el.outstanding_fees,
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

-- Send a draft (or a rejected list, after changes) to the Principal.
create or replace function public.submit_certificate_list(p_list_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_list public.certificate_lists;
  v_principal uuid;
  v_count integer;
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

  perform set_config('bigsms.review', 'on', true);
  update public.certificate_list_entries e
     set (completion_rate, attendance_rate, outstanding_fees) =
         (select el.completion_rate, el.attendance_rate, el.outstanding_fees
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
revoke execute on function public.submit_certificate_list(uuid) from public, anon;
grant execute on function public.submit_certificate_list(uuid) to authenticated;

-- Take a submitted list back to draft before the Principal decides.
create or replace function public.withdraw_certificate_list(p_list_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.prepares_certificates() then
    raise exception 'Certificate lists are prepared by the Admin Manager';
  end if;
  perform set_config('bigsms.review', 'on', true);
  update public.certificate_lists set status = 'draft', submitted_at = null
   where id = p_list_id and status = 'submitted';
  if not found then
    raise exception 'Only a list awaiting approval can be withdrawn';
  end if;
  perform set_config('bigsms.review', 'off', true);
end;
$$;
revoke execute on function public.withdraw_certificate_list(uuid) from public, anon;
grant execute on function public.withdraw_certificate_list(uuid) to authenticated;

-- Principal (or Super Admin) approves or rejects a submitted list. Approving issues one
-- certificate per student. Returns 'approved' or 'rejected'.
create or replace function public.review_certificate_list(p_list_id uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.app_role();
  v_list public.certificate_lists;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_title text;
  v_entry record;
  v_cert uuid;
begin
  if v_role is null or v_role not in ('principal', 'super_admin') then
    raise exception 'Certificate lists are approved by the Principal';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Unknown decision %', p_decision;
  end if;
  select * into v_list from public.certificate_lists where id = p_list_id for update;
  if not found then
    raise exception 'List not found';
  end if;
  if v_list.status <> 'submitted' then
    raise exception 'This list is not awaiting approval';
  end if;
  if v_list.prepared_by = auth.uid() then
    raise exception 'A list cannot be approved by the person who prepared it';
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'Give a reason when rejecting a list';
  end if;

  perform set_config('bigsms.review', 'on', true);
  if p_decision = 'reject' then
    update public.certificate_lists
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
     where id = v_list.id;
  else
    v_title := coalesce((select title from public.courses where id = v_list.course_id), v_list.title);
    for v_entry in select student_id from public.certificate_list_entries where list_id = v_list.id loop
      insert into public.certificates (student_id, course_id, kind, title, description, issued_on, issued_by, list_id)
      values (v_entry.student_id, v_list.course_id, v_list.kind, v_title, v_list.criteria, current_date, auth.uid(), v_list.id)
      returning id into v_cert;
      update public.certificate_list_entries set certificate_id = v_cert
       where list_id = v_list.id and student_id = v_entry.student_id;
    end loop;
    update public.certificate_lists
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
     where id = v_list.id;
  end if;
  perform set_config('bigsms.review', 'off', true);

  if v_list.prepared_by is not null then
    perform public.notify(v_list.prepared_by,
      case when p_decision = 'reject' then 'Certificate list rejected' else 'Certificate list approved' end,
      v_list.title || case when p_decision = 'reject' then ': ' || v_note else '. Certificates have been issued.' end,
      '/manager/certificates/' || v_list.id);
  end if;
  return case when p_decision = 'reject' then 'rejected' else 'approved' end;
end;
$$;
revoke execute on function public.review_certificate_list(uuid, text, text) from public, anon;
grant execute on function public.review_certificate_list(uuid, text, text) to authenticated;

alter table public.certificate_lists enable row level security;
create policy certificate_lists_select on public.certificate_lists for select to authenticated
  using ((select public.manages_students()) or (select public.is_overseer()));
create policy certificate_lists_insert on public.certificate_lists for insert to authenticated
  with check ((select public.prepares_certificates()));
create policy certificate_lists_update on public.certificate_lists for update to authenticated
  using ((select public.prepares_certificates())) with check ((select public.prepares_certificates()));
create policy certificate_lists_delete on public.certificate_lists for delete to authenticated
  using ((select public.prepares_certificates()) and status in ('draft', 'rejected'));

alter table public.certificate_list_entries enable row level security;
create policy certificate_list_entries_select on public.certificate_list_entries for select to authenticated
  using ((select public.manages_students()) or (select public.is_overseer()));
create policy certificate_list_entries_write on public.certificate_list_entries for all to authenticated
  using ((select public.prepares_certificates())) with check ((select public.prepares_certificates()));

-- Audit -------------------------------------------------------------------------
create trigger audit_student_records after insert or update or delete on public.student_records
  for each row execute function public.audit_row();
create trigger audit_student_applications after insert or update on public.student_applications
  for each row execute function public.audit_row();
create trigger audit_student_documents after insert or update or delete on public.student_documents
  for each row execute function public.audit_row();
create trigger audit_certificate_lists after insert or update or delete on public.certificate_lists
  for each row execute function public.audit_row();
create trigger audit_certificate_list_entries after insert or delete on public.certificate_list_entries
  for each row execute function public.audit_row();
