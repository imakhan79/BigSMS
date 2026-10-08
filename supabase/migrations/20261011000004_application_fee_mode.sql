-- Student applications carry the fee payment mode, chosen by the Admin Manager
-- (no Principal approval):
--   fee plan        Full, Partial or Installment
--   payment method  Cash, IBFT (stored as bank_transfer) or Cheque
-- Applicants on the public form cannot set either. Accepting an application requires both and
-- copies them onto the student record. New payments are recorded as Cash, IBFT or Cheque only.

create type public.fee_plan as enum ('full', 'partial', 'installment');

alter table public.student_applications
  add column fee_plan public.fee_plan,
  add column payment_method public.payment_method
    check (payment_method in ('cash', 'bank_transfer', 'cheque'));

alter table public.student_records
  add column fee_plan public.fee_plan,
  add column payment_method public.payment_method
    check (payment_method in ('cash', 'bank_transfer', 'cheque'));

-- Older payments may use other methods; the rule applies to new ones.
alter table public.payments
  add constraint payments_method_allowed check (method in ('cash', 'bank_transfer', 'cheque')) not valid;

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
  -- The fee payment mode is the student office's decision, never the applicant's.
  if not public.manages_students() and coalesce(current_setting('bigsms.review', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.fee_plan := null;
      new.payment_method := null;
    else
      new.fee_plan := old.fee_plan;
      new.payment_method := old.payment_method;
    end if;
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
  if v_app.fee_plan is null or v_app.payment_method is null then
    raise exception 'Choose the fee plan and payment method before accepting';
  end if;

  v_student := public.admin_create_user(v_app.email, v_app.full_name, 'student', p_password, v_app.phone, v_app.program);
  insert into public.student_records (
    student_id, date_of_birth, gender, address, guardian_name, guardian_phone, guardian_relation,
    previous_school, program, admitted_on, fee_plan, payment_method
  ) values (
    v_student, v_app.date_of_birth, v_app.gender, v_app.address, v_app.guardian_name, v_app.guardian_phone,
    v_app.guardian_relation, v_app.previous_school, v_app.program, current_date, v_app.fee_plan, v_app.payment_method
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
