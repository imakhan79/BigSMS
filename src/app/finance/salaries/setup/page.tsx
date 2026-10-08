import { saveSalaryDetails } from "@/app/finance/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, Flash, type FlashParams, Input, PageHeader, Select, Table, Td, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getCurrency } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYEE_ROLES, PAYMENT_METHOD_CHOICES, ROLE_LABEL, type Role } from "@/lib/types";
import { formatMoney, today } from "@/lib/utils";

interface Detail {
  employee_id: string;
  monthly_amount: number;
  payment_method: string;
  bank_name: string;
  account_no: string;
  effective_from: string;
  notes: string;
}

/** Salary details (6.2): monthly amount and how each employee is paid. */
export default async function SalaryDetailsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  const profile = await requireRole("principal", "admin_manager");
  const supabase = await createClient();
  const [{ data: people }, { data: details }, currency] = await Promise.all([
    supabase.from("profiles").select("id, full_name, user_code, role").in("role", [...EMPLOYEE_ROLES]).eq("status", "active").order("full_name"),
    supabase.from("staff_salaries").select("employee_id, monthly_amount, payment_method, bank_name, account_no, effective_from, notes"),
    getCurrency(supabase),
  ]);
  const byEmployee = new Map(((details ?? []) as Detail[]).map((d) => [d.employee_id, d]));
  const employees = (people ?? []) as { id: string; full_name: string; user_code: string | null; role: Role }[];
  const payroll = employees.reduce((t, e) => t + Number(byEmployee.get(e.id)?.monthly_amount ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href="/finance/salaries">← Staff salaries</TextLink>}
        title="Salary details"
        subtitle={`Monthly salary and payment mode for each active employee. Monthly payroll: ${formatMoney(payroll, currency)}.`}
      />
      <Flash params={params} />
      <Card>
        <Table head={["Employee", `Monthly (${currency})`, "Payment mode", "Bank", "Account no.", "Effective from", ""]} empty={!employees.length}>
          {employees.map((e) => {
            const d = byEmployee.get(e.id);
            const mine = e.id === profile.id;
            const form = `salary-${e.id}`;
            return (
              <tr key={e.id} className="align-top">
                <Td>
                  <p className="font-medium">{e.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground"><span className="font-mono">{e.user_code}</span> · {ROLE_LABEL[e.role]}</p>
                  {!d && <Badge value="pending">No salary set</Badge>}
                </Td>
                {mine ? (
                  <>
                    <Td className="whitespace-nowrap">{d ? formatMoney(d.monthly_amount, currency) : "—"}</Td>
                    <Td colSpan={5} className="text-xs text-muted-foreground">
                      Your own salary is set by the {profile.role === "principal" ? "Admin Manager" : "Principal"}.
                    </Td>
                  </>
                ) : (
                  <>
                    <Td><Input form={form} name="monthly_amount" type="number" step="0.01" min="0.01" defaultValue={d?.monthly_amount} className="h-8 w-32 min-w-32 text-xs" aria-label="Monthly salary" required /></Td>
                    <Td>
                      <Select form={form} name="payment_method" defaultValue={d?.payment_method ?? "bank_transfer"} className="h-8 w-28 min-w-28 text-xs" aria-label="Payment mode">
                        {Object.entries(PAYMENT_METHOD_CHOICES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                    </Td>
                    <Td><Input form={form} name="bank_name" defaultValue={d?.bank_name} placeholder="e.g. HBL" className="h-8 w-28 min-w-28 text-xs" aria-label="Bank" /></Td>
                    <Td><Input form={form} name="account_no" defaultValue={d?.account_no} placeholder="IBAN / account" className="h-8 w-56 min-w-56 text-xs" aria-label="Account number" /></Td>
                    <Td><Input form={form} name="effective_from" type="date" defaultValue={d?.effective_from ?? today()} className="h-8 w-36 min-w-36 text-xs" aria-label="Effective from" /></Td>
                    <Td>
                      <form id={form} action={saveSalaryDetails}>
                        <input type="hidden" name="employee_id" value={e.id} />
                        <SubmitButton size="sm">{d ? "Save" : "Set salary"}</SubmitButton>
                      </form>
                    </Td>
                  </>
                )}
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
