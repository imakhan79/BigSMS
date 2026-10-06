import { issueInvoice } from "@/app/manager/actions";
import { INVOICE_SELECT, InvoiceTable, type InvoiceRow } from "@/app/manager/_fees";
import { CsvButton } from "@/components/CsvButton";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, CardTitle, Filters, Flash, type FlashParams, Input, Label, PageHeader, Select, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getCurrency } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, today } from "@/lib/utils";

const FILTERS = ["open", "unpaid", "partial", "paid", "cancelled", "all"] as const;

export default async function FeesPage({ searchParams }: { searchParams: Promise<FlashParams & { status?: string }> }) {
  const params = await searchParams;
  await requireRole("admin_manager");
  const supabase = await createClient();
  const status = params.status ?? "open";
  let query = supabase.from("invoices").select(INVOICE_SELECT).order("due_on");
  query = status === "open" ? query.in("status", ["unpaid", "partial"]) : status === "all" ? query : query.eq("status", status);
  const [{ data }, { data: students }, { data: totals }, currency] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, user_code").eq("role", "student").eq("status", "active").order("full_name"),
    supabase.from("invoices").select("amount, amount_paid, status, due_on").neq("status", "cancelled"),
    getCurrency(supabase),
  ]);
  const invoices = (data ?? []) as unknown as InvoiceRow[];
  const all = totals ?? [];
  const billed = all.reduce((t, i) => t + Number(i.amount), 0);
  const collected = all.reduce((t, i) => t + Number(i.amount_paid), 0);
  const overdue = all.filter((i) => i.status !== "paid" && i.due_on < today()).reduce((t, i) => t + Number(i.amount) - Number(i.amount_paid), 0);
  const back = `/manager/fees?status=${status}`;

  return (
    <>
      <PageHeader
        title="Fee records"
        subtitle="Student invoices and payment records. Reversing a payment is reserved for the Super Admin."
        action={
          <CsvButton
            filename="fees.csv"
            rows={invoices.map((i) => ({ invoice: i.invoice_no, student: i.student?.full_name, student_id: i.student?.user_code, title: i.title, amount: i.amount, paid: i.amount_paid, due: i.due_on, status: i.status }))}
          />
        }
      />
      <Flash params={params} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Billed" value={formatMoney(billed, currency)} />
        <Stat label="Collected" value={formatMoney(collected, currency)} />
        <Stat label="Outstanding" value={formatMoney(billed - collected, currency)} />
        <Stat label="Overdue" value={formatMoney(overdue, currency)} />
      </div>
      <Card className="mb-6">
        <CardTitle>Issue an invoice</CardTitle>
        <form action={issueInvoice} className="grid gap-3 md:grid-cols-[1fr_1fr_150px_170px_auto] md:items-end">
          <input type="hidden" name="back" value={back} />
          <Label label="Student">
            <Select name="student_id" required>
              {students?.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.user_code ? ` (${s.user_code})` : ""}</option>)}
            </Select>
          </Label>
          <Label label="Title"><Input name="title" required placeholder="e.g. Tuition fee, Term 1" /></Label>
          <Label label={`Amount (${currency})`}><Input name="amount" type="number" step="0.01" min="0.01" required /></Label>
          <Label label="Due on"><Input name="due_on" type="date" defaultValue={today()} required /></Label>
          <SubmitButton>Issue</SubmitButton>
        </form>
      </Card>
      <div className="mb-4">
        <Filters label="Status" items={FILTERS.map((f) => ({ href: `/manager/fees?status=${f}`, label: f, active: status === f }))} />
      </div>
      <Card><InvoiceTable invoices={invoices} currency={currency} back={back} /></Card>
    </>
  );
}
