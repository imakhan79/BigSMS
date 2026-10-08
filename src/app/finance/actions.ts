"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

/**
 * Finance actions for the Principal and the Admin Manager. The database enforces the rules
 * (RLS plus the guards in the finance migration); these actions only shape the requests.
 */
async function finance() {
  const profile = await requireRole("principal", "admin_manager");
  return { profile, supabase: await createClient() };
}

function done(path: string, message: string): never {
  revalidatePath("/finance", "layout");
  revalidatePath("/manager", "layout");
  back(path, "ok", message);
}

// 6.1 Student fees --------------------------------------------------------------
export async function issueInvoice(form: FormData) {
  const { supabase } = await finance();
  const path = str(form, "back") || "/finance/fees";
  const amount = Number(str(form, "amount"));
  if (!(amount > 0)) back(path, "error", "Enter an amount greater than zero.");
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      student_id: str(form, "student_id"),
      title: str(form, "title"),
      description: str(form, "description"),
      amount,
      due_on: str(form, "due_on"),
    })
    .select("invoice_no")
    .single();
  if (error) back(path, "error", error.message);
  done(path, `Invoice ${data.invoice_no} issued.`);
}

export async function recordPayment(form: FormData) {
  const { supabase } = await finance();
  const path = str(form, "back") || "/finance/fees";
  const amount = Number(str(form, "amount"));
  if (!(amount > 0)) back(path, "error", "Enter an amount greater than zero.");
  const { data, error } = await supabase
    .from("payments")
    .insert({
      invoice_id: str(form, "invoice_id"),
      amount,
      payment_type: str(form, "payment_type"),
      method: str(form, "method"),
      paid_on: str(form, "paid_on") || undefined,
      reference: str(form, "reference"),
    })
    .select("receipt_no")
    .single();
  if (error) back(path, "error", error.message);
  done(path, `Payment recorded. Receipt ${data.receipt_no}.`);
}

export async function cancelInvoice(form: FormData) {
  const { supabase } = await finance();
  const path = str(form, "back") || "/finance/fees";
  const reason = str(form, "reason");
  if (!reason) back(path, "error", "Give a reason for cancelling the invoice.");
  const { error } = await supabase.from("invoices").update({ status: "cancelled", cancelled_reason: reason }).eq("id", str(form, "id"));
  if (error) back(path, "error", error.message);
  done(path, "Invoice cancelled.");
}

// 6.2 Staff salaries ------------------------------------------------------------
export async function saveSalaryDetails(form: FormData) {
  const { supabase } = await finance();
  const path = "/finance/salaries/setup";
  const monthly = Number(str(form, "monthly_amount"));
  if (!(monthly > 0)) back(path, "error", "Enter a monthly salary greater than zero.");
  const { error } = await supabase.from("staff_salaries").upsert({
    employee_id: str(form, "employee_id"),
    monthly_amount: monthly,
    payment_method: str(form, "payment_method"),
    bank_name: str(form, "bank_name"),
    account_no: str(form, "account_no"),
    effective_from: str(form, "effective_from") || undefined,
    notes: str(form, "notes"),
  });
  if (error) back(path, "error", error.message);
  done(path, "Salary details saved.");
}

export async function runPayroll(form: FormData) {
  const { supabase } = await finance();
  const month = str(form, "month"); // YYYY-MM
  const path = `/finance/salaries?month=${month}`;
  if (!/^\d{4}-\d{2}$/.test(month)) back("/finance/salaries", "error", "Choose a month.");
  const { data, error } = await supabase.rpc("generate_payroll", { p_period: `${month}-01`, p_due_on: str(form, "due_on") });
  if (error) back(path, "error", error.message);
  done(path, data ? `${data} salary record${data === 1 ? "" : "s"} created.` : "Everyone with salary details already has a record for this month.");
}

export async function paySalary(form: FormData) {
  const { supabase } = await finance();
  const path = str(form, "back") || "/finance/salaries";
  const { data, error } = await supabase
    .from("salary_payments")
    .update({ status: "paid", method: str(form, "method"), paid_on: str(form, "paid_on") || null, reference: str(form, "reference") })
    .eq("id", str(form, "id"))
    .select("slip_no")
    .single();
  if (error) back(path, "error", error.message);
  done(path, `Salary paid. Slip ${data.slip_no}.`);
}

export async function holdSalary(form: FormData) {
  const { supabase } = await finance();
  const path = str(form, "back") || "/finance/salaries";
  const hold = str(form, "hold") === "on";
  const { error } = await supabase
    .from("salary_payments")
    .update({ status: hold ? "on_hold" : "pending", notes: str(form, "notes") })
    .eq("id", str(form, "id"));
  if (error) back(path, "error", error.message);
  done(path, hold ? "Salary put on hold." : "Salary released from hold.");
}
