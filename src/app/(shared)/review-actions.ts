"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

/**
 * Course approval decisions go through the review_course() RPC, which applies the
 * configured approval steps (e.g. Admin → Principal). Only admins archive or restore.
 * The guard_course_update trigger enforces the same rules in the database.
 */
async function reviewer() {
  const profile = await requireRole("admin", "principal");
  return { profile, base: profile.role === "principal" ? "/principal/courses" : "/admin/courses" };
}

// Approve/Reject use one action per button (formAction) instead of the clicked
// button's name/value, which was not reaching the server.
export async function approveCourse(form: FormData) {
  return decide("approve", form);
}

export async function rejectCourse(form: FormData) {
  return decide("reject", form);
}

async function decide(decision: "approve" | "reject", form: FormData) {
  const { base } = await reviewer();
  const note = str(form, "review_note");
  if (decision === "reject" && !note) back(base, "error", "Give a reason when rejecting a course.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_course", {
    p_course_id: str(form, "id"),
    p_decision: decision,
    p_note: note || null,
  });
  if (error) back(base, "error", error.message);

  revalidatePath("/", "layout");
  const messages: Record<string, string> = {
    published: "Course approved and published.",
    advanced: "Course approved and sent to the next approval step.",
    rejected: "Course rejected.",
  };
  back(base, "ok", messages[data as string] ?? "Review saved.");
}

/** Archive or restore (admins and super admins only). */
export async function reviewCourse(form: FormData) {
  const { profile, base } = await reviewer();
  const decision = str(form, "decision");
  if (profile.role === "principal" || !["archived", "draft"].includes(decision)) back(base, "error", "That action is not allowed.");

  const supabase = await createClient();
  const { error } = await supabase.from("courses").update({ status: decision }).eq("id", str(form, "id"));
  if (error) back(base, "error", error.message);

  revalidatePath("/", "layout");
  back(base, "ok", decision === "archived" ? "Course archived." : "Course restored to draft.");
}
