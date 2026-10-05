"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
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
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: str(form, "full_name") }).eq("id", profile.id);
  if (error) back("/profile", "error", error.message);
  revalidatePath("/", "layout");
  back("/profile", "ok", "Profile updated.");
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
