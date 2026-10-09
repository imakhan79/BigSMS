"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

async function admin() {
  await requireRole("admin");
  return createClient();
}

// Users -----------------------------------------------------------------------
// The guard_profile_update trigger enforces who may change what: only a Super Admin
// manages administrator accounts and user IDs.
export async function updateUser(form: FormData) {
  const supabase = await admin();
  const path = str(form, "back") || "/admin/users";
  const status = str(form, "status");
  if (status === "offboarded") back(path, "error", "Use Offboard on the user's page so a reason is recorded.");
  const { error } = await supabase
    .from("profiles")
    .update({ role: str(form, "role"), status })
    .eq("id", str(form, "id"));
  if (error) back(path, "error", error.message);
  revalidatePath("/admin", "layout");
  back(path, "ok", status === "active" ? "User saved. Activated accounts get a user ID automatically." : "User updated.");
}

export async function createUser(form: FormData) {
  const supabase = await admin();
  const { data, error } = await supabase.rpc("admin_create_user", {
    p_email: str(form, "email"),
    p_full_name: str(form, "full_name"),
    p_role: str(form, "role"),
    p_password: str(form, "password"),
    p_phone: str(form, "phone"),
    p_department: str(form, "department"),
  });
  if (error) back("/admin/users", "error", error.message);
  revalidatePath("/admin", "layout");
  back(`/admin/users/${data}`, "ok", "User created and onboarded. Share the temporary password with them securely.");
}

export async function updateUserDetails(form: FormData) {
  const supabase = await admin();
  const id = str(form, "id");
  const path = `/admin/users/${id}`;
  const changes: Record<string, string | null> = {
    full_name: str(form, "full_name"),
    phone: str(form, "phone"),
    department: str(form, "department"),
  };
  if (form.has("user_code")) changes.user_code = str(form, "user_code").toUpperCase() || null;
  const { error } = await supabase.from("profiles").update(changes).eq("id", id);
  if (error) back(path, "error", error.code === "23505" ? "That user ID is already taken." : error.message);
  revalidatePath("/admin/users");
  back(path, "ok", "Details saved.");
}

export async function offboardUser(form: FormData) {
  const supabase = await admin();
  const id = str(form, "id");
  const path = `/admin/users/${id}`;
  const reason = str(form, "reason");
  if (!reason) back(path, "error", "Give a reason for offboarding.");
  const { error } = await supabase.from("profiles").update({ status: "offboarded", offboard_reason: reason }).eq("id", id);
  if (error) back(path, "error", error.message);
  revalidatePath("/admin", "layout");
  back(path, "ok", "User offboarded. Their access has ended; records are kept.");
}

// Categories ------------------------------------------------------------------
export async function createCategory(form: FormData) {
  const supabase = await admin();
  const { error } = await supabase.from("course_categories").insert({ name: str(form, "name") });
  if (error) back("/admin/categories", "error", error.code === "23505" ? "Category already exists." : error.message);
  revalidatePath("/admin/categories");
  back("/admin/categories", "ok", "Category added.");
}

export async function deleteCategory(form: FormData) {
  const supabase = await admin();
  const { error } = await supabase.from("course_categories").delete().eq("id", str(form, "id"));
  if (error) back("/admin/categories", "error", error.message);
  revalidatePath("/admin/categories");
  back("/admin/categories", "ok", "Category deleted.");
}

// KPIs and alerts -------------------------------------------------------------
export async function saveKpi(form: FormData) {
  const supabase = await admin();
  const id = str(form, "id");
  const row = {
    name: str(form, "name"),
    metric: str(form, "metric"),
    comparison: str(form, "comparison"),
    threshold: Number(str(form, "threshold")),
    enabled: form.get("enabled") === "on",
  };
  if (!row.name || Number.isNaN(row.threshold)) back("/admin/kpis", "error", "Name and a numeric threshold are required.");
  const { error } = id
    ? await supabase.from("kpi_definitions").update(row).eq("id", id)
    : await supabase.from("kpi_definitions").insert(row);
  if (error) back("/admin/kpis", "error", error.message);
  revalidatePath("/admin/kpis");
  back("/admin/kpis", "ok", "KPI saved.");
}

export async function deleteKpi(form: FormData) {
  const supabase = await admin();
  const { error } = await supabase.from("kpi_definitions").delete().eq("id", str(form, "id"));
  if (error) back("/admin/kpis", "error", error.message);
  revalidatePath("/admin/kpis");
  back("/admin/kpis", "ok", "KPI deleted.");
}

export async function evaluateKpis() {
  const supabase = await admin();
  const { data, error } = await supabase.rpc("evaluate_kpis");
  if (error) back("/admin/alerts", "error", error.message);
  revalidatePath("/admin", "layout");
  back("/admin/alerts", "ok", `KPI check complete: ${data ?? 0} new alert(s).`);
}

export async function updateAlert(form: FormData) {
  const supabase = await admin();
  const profile = await requireRole("admin");
  const status = str(form, "status");
  const { error } = await supabase
    .from("alerts")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      resolved_by: status === "resolved" ? profile.id : null,
    })
    .eq("id", str(form, "id"));
  if (error) back("/admin/alerts", "error", error.message);
  revalidatePath("/admin", "layout");
  back("/admin/alerts", "ok", "Alert updated.");
}

// Settings --------------------------------------------------------------------
export async function saveSetting(form: FormData) {
  const supabase = await admin();
  const profile = await requireRole("admin");
  const key = str(form, "key");
  const raw = str(form, "value");
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    // plain string value
  }
  if (!key) back("/admin/settings", "error", "Setting key is required.");
  const { error } = await supabase.from("system_settings").upsert({ key, value, updated_by: profile.id });
  if (error) back("/admin/settings", "error", error.message);
  revalidatePath("/admin/settings");
  back("/admin/settings", "ok", `Saved "${key}".`);
}

export async function deleteSetting(form: FormData) {
  const supabase = await admin();
  const { error } = await supabase.from("system_settings").delete().eq("key", str(form, "key"));
  if (error) back("/admin/settings", "error", error.message);
  revalidatePath("/admin/settings");
  back("/admin/settings", "ok", "Setting removed.");
}

// Parent links: which students a parent account can see -------------------------
export async function linkChild(form: FormData) {
  const supabase = await admin();
  const parentId = str(form, "parent_id");
  const path = `/admin/users/${parentId}`;
  const { error } = await supabase.from("parent_students").insert({ parent_id: parentId, student_id: str(form, "student_id") });
  if (error) back(path, "error", error.code === "23505" ? "That child is already linked." : error.message);
  revalidatePath(path);
  back(path, "ok", "Child linked. The parent now sees what this student sees.");
}

export async function unlinkChild(form: FormData) {
  const supabase = await admin();
  const parentId = str(form, "parent_id");
  const path = `/admin/users/${parentId}`;
  const { error } = await supabase.from("parent_students").delete().eq("parent_id", parentId).eq("student_id", str(form, "student_id"));
  if (error) back(path, "error", error.message);
  revalidatePath(path);
  back(path, "ok", "Child unlinked.");
}
