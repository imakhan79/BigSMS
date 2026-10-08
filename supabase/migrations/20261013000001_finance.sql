-- Finance management (BRD 6).
--
-- 6.1 Student fees: invoices and payment records. Each payment has a type (Full, Partial or
--     Installment) and a mode (Cash, IBFT or Cheque).
-- 6.2 Staff salaries: salary details per employee and monthly salary payment records with a
--     status (Pending, Due, Paid, On hold). "Due" is a pending payment whose due date has come.
--
-- Only the Principal and the Admin Manager enter or update finance records. Admins keep
-- read-only access to student fees. Nobody enters or pays their own salary, and an employee
-- may read their own salary records.

create or replace function public.manages_finance()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() in ('principal', 'admin_manager'), false);
$$;

-- 6.1 Student fees ------------------------------------------------------------------
drop policy invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated using (
  (select public.manages_finance())
  or (select public.manages_students())
  or (student_id = (select auth.uid()) and (select public.is_active()))
);
drop policy invoices_insert on public.invoices;
create policy invoices_insert on public.invoices for insert to authenticated
  with check ((select public.manages_finance()));
drop policy invoices_update on public.invoices;
create policy invoices_update on public.invoices for update to authenticated
  using ((select public.manages_finance())) with check ((select public.manages_finance()));

drop policy payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using (
  (select public.manages_finance())
  or (select public.manages_students())
  or (public.invoice_student(invoice_id) = (select auth.uid()) and (select public.is_active()))
);
drop policy payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check ((select public.manages_finance()));
-- Reversing a payment is the Principal's decision.
drop policy payments_delete on public.payments;
create policy payments_delete on public.payments for delete to authenticated
  using (coalesce((select public.app_role()) = 'principal', false));

-- Payment type and the three payment modes.
alter table public.payments add column payment_type public.fee_plan;
update public.payments p
   set payment_type = case when p.amount >= i.amount then 'full' else 'partial' end::public.fee_plan
  from public.invoices i where i.id = p.invoice_id;
alter table public.payments alter column payment_type set not null;
alter table public.payments
  add constraint payments_method_choice check (method in ('cash', 'bank_transfer', 'cheque')) not valid;

-- Full settles the whole outstanding balance; Partial pays less than it; an Installment
-- pays at most what is outstanding (the last one may clear it).
create or replace function public.guard_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
  v_balance numeric;
begin
  select * into v_invoice from public.invoices where id = new.invoice_id for update;
  if v_invoice.status = 'cancelled' then
    raise exception 'This invoice is cancelled';
  end if;
  v_balance := v_invoice.amount - v_invoice.amount_paid;
  if new.amount > v_balance then
    raise exception 'Payment is more than the % outstanding', to_char(v_balance, 'FM999,999,990.00');
  end if;
  if new.payment_type = 'full' and new.amount <> v_balance then
    raise exception 'A full payment must clear the % outstanding', to_char(v_balance, 'FM999,999,990.00');
  end if;
  if new.payment_type = 'partial' and new.amount >= v_balance then
    raise exception 'A partial payment must be less than the % outstanding. Choose Full instead', to_char(v_balance, 'FM999,999,990.00');
  end if;
  if new.method in ('cheque', 'bank_transfer') and nullif(trim(new.reference), '') is null then
    raise exception 'Enter the % for this payment', case new.method when 'cheque' then 'cheque number' else 'IBFT transaction reference' end;
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

-- 6.2 Staff salaries ----------------------------------------------------------------
create type public.salary_status as enum ('pending', 'due', 'paid', 'on_hold');

-- Who can be on the payroll: every staff account except students and parents.
create or replace function public.is_employee(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
     where id = p_id and role in ('super_admin', 'admin', 'admin_manager', 'principal', 'professor', 'staff')
  );
$$;

create table public.staff_salaries (
  employee_id     uuid primary key references public.profiles (id) on delete restrict,
  monthly_amount  numeric(12, 2) not null check (monthly_amount > 0),
  payment_method  public.payment_method not null default 'bank_transfer'
                    check (payment_method in ('cash', 'bank_transfer', 'cheque')),
  bank_name       text not null default '',
  account_no      text not null default '',
  effective_from  date not null default current_date,
  notes           text not null default '',
  updated_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index staff_salaries_updated_by_idx on public.staff_salaries (updated_by);
create trigger staff_salaries_updated_at before update on public.staff_salaries
  for each row execute function public.set_updated_at();

create table public.salary_payments (
  id           uuid primary key default gen_random_uuid(),
  slip_no      text not null unique,
  employee_id  uuid not null references public.profiles (id) on delete restrict,
  period       date not null check (extract(day from period) = 1),
  amount       numeric(12, 2) not null check (amount > 0),
  due_on       date not null,
  status       public.salary_status not null default 'pending',
  paid_on      date,
  method       public.payment_method check (method in ('cash', 'bank_transfer', 'cheque')),
  reference    text not null default '',
  notes        text not null default '',
  created_by   uuid references public.profiles (id) on delete set null,
  paid_by      uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, period)
);
create index salary_payments_period_idx on public.salary_payments (period desc, status);
create index salary_payments_created_by_idx on public.salary_payments (created_by);
create index salary_payments_paid_by_idx on public.salary_payments (paid_by);
create trigger salary_payments_updated_at before update on public.salary_payments
  for each row execute function public.set_updated_at();

create or replace function public.guard_staff_salary()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.employee_id = auth.uid() then
    raise exception 'You cannot set your own salary';
  end if;
  if tg_op = 'UPDATE' and new.employee_id is distinct from old.employee_id then
    raise exception 'Salary details cannot move to another employee';
  end if;
  if not public.is_employee(new.employee_id) then
    raise exception 'Salaries are only for staff, Faculty and administrators';
  end if;
  new.bank_name := trim(new.bank_name);
  new.account_no := trim(new.account_no);
  new.notes := trim(new.notes);
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger staff_salaries_guard before insert or update on public.staff_salaries
  for each row execute function public.guard_staff_salary();

-- Pending -> Due (stored once the due date has come, see salary_status_now) -> Paid.
-- On hold pauses a payment. A paid record is final.
create or replace function public.guard_salary_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.employee_id = auth.uid() then
    raise exception 'You cannot record your own salary';
  end if;
  if tg_op = 'INSERT' then
    if not public.is_employee(new.employee_id) then
      raise exception 'Salaries are only for staff, Faculty and administrators';
    end if;
    new.slip_no := public.next_document_no('SAL');
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := case when new.due_on <= current_date then 'due' else 'pending' end;
    new.paid_on := null;
    new.paid_by := null;
    new.method := null;
    new.reference := '';
  else
    if old.status = 'paid' then
      raise exception 'This salary has been paid and cannot be changed';
    end if;
    if (new.slip_no, new.employee_id, new.period) is distinct from (old.slip_no, old.employee_id, old.period) then
      raise exception 'Slip number, employee and month cannot be changed';
    end if;
  end if;

  if new.status = 'paid' then
    if new.method is null then
      raise exception 'Choose how the salary was paid (Cash, IBFT or Cheque)';
    end if;
    if new.method in ('cheque', 'bank_transfer') and nullif(trim(new.reference), '') is null then
      raise exception 'Enter the % for this payment', case new.method when 'cheque' then 'cheque number' else 'IBFT transaction reference' end;
    end if;
    new.paid_on := coalesce(new.paid_on, current_date);
    if new.paid_on > current_date then
      raise exception 'Payment date cannot be in the future';
    end if;
    new.paid_by := coalesce(auth.uid(), new.paid_by);
  else
    if new.status in ('pending', 'due') then
      new.status := case when new.due_on <= current_date then 'due' else 'pending' end;
    end if;
    new.paid_on := null;
    new.paid_by := null;
  end if;
  new.reference := trim(new.reference);
  new.notes := trim(new.notes);
  return new;
end;
$$;
create trigger salary_payments_guard before insert or update on public.salary_payments
  for each row execute function public.guard_salary_payment();

-- Status as of today: a pending payment whose due date has come is Due.
create or replace function public.salary_status_now(p_status public.salary_status, p_due_on date)
returns public.salary_status language sql stable set search_path = '' as $$
  select case when p_status = 'pending' and p_due_on <= current_date then 'due'::public.salary_status else p_status end;
$$;

-- Creates the month's salary records for every active employee with salary details.
-- Returns how many were created; employees who already have a record are skipped.
create or replace function public.generate_payroll(p_period date, p_due_on date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  v_count integer;
begin
  if not public.manages_finance() then
    raise exception 'Only the Principal or the Admin Manager can run payroll';
  end if;
  if p_due_on < v_period then
    raise exception 'The due date cannot be before the start of the month';
  end if;
  insert into public.salary_payments (employee_id, period, amount, due_on, notes)
  select s.employee_id, v_period, s.monthly_amount, p_due_on, ''
    from public.staff_salaries s
    join public.profiles p on p.id = s.employee_id and p.status = 'active'
   where s.employee_id <> auth.uid()
     and not exists (select 1 from public.salary_payments x where x.employee_id = s.employee_id and x.period = v_period);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.generate_payroll(date, date) from public, anon;
grant execute on function public.generate_payroll(date, date) to authenticated;

alter table public.staff_salaries enable row level security;
create policy staff_salaries_select on public.staff_salaries for select to authenticated using (
  (select public.manages_finance())
  or (employee_id = (select auth.uid()) and (select public.is_active()))
);
create policy staff_salaries_write on public.staff_salaries for all to authenticated
  using ((select public.manages_finance())) with check ((select public.manages_finance()));

alter table public.salary_payments enable row level security;
create policy salary_payments_select on public.salary_payments for select to authenticated using (
  (select public.manages_finance())
  or (employee_id = (select auth.uid()) and (select public.is_active()))
);
create policy salary_payments_insert on public.salary_payments for insert to authenticated
  with check ((select public.manages_finance()));
create policy salary_payments_update on public.salary_payments for update to authenticated
  using ((select public.manages_finance())) with check ((select public.manages_finance()));
-- Only records that were never paid can be removed, by the Principal.
create policy salary_payments_delete on public.salary_payments for delete to authenticated
  using (coalesce((select public.app_role()) = 'principal', false) and status <> 'paid');

create trigger audit_staff_salaries after insert or update or delete on public.staff_salaries
  for each row execute function public.audit_row();
create trigger audit_salary_payments after insert or update or delete on public.salary_payments
  for each row execute function public.audit_row();
