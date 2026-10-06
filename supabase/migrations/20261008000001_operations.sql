-- Operations modules: timetable, attendance, finance (invoices and payments) and certificates.
-- Certificates are issued by approving a list the Admin Manager prepares (next migration).
--
-- Access summary:
--   Super Admin / Admin  manage everything here (only a Super Admin can reverse a payment).
--   Principal            reads timetable, attendance and certificates.
--   Professor            reads their timetable; takes attendance for their courses.
--   Student / Parent     read their own (their child's) timetable, attendance, fees and issued certificates.

-- Shared numbering ----------------------------------------------------------------
-- One counter per prefix, e.g. INV-2026 -> INV-2026-00001.
create table public.document_counters (
  prefix      text primary key,
  last_value  integer not null default 0
);
alter table public.document_counters enable row level security;

create or replace function public.next_document_no(p_prefix text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text := p_prefix || '-' || to_char(now(), 'YYYY');
  v_n integer;
begin
  insert into public.document_counters as c (prefix, last_value) values (v_prefix, 1)
  on conflict (prefix) do update set last_value = c.last_value + 1
  returning last_value into v_n;
  return v_prefix || '-' || lpad(v_n::text, 5, '0');
end;
$$;
revoke execute on function public.next_document_no(text) from public, anon, authenticated;

-- Timetable -----------------------------------------------------------------------
create table public.timetable_slots (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7), -- ISO weekday, 1 = Monday
  starts_at   time not null,
  ends_at     time not null,
  room        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index timetable_slots_course_idx on public.timetable_slots (course_id);
create index timetable_slots_weekday_idx on public.timetable_slots (weekday, starts_at);
create trigger timetable_slots_updated_at before update on public.timetable_slots
  for each row execute function public.set_updated_at();

-- A room, or a professor, can only be in one place at a time. Archived courses don't count.
create or replace function public.guard_timetable_slot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_clash record;
begin
  new.room := trim(new.room);
  select c.title, s.room, (c.professor_id = me.professor_id) as same_professor into v_clash
    from public.timetable_slots s
    join public.courses c on c.id = s.course_id
    join public.courses me on me.id = new.course_id
   where s.id <> new.id
     and s.weekday = new.weekday
     and s.starts_at < new.ends_at and s.ends_at > new.starts_at
     and c.status <> 'archived'
     and ((new.room <> '' and lower(s.room) = lower(new.room)) or c.professor_id = me.professor_id)
   limit 1;
  if found then
    if v_clash.same_professor then
      raise exception 'The professor already teaches % at that time', v_clash.title;
    end if;
    raise exception 'Room % is already booked for % at that time', v_clash.room, v_clash.title;
  end if;
  return new;
end;
$$;
create trigger timetable_slots_guard before insert or update on public.timetable_slots
  for each row execute function public.guard_timetable_slot();

alter table public.timetable_slots enable row level security;
create policy timetable_select on public.timetable_slots for select to authenticated
  using ((select public.is_overseer()) or public.can_view_course(course_id));
create policy timetable_admin on public.timetable_slots for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Attendance ----------------------------------------------------------------------
create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');

create table public.attendance_sessions (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  held_on     date not null default current_date,
  topic       text not null default '',
  taken_by    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index attendance_sessions_course_idx on public.attendance_sessions (course_id, held_on desc);
create index attendance_sessions_taken_by_idx on public.attendance_sessions (taken_by);
create trigger attendance_sessions_updated_at before update on public.attendance_sessions
  for each row execute function public.set_updated_at();

create table public.attendance_records (
  session_id  uuid not null references public.attendance_sessions (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  status      public.attendance_status not null,
  note        text not null default '',
  marked_by   uuid references public.profiles (id) on delete set null,
  marked_at   timestamptz not null default now(),
  primary key (session_id, student_id)
);
create index attendance_records_student_idx on public.attendance_records (student_id);
create index attendance_records_marked_by_idx on public.attendance_records (marked_by);

create or replace function public.attendance_course(p_session_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select course_id from public.attendance_sessions where id = p_session_id;
$$;

create or replace function public.guard_attendance_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.taken_by := coalesce(auth.uid(), new.taken_by);
  elsif new.course_id is distinct from old.course_id then
    raise exception 'An attendance session cannot move to another course';
  end if;
  if new.held_on > current_date then
    raise exception 'Attendance cannot be taken for a future date';
  end if;
  return new;
end;
$$;
create trigger attendance_sessions_guard before insert or update on public.attendance_sessions
  for each row execute function public.guard_attendance_session();

-- Only students enrolled in the session's course can be marked.
create or replace function public.guard_attendance_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.session_id is distinct from old.session_id or new.student_id is distinct from old.student_id) then
    raise exception 'Mark a different student with a new record';
  end if;
  if not exists (
    select 1 from public.enrollments
     where course_id = public.attendance_course(new.session_id) and student_id = new.student_id
  ) then
    raise exception 'That student is not enrolled in this course';
  end if;
  new.note := trim(new.note);
  new.marked_by := coalesce(auth.uid(), new.marked_by);
  new.marked_at := now();
  return new;
end;
$$;
create trigger attendance_records_guard before insert or update on public.attendance_records
  for each row execute function public.guard_attendance_record();

-- Students and their parents hear about absences.
create or replace function public.notify_absence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
  v_held date;
  v_parent uuid;
begin
  if new.status <> 'absent' or (tg_op = 'UPDATE' and old.status = 'absent') then
    return new;
  end if;
  select c.title, s.held_on into v_title, v_held
    from public.attendance_sessions s join public.courses c on c.id = s.course_id
   where s.id = new.session_id;
  perform public.notify(new.student_id, 'Marked absent', v_title || ' on ' || to_char(v_held, 'DD Mon YYYY'), '/student/attendance');
  for v_parent in select parent_id from public.parent_students where student_id = new.student_id loop
    perform public.notify(v_parent, 'Your child was marked absent',
      (select full_name from public.profiles where id = new.student_id) || ': ' || v_title || ' on ' || to_char(v_held, 'DD Mon YYYY'),
      '/parent/children/' || new.student_id || '?tab=attendance');
  end loop;
  return new;
end;
$$;
create trigger attendance_records_notify after insert or update on public.attendance_records
  for each row execute function public.notify_absence();

alter table public.attendance_sessions enable row level security;
create policy attendance_sessions_select on public.attendance_sessions for select to authenticated using (
  (select public.is_overseer()) or public.is_professor_of(course_id)
  or public.is_enrolled(course_id) or public.parent_sees_course(course_id)
);
create policy attendance_sessions_write on public.attendance_sessions for all to authenticated
  using ((select public.is_admin()) or public.is_professor_of(course_id))
  with check ((select public.is_admin()) or public.is_professor_of(course_id));

alter table public.attendance_records enable row level security;
create policy attendance_records_select on public.attendance_records for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(public.attendance_course(session_id))
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);
create policy attendance_records_write on public.attendance_records for all to authenticated
  using ((select public.is_admin()) or public.is_professor_of(public.attendance_course(session_id)))
  with check ((select public.is_admin()) or public.is_professor_of(public.attendance_course(session_id)));

-- Per-course attendance for one student. Runs with the caller's rights, so RLS applies.
-- Late counts as attended; excused sessions are left out of the rate.
create or replace function public.student_attendance(p_student_id uuid)
returns table (course_id uuid, title text, sessions bigint, present bigint, late bigint, absent bigint, excused bigint, rate numeric)
language sql stable set search_path = '' as $$
  select c.id, c.title,
         count(r.session_id),
         count(*) filter (where r.status = 'present'),
         count(*) filter (where r.status = 'late'),
         count(*) filter (where r.status = 'absent'),
         count(*) filter (where r.status = 'excused'),
         round(100.0 * count(*) filter (where r.status in ('present', 'late'))
               / nullif(count(*) filter (where r.status <> 'excused'), 0), 1)
    from public.attendance_records r
    join public.attendance_sessions s on s.id = r.session_id
    join public.courses c on c.id = s.course_id
   where r.student_id = p_student_id
   group by c.id, c.title
   order by c.title;
$$;

-- Attendance by course (sessions held, students marked, attendance rate). RLS applies.
create or replace function public.course_attendance()
returns table (course_id uuid, title text, professor_name text, sessions bigint, last_held date, marked bigint, rate numeric)
language sql stable set search_path = '' as $$
  select c.id, c.title, p.full_name,
         count(distinct s.id), max(s.held_on), count(r.student_id),
         round(100.0 * count(*) filter (where r.status in ('present', 'late'))
               / nullif(count(*) filter (where r.status <> 'excused'), 0), 1)
    from public.courses c
    join public.profiles p on p.id = c.professor_id
    left join public.attendance_sessions s on s.course_id = c.id
    left join public.attendance_records r on r.session_id = s.id
   where c.status = 'published'
   group by c.id, c.title, p.full_name
   order by c.title;
$$;

-- Finance -------------------------------------------------------------------------
create type public.invoice_status as enum ('unpaid', 'partial', 'paid', 'cancelled');
create type public.payment_method as enum ('cash', 'bank_transfer', 'card', 'cheque', 'online');

create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  invoice_no        text not null unique,
  student_id        uuid not null references public.profiles (id) on delete restrict,
  title             text not null check (length(trim(title)) > 0),
  description       text not null default '',
  amount            numeric(12, 2) not null check (amount > 0),
  amount_paid       numeric(12, 2) not null default 0,
  due_on            date not null,
  status            public.invoice_status not null default 'unpaid',
  issued_by         uuid references public.profiles (id) on delete set null,
  cancelled_reason  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index invoices_student_idx on public.invoices (student_id);
create index invoices_issued_by_idx on public.invoices (issued_by);
create index invoices_open_idx on public.invoices (due_on) where status in ('unpaid', 'partial');
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  receipt_no   text not null unique,
  invoice_id   uuid not null references public.invoices (id) on delete restrict,
  amount       numeric(12, 2) not null check (amount > 0),
  paid_on      date not null default current_date,
  method       public.payment_method not null,
  reference    text not null default '',
  received_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_received_by_idx on public.payments (received_by);

create or replace function public.invoice_student(p_invoice_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select student_id from public.invoices where id = p_invoice_id;
$$;

-- Invoice numbers, paid amounts and status are maintained here, never by the caller.
-- amount_paid only changes through payments (bigsms.finance = on).
create or replace function public.guard_invoice()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles where id = new.student_id and role = 'student') then
      raise exception 'Invoices can only be issued to students';
    end if;
    new.invoice_no := public.next_document_no('INV');
    new.amount_paid := 0;
    new.status := 'unpaid';
    new.cancelled_reason := null;
    new.issued_by := coalesce(auth.uid(), new.issued_by);
    return new;
  end if;

  if new.invoice_no is distinct from old.invoice_no or new.student_id is distinct from old.student_id
     or new.issued_by is distinct from old.issued_by then
    raise exception 'Invoice number, student and issuer cannot be changed';
  end if;
  if new.amount_paid is distinct from old.amount_paid and coalesce(current_setting('bigsms.finance', true), '') <> 'on' then
    raise exception 'Paid amounts change only by recording or reversing payments';
  end if;

  if old.status = 'cancelled' then
    if new.status <> 'cancelled' or new.amount is distinct from old.amount then
      raise exception 'A cancelled invoice cannot be changed';
    end if;
    return new;
  end if;
  if new.status = 'cancelled' then
    if old.amount_paid > 0 then
      raise exception 'Reverse the payments on this invoice before cancelling it';
    end if;
    if nullif(trim(coalesce(new.cancelled_reason, '')), '') is null then
      raise exception 'Give a reason for cancelling the invoice';
    end if;
    return new;
  end if;
  if new.amount < new.amount_paid then
    raise exception 'The amount cannot be less than what has already been paid';
  end if;
  new.cancelled_reason := null;
  new.status := case
    when new.amount_paid >= new.amount then 'paid'
    when new.amount_paid > 0 then 'partial'
    else 'unpaid' end;
  return new;
end;
$$;
create trigger invoices_guard before insert or update on public.invoices
  for each row execute function public.guard_invoice();

create or replace function public.guard_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where id = new.invoice_id for update;
  if v_invoice.status = 'cancelled' then
    raise exception 'This invoice is cancelled';
  end if;
  if new.amount > v_invoice.amount - v_invoice.amount_paid then
    raise exception 'Payment is more than the % outstanding', to_char(v_invoice.amount - v_invoice.amount_paid, 'FM999,999,990.00');
  end if;
  if new.paid_on > current_date then
    raise exception 'Payment date cannot be in the future';
  end if;
  new.receipt_no := public.next_document_no('RCP');
  new.reference := trim(new.reference);
  new.received_by := coalesce(auth.uid(), new.received_by);
  return new;
end;
$$;
create trigger payments_guard before insert on public.payments
  for each row execute function public.guard_payment();

create or replace function public.sync_invoice_paid()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  perform set_config('bigsms.finance', 'on', true);
  update public.invoices
     set amount_paid = (select coalesce(sum(amount), 0) from public.payments where invoice_id = v_invoice)
   where id = v_invoice;
  perform set_config('bigsms.finance', 'off', true);
  return null;
end;
$$;
create trigger payments_sync after insert or delete on public.payments
  for each row execute function public.sync_invoice_paid();

create or replace function public.notify_finance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid;
  v_title text;
  v_body text;
  v_parent uuid;
begin
  if tg_table_name = 'invoices' then
    v_student := new.student_id;
    v_title := 'New fee invoice';
    v_body := new.invoice_no || ': ' || new.title || ', due ' || to_char(new.due_on, 'DD Mon YYYY');
  else
    select student_id, 'Payment received', new.receipt_no || ' for ' || invoice_no
      into v_student, v_title, v_body
      from public.invoices where id = new.invoice_id;
  end if;
  perform public.notify(v_student, v_title, v_body, '/student/fees');
  for v_parent in select parent_id from public.parent_students where student_id = v_student loop
    perform public.notify(v_parent, v_title, v_body, '/parent/children/' || v_student || '?tab=fees');
  end loop;
  return new;
end;
$$;
create trigger invoices_notify after insert on public.invoices
  for each row execute function public.notify_finance();
create trigger payments_notify after insert on public.payments
  for each row execute function public.notify_finance();

alter table public.invoices enable row level security;
create policy invoices_select on public.invoices for select to authenticated using (
  (select public.is_admin())
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);
create policy invoices_insert on public.invoices for insert to authenticated with check ((select public.is_admin()));
create policy invoices_update on public.invoices for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.payments enable row level security;
create policy payments_select on public.payments for select to authenticated using (
  (select public.is_admin())
  or (public.invoice_student(invoice_id) = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(public.invoice_student(invoice_id))
);
create policy payments_insert on public.payments for insert to authenticated with check ((select public.is_admin()));
-- Payments are never edited; a Super Admin may reverse (delete) one, which is audited.
create policy payments_delete on public.payments for delete to authenticated using ((select public.is_super_admin()));

-- Certificates --------------------------------------------------------------------
-- A certificate is the issued record. It is never requested one by one: the Admin Manager
-- compiles a list of eligible students and the Principal approves it (see the admin manager
-- migration), which issues one certificate per student. Rows are written only inside those
-- functions and revoke_certificate() (bigsms.review = on), or by the service role.
create type public.certificate_status as enum ('issued', 'revoked');

create table public.certificates (
  id              uuid primary key default gen_random_uuid(),
  certificate_no  text not null unique,  -- also the public verification code
  student_id      uuid not null references public.profiles (id) on delete restrict,
  course_id       uuid references public.courses (id) on delete set null,
  kind            text not null default 'completion' check (kind in ('completion', 'achievement', 'participation', 'merit')),
  title           text not null check (length(trim(title)) > 0),
  description     text not null default '',
  status          public.certificate_status not null default 'issued',
  issued_on       date not null default current_date,
  issued_by       uuid references public.profiles (id) on delete set null,
  revoked_at      timestamptz,
  revoked_by      uuid references public.profiles (id) on delete set null,
  revoke_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index certificates_student_idx on public.certificates (student_id);
create index certificates_course_idx on public.certificates (course_id);
create index certificates_issued_by_idx on public.certificates (issued_by);
create index certificates_revoked_by_idx on public.certificates (revoked_by);
create trigger certificates_updated_at before update on public.certificates
  for each row execute function public.set_updated_at();

create or replace function public.guard_certificate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and coalesce(current_setting('bigsms.review', true), '') <> 'on' then
    raise exception 'Certificates are issued by approving a certificate list';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles where id = new.student_id and role = 'student') then
      raise exception 'Certificates can only be issued to students';
    end if;
    new.certificate_no := coalesce(new.certificate_no, public.next_document_no('CERT'));
    new.status := 'issued';
    new.revoked_at := null;
    new.revoked_by := null;
    new.revoke_reason := null;
  end if;
  return new;
end;
$$;
create trigger certificates_guard before insert or update on public.certificates
  for each row execute function public.guard_certificate();

create or replace function public.notify_certificate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid;
  v_body text := new.title || ' (' || new.certificate_no || ')';
begin
  perform public.notify(new.student_id, 'Certificate issued', v_body, '/certificate/' || new.id);
  for v_parent in select parent_id from public.parent_students where student_id = new.student_id loop
    perform public.notify(v_parent, 'Certificate issued to your child', v_body, '/certificate/' || new.id);
  end loop;
  return new;
end;
$$;
create trigger certificates_notify after insert on public.certificates
  for each row execute function public.notify_certificate();

-- Withdraw an issued certificate (administrators). It stays on record and verification shows it as revoked.
create or replace function public.revoke_certificate(p_certificate_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only administrators can revoke certificates';
  end if;
  if v_reason is null then
    raise exception 'Give a reason for revoking the certificate';
  end if;
  perform set_config('bigsms.review', 'on', true);
  update public.certificates
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = v_reason
   where id = p_certificate_id and status = 'issued';
  if not found then
    raise exception 'Only an issued certificate can be revoked';
  end if;
  perform set_config('bigsms.review', 'off', true);
end;
$$;
revoke execute on function public.revoke_certificate(uuid, text) from public, anon;
grant execute on function public.revoke_certificate(uuid, text) to authenticated;

-- Public check of a certificate number; reveals only what is printed on the certificate.
create or replace function public.verify_certificate(p_certificate_no text)
returns table (certificate_no text, student_name text, title text, kind text, course_title text,
               issued_on date, status public.certificate_status, revoked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.certificate_no, p.full_name, c.title, c.kind, co.title, c.issued_on, c.status, c.revoked_at
    from public.certificates c
    join public.profiles p on p.id = c.student_id
    left join public.courses co on co.id = c.course_id
   where c.certificate_no = upper(trim(p_certificate_no));
$$;
revoke execute on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

-- No insert, update or delete policies: every change goes through the functions above.
alter table public.certificates enable row level security;
create policy certificates_select on public.certificates for select to authenticated using (
  (select public.is_overseer())
  or public.is_professor_of(course_id)
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);

-- Audit -------------------------------------------------------------------------
create trigger audit_timetable_slots after insert or update or delete on public.timetable_slots
  for each row execute function public.audit_row();
create trigger audit_attendance_sessions after insert or update or delete on public.attendance_sessions
  for each row execute function public.audit_row();
create trigger audit_attendance_records after update or delete on public.attendance_records
  for each row execute function public.audit_row();
create trigger audit_invoices after insert or update on public.invoices
  for each row execute function public.audit_row();
create trigger audit_payments after insert or delete on public.payments
  for each row execute function public.audit_row();
create trigger audit_certificates after insert or update on public.certificates
  for each row execute function public.audit_row();

insert into public.system_settings (key, value) values ('currency', '"PKR"') on conflict (key) do nothing;
