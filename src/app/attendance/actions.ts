"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

/**
 * Staff and Faculty attendance, kept by the Principal and the Admin Manager. The database
 * enforces the rules (RLS plus guard_staff_attendance); this action only shapes the request.
 */
export async function saveStaffAttendance(form: FormData) {
  const profile = await requireRole("principal", "admin_manager");
  const supabase = await createClient();
  const day = str(form, "day");
  const path = `/attendance/staff?date=${day}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) back("/attendance/staff", "error", "Choose a date.");

  // "Mark the rest present" fills every unmarked row.
  const fill = str(form, "fill");
  const rows = form
    .getAll("employee_id")
    .map(String)
    .filter((id) => id !== profile.id)
    .map((employee_id) => ({
      employee_id,
      attended_on: day,
      status: str(form, `status_${employee_id}`) || fill,
      check_in: str(form, `in_${employee_id}`) || null,
      check_out: str(form, `out_${employee_id}`) || null,
      note: str(form, `note_${employee_id}`),
    }))
    .filter((r) => r.status);
  if (!rows.length) back(path, "error", "Choose a status for at least one person.");

  const { error } = await supabase.from("staff_attendance").upsert(rows, { onConflict: "employee_id,attended_on" });
  if (error) back(path, "error", error.message);
  revalidatePath("/attendance", "layout");
  back(path, "ok", `Attendance saved for ${rows.length} ${rows.length === 1 ? "person" : "people"}.`);
}
