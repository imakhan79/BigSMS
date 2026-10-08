import Link from "next/link";
import { cancelInvoice, recordPayment } from "@/app/finance/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Input, Select, Table, Td } from "@/components/ui";
import { FEE_PLANS, PAYMENT_METHOD_CHOICES, PAYMENT_METHODS } from "@/lib/types";
import { formatDay, formatMoney, today } from "@/lib/utils";

export interface InvoiceRow {
  id: string;
  invoice_no: string;
  student_id: string;
  title: string;
  amount: number;
  amount_paid: number;
  due_on: string;
  status: string;
  cancelled_reason: string | null;
  student?: { full_name: string; user_code: string | null } | null;
  payments: { id: string; receipt_no: string; amount: number; paid_on: string; method: string; payment_type: string; reference: string }[];
}

export const INVOICE_SELECT =
  "id, invoice_no, student_id, title, amount, amount_paid, due_on, status, cancelled_reason, " +
  "student:profiles!invoices_student_id_fkey(full_name, user_code), payments(id, receipt_no, amount, paid_on, method, payment_type, reference)";

/**
 * Invoices with their payment history, a record-payment form, and cancel for unpaid invoices.
 * `studentHref` links each student to their record (the Admin Manager's student pages).
 */
export function InvoiceTable({ invoices, currency, back, showStudent = true, studentHref }: { invoices: InvoiceRow[]; currency: string; back: string; showStudent?: boolean; studentHref?: (id: string) => string }) {
  const overdue = (i: InvoiceRow) => (i.status === "unpaid" || i.status === "partial") && i.due_on < today();
  return (
    <Table head={["Invoice", ...(showStudent ? ["Student"] : []), "Amount", "Paid", "Due", "Status", "Record payment"]} empty={!invoices.length}>
      {invoices.map((i) => {
        const balance = Number(i.amount) - Number(i.amount_paid);
        const open = i.status === "unpaid" || i.status === "partial";
        return (
          <tr key={i.id} className="align-top">
            <Td>
              <p className="font-medium">{i.title}</p>
              <p className="font-mono text-xs text-muted-foreground">{i.invoice_no}</p>
              {i.payments.length > 0 && (
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-primary">{i.payments.length} payment{i.payments.length === 1 ? "" : "s"}</summary>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {i.payments.map((p) => (
                      <li key={p.id}>
                        {p.receipt_no}: {formatMoney(p.amount, currency)} · {FEE_PLANS[p.payment_type] ?? p.payment_type} · {PAYMENT_METHODS[p.method]} · {formatDay(p.paid_on)}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {i.cancelled_reason && <p className="text-xs text-muted-foreground">Cancelled: {i.cancelled_reason}</p>}
            </Td>
            {showStudent && (
              <Td>
                {studentHref ? (
                  <Link href={studentHref(i.student_id)} className="hover:underline">{i.student?.full_name ?? "—"}</Link>
                ) : (
                  <span>{i.student?.full_name ?? "—"}</span>
                )}
                <p className="font-mono text-xs text-muted-foreground">{i.student?.user_code}</p>
              </Td>
            )}
            <Td className="whitespace-nowrap">{formatMoney(i.amount, currency)}</Td>
            <Td className="whitespace-nowrap">{formatMoney(i.amount_paid, currency)}</Td>
            <Td className="whitespace-nowrap">{formatDay(i.due_on)}</Td>
            <Td>{overdue(i) ? <Badge value="overdue" /> : <Badge value={i.status} />}</Td>
            <Td>
              {open ? (
                <div className="space-y-1.5">
                  <form action={recordPayment} className="flex flex-wrap items-center gap-1.5">
                    <input type="hidden" name="invoice_id" value={i.id} />
                    <input type="hidden" name="back" value={back} />
                    <Input name="amount" type="number" step="0.01" min="0.01" max={balance} defaultValue={balance} className="h-8 w-28 text-xs" aria-label="Amount" required />
                    <Select name="payment_type" className="h-8 w-32 text-xs" aria-label="Payment type">
                      {Object.entries(FEE_PLANS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                    <Select name="method" className="h-8 w-32 text-xs" aria-label="Payment mode">
                      {Object.entries(PAYMENT_METHOD_CHOICES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                    <Input name="paid_on" type="date" max={today()} defaultValue={today()} className="h-8 w-36 text-xs" aria-label="Paid on" />
                    <Input name="reference" placeholder="Cheque no. / IBFT ref." className="h-8 w-40 text-xs" aria-label="Cheque number or IBFT reference" />
                    <SubmitButton size="sm">Record</SubmitButton>
                  </form>
                  {Number(i.amount_paid) === 0 && (
                    <form action={cancelInvoice} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="back" value={back} />
                      <Input name="reason" placeholder="Reason to cancel" className="h-8 w-44 text-xs" aria-label="Cancel reason" required />
                      <SubmitButton size="sm" variant="outline" confirm="Cancel this invoice?">Cancel invoice</SubmitButton>
                    </form>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </Td>
          </tr>
        );
      })}
    </Table>
  );
}
