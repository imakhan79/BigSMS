"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

/**
 * Course approval decisions. Admins and principals may approve or reject; only admins
 * archive or restore. The guard_course_update trigger enforces the same rules in the database.
 */
export async function reviewCourse(form: FormData) {
  return applyReview(str(form, "decision"), form);
}

// Approve/Reject use one action per button (formAction) instead of the clicked
// button's name/value, which was not reaching the server.
export async function approveCourse(form: FormData) {
  return applyReview("published", form);
}

export async function rejectCourse(form: FormData) {
  return applyReview("rejected", form);
}

async function applyReview(decision: string, form: FormData) {
  const profile = await requireRole("admin", "principal");
  const base = profile.role === "admin" ? "/admin/courses" : "/principal/courses";
  const allowed = profile.role === "admin" ? ["published", "rejected", "archived", "draft"] : ["published", "rejected"];
  if (!allowed.includes(decision)) back(base, "error", "That action is not allowed.");

  const note = str(form, "review_note");
  if (decision === "rejected" && !note) back(base, "error", "Give a reason when rejecting a course.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("courses")
    .update({ status: decision, ...(note ? { review_note: note } : {}) })
    .eq("id", str(form, "id"));
  if (error) back(base, "error", error.message);

  revalidatePath("/", "layout");
  const labels: Record<string, string> = { published: "approved and published", rejected: "rejected", archived: "archived", draft: "restored to draft" };
  back(base, "ok", `Course ${labels[decision]}.`);
}
