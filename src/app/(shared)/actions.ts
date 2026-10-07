"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { PROFILE_FIELDS } from "@/lib/profileRequests";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

export async function markNotificationRead(form: FormData) {
  const profile = await requireRole();
  const supabase = await createClient();
  const id = str(form, "id");
  const query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", profile.id);
  await (id ? query.eq("id", id) : query.is("read_at", null));
  revalidatePath("/", "layout");
}

export async function updateProfile(form: FormData) {
  const profile = await requireRole();
  if (profile.role === "student") back("/profile", "error", "Students cannot edit their profile directly. Submit a change request instead.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: str(form, "full_name"), phone: str(form, "phone"), department: str(form, "department") })
    .eq("id", profile.id);
  if (error) back("/profile", "error", error.message);
  revalidatePath("/", "layout");
  back("/profile", "ok", "Profile updated.");
}

/** Student profile changes go to the Admin Manager, then need the Principal's approval. */
export async function requestProfileChange(form: FormData) {
  await requireRole("student");
  const changes = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, str(form, f.key)]));
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_profile_change", { p_changes: changes, p_reason: str(form, "reason") || null });
  if (error) back("/profile", "error", error.message);
  revalidatePath("/profile");
  back("/profile", "ok", "Request sent to the Admin Manager. Your profile changes once the Principal approves it.");
}

export async function withdrawProfileChange(form: FormData) {
  await requireRole("student");
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_profile_change", { p_request_id: str(form, "id") });
  if (error) back("/profile", "error", error.message);
  revalidatePath("/profile");
  back("/profile", "ok", "Request withdrawn.");
}

export async function changePassword(form: FormData) {
  await requireRole();
  const password = str(form, "password");
  if (password.length < 8) back("/profile", "error", "Password must be at least 8 characters.");
  if (password !== str(form, "confirm")) back("/profile", "error", "Passwords do not match.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) back("/profile", "error", error.message);
  back("/profile", "ok", "Password changed.");
}
