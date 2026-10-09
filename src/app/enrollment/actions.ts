"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

/**
 * Student enrollment: Admin -> Student Enrollment -> Principal Approval. The database enforces
 * the workflow (submit_enrollments, resubmit_enrollment, withdraw_enrollment and
 * review_enrollments in the student enrollment migration); these actions only shape requests.
 */
async function office() {
  await requireRole("admin", "admin_manager");
  return createClient();
}

function done(path: string, message: string): never {
  revalidatePath("/", "layout");
  back(path, "ok", message);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export async function submitEnrollment(form: FormData) {
  const supabase = await office();
  const path = str(form, "back") || "/enrollment";
  const studentIds = form.getAll("student_id").map(String).filter(Boolean);
  const courseId = str(form, "course_id");
  if (!courseId || !studentIds.length) back(path, "error", "Choose a course and at least one student.");
  const { data, error } = await supabase.rpc("submit_enrollments", {
    p_student_ids: studentIds,
    p_course_id: courseId,
    p_batch_id: str(form, "batch_id") || null,
    p_note: str(form, "note"),
  });
  if (error) back(path, "error", error.message);
  done(path, `${plural(data as number, "enrollment")} sent to the Principal for approval.`);
}

export async function resubmitEnrollment(form: FormData) {
  const supabase = await office();
  const path = str(form, "back") || "/enrollment";
  const { error } = await supabase.rpc("resubmit_enrollment", {
    p_request_id: str(form, "id"),
    p_course_id: str(form, "course_id"),
    p_batch_id: str(form, "batch_id") || null,
    p_note: str(form, "note"),
  });
  if (error) back(path, "error", error.message);
  done(path, "Enrollment updated and sent to the Principal for approval.");
}

export async function withdrawEnrollment(form: FormData) {
  const supabase = await office();
  const path = str(form, "back") || "/enrollment";
  const { error } = await supabase.rpc("withdraw_enrollment", { p_request_id: str(form, "id") });
  if (error) back(path, "error", error.message);
  done(path, "Enrollment request withdrawn.");
}

export async function unenrollStudent(form: FormData) {
  const supabase = await office();
  const path = str(form, "back") || "/enrollment/enrolled";
  const { error } = await supabase.from("enrollments").delete().eq("course_id", str(form, "course_id")).eq("student_id", str(form, "student_id"));
  if (error) back(path, "error", error.message);
  done(path, "Student removed from the course.");
}

// Principal ----------------------------------------------------------------------------------
async function decide(decision: "approve" | "reject", form: FormData) {
  await requireRole("principal");
  const supabase = await createClient();
  const path = "/enrollment";
  const ids = form.getAll("request_id").map(String).filter(Boolean);
  if (!ids.length) back(path, "error", "Tick at least one enrollment.");
  const note = str(form, "review_note");
  if (decision === "reject" && !note) back(path, "error", "Give a reason when rejecting an enrollment.");
  const { data, error } = await supabase.rpc("review_enrollments", { p_request_ids: ids, p_decision: decision, p_note: note || null });
  if (error) back(path, "error", error.message);
  done(path, `${plural(data as number, "enrollment")} ${decision === "approve" ? "approved" : "rejected"}.`);
}

// One action per button (formAction), as with course approvals.
export async function approveEnrollments(form: FormData) {
  return decide("approve", form);
}

export async function rejectEnrollments(form: FormData) {
  return decide("reject", form);
}

// Batches ------------------------------------------------------------------------------------
export async function saveBatch(form: FormData) {
  await requireRole("admin", "admin_manager", "principal");
  const supabase = await createClient();
  const path = str(form, "back") || "/enrollment/batches";
  const id = str(form, "id");
  const capacity = str(form, "capacity");
  const row = {
    name: str(form, "name"),
    starts_on: str(form, "starts_on") || null,
    ends_on: str(form, "ends_on") || null,
    capacity: capacity ? Number(capacity) : null,
    status: str(form, "status") || "open",
  };
  const { error } = id
    ? await supabase.from("course_batches").update(row).eq("id", id)
    : await supabase.from("course_batches").insert({ ...row, course_id: str(form, "course_id") });
  if (error) back(path, "error", error.code === "23505" ? "That course already has a batch with this name." : error.message);
  done(path, id ? "Batch saved." : "Batch created.");
}
