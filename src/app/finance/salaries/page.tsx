import Link from "next/link";
import { holdSalary, paySalary, runPayroll } from "@/app/finance/actions";
import { CsvButton } from "@/components/CsvButton";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, buttonClass, Card, CardTitle, Filters, Flash, type FlashParams, Input, Label, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getCurrency } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_METHOD_CHOICES, PAYMENT_METHODS, ROLE_LABEL, type Role, SALARY_STATUSES } from "@/lib/types";
import { formatDay, formatMoney, today } from "@/lib/utils";

interface SalaryRow {
  id: string;
  slip_no: string;
  employee_id: string;
  period: string;
  amount: number;
  due_on: string;
  status: string;
  paid_on: string | null;
  method: string | null;
  reference: string;
  notes: string;
  employee: { full_name: string; user_code: string | null; role: Role } | null;
}

const FILTERS = ["all", "pending", "due", "paid", "on_hold"] as const;

/** A pending payment whose due date has come is Due (mirrors salary_status_now()). */
const statusNow = (r: SalaryRow) => (r.status === "pending" && r.due_on <= today() ? "due" : r.status);

const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export default async function SalariesPage({ searchParams }: { searchParams: Promise<FlashParams & { month?: string; status?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole("principal", "admin_manager");
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today().slice(0, 7);
  const status = (FILTERS as readonly string[]).includes(params.status ?? "") ? params.status! : "all";
  const supabase = await createClient();

  const [{ data }, { data: details }, currency] = await Promise.all([
    supabase
      .from("salary_payments")
      .select("id, slip_no, employee_id, period, amount, due_on, status, paid_on, method, reference, notes, employee:profiles!salary_payments_employee_id_fkey(full_name, user_code, role)")
      .eq("period", `${month}-01`)
      .order("due_on"),
    supabase.from("staff_salaries").select("employee_id, payment_method"),
    getCurrency(supabase),
  ]);
  const rows = (data ?? []) as unknown as SalaryRow[];
  const shown = status === "all" ? rows : rows.filter((r) => statusNow(r) === status);
  const usualMethod = new Map((details ?? []).map((d) => [d.employee_id, d.payment_method as string]));
  const sum = (s: string) => rows.filter((r) => statusNow(r) === s).reduce((t, r) => t + Number(r.amount), 0);
  const back = `/finance/salaries?month=${month}&status=${status}`;
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader
        title="Staff salaries"
        subtitle="Monthly salary payment records: Pending, Due, Paid or On hold. Only the Principal and the Admin Manager enter salary records."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/finance/salaries/setup" className={buttonClass("outline")}>Salary details</Link>
            <CsvButton
              filename={`salaries-${month}.csv`}
              rows={rows.map((r) => ({
                slip: r.slip_no, employee: r.employee?.full_name, employee_id: r.employee?.user_code, month, amount: r.amount,
                due_on: r.due_on, status: SALARY_STATUSES[statusNow(r)], paid_on: r.paid_on ?? "", mode: r.method ? PAYMENT_METHODS[r.method] : "", reference: r.reference,
              }))}
            />
          </div>
        }
      />
      <Flash params={params} />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle description="Show the salary records for a month.">Month</CardTitle>
          <form className="flex flex-wrap items-end gap-3">
            <Label label="Month"><Input name="month" type="month" defaultValue={month} required /></Label>
            <button className={buttonClass("outline")}>Show</button>
          </form>
        </Card>
        <Card>
          <CardTitle description="Creates a record for every active employee with salary details who has none for the month yet.">Run payroll for {monthLabel}</CardTitle>
          <form action={runPayroll} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="month" value={month} />
            <Label label="Due on"><Input name="due_on" type="date" defaultValue={lastDayOf(month)} required /></Label>
            <SubmitButton>Generate records</SubmitButton>
          </form>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Paid" value={formatMoney(sum("paid"), currency)} />
        <Stat label="Due" value={formatMoney(sum("due"), currency)} />
        <Stat label="Pending" value={formatMoney(sum("pending"), currency)} />
        <Stat label="On hold" value={formatMoney(sum("on_hold"), currency)} />
      </div>

      <div className="mb-4">
        <Filters
          label="Status"
          items={FILTERS.map((f) => ({ href: `/finance/salaries?month=${month}&status=${f}`, label: f === "all" ? "All" : SALARY_STATUSES[f], active: status === f }))}
        />
      </div>

      <Card>
        {rows.some((r) => r.employee_id === profile.id) && (
          <Alert tone="info" className="mb-4">Your own salary is recorded by the {profile.role === "principal" ? "Admin Manager" : "Principal"}.</Alert>
        )}
        <Table head={["Slip", "Employee", "Amount", "Due on", "Status", "Payment"]} empty={!shown.length}>
          {shown.map((r) => {
            const now = statusNow(r);
            const mine = r.employee_id === profile.id;
            return (
              <tr key={r.id} className="align-top">
                <Td className="whitespace-nowrap font-mono text-xs">{r.slip_no}</Td>
                <Td>
                  <p className="font-medium">{r.employee?.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{r.employee?.user_code}</span>{r.employee ? ` · ${ROLE_LABEL[r.employee.role]}` : ""}
                  </p>
                </Td>
                <Td className="whitespace-nowrap">{formatMoney(r.amount, currency)}</Td>
                <Td className="whitespace-nowrap">{formatDay(r.due_on)}</Td>
                <Td>
                  <Badge value={now}>{SALARY_STATUSES[now]}</Badge>
                  {r.notes && <p className="mt-1 max-w-48 text-xs text-muted-foreground">{r.notes}</p>}
                </Td>
                <Td>
                  {now === "paid" ? (
                    <p className="text-xs text-muted-foreground">
                      {formatDay(r.paid_on)} · {r.method ? PAYMENT_METHODS[r.method] : ""}{r.reference ? ` · ${r.reference}` : ""}
                    </p>
                  ) : mine ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <div className="space-y-1.5">
                      {now !== "on_hold" && (
                        <form action={paySalary} className="flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="back" value={back} />
                          <Select name="method" defaultValue={usualMethod.get(r.employee_id) ?? "bank_transfer"} className="h-8 w-28 text-xs" aria-label="Payment mode">
                            {Object.entries(PAYMENT_METHOD_CHOICES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </Select>
                          <Input name="paid_on" type="date" max={today()} defaultValue={today()} className="h-8 w-36 text-xs" aria-label="Paid on" />
                          <Input name="reference" placeholder="Cheque no. / IBFT ref." className="h-8 w-40 text-xs" aria-label="Cheque number or IBFT reference" />
                          <SubmitButton size="sm">Mark paid</SubmitButton>
                        </form>
                      )}
                      <form action={holdSalary} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="hold" value={now === "on_hold" ? "off" : "on"} />
                        {now !== "on_hold" && <Input name="notes" placeholder="Reason for hold" className="h-8 w-44 text-xs" aria-label="Reason for hold" required />}
                        <SubmitButton size="sm" variant="outline">{now === "on_hold" ? "Release hold" : "Put on hold"}</SubmitButton>
                      </form>
                    </div>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
