"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { PROFILE_FIELDS } from "@/lib/profileRequests";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

/**
 * Admin Manager actions. The database decides what is allowed (RLS plus the guard
 * triggers in the admin manager migration); these actions only shape the requests.
 */
async function office() {
  const profile = await requireRole("admin_manager");
  return { profile, supabase: await createClient() };
}

const optional = (form: FormData, key: string) => str(form, key) || null;

// Applications ----------------------------------------------------------------
const applicationFields = (form: FormData) => ({
  full_name: str(form, "full_name"),
  email: str(form, "email"),
  phone: str(form, "phone"),
  date_of_birth: optional(form, "date_of_birth"),
  gender: str(form, "gender"),
  address: str(form, "address"),
  guardian_name: str(form, "guardian_name"),
  guardian_phone: str(form, "guardian_phone"),
  guardian_relation: str(form, "guardian_relation"),
  previous_school: str(form, "previous_school"),
  program: str(form, "program"),
  statement: str(form, "statement"),
  fee_plan: optional(form, "fee_plan"),
  payment_method: optional(form, "payment_method"),
});

export async function recordApplication(form: FormData) {
  const { supabase } = await office();
  const { data, error } = await supabase.from("student_applications").insert(applicationFields(form)).select("id").single();
  if (error) {
    back("/manager/applications", "error", error.code === "23505" ? "An application with this email is already being processed." : error.message);
  }
  revalidatePath("/manager", "layout");
  back(`/manager/applications/${data.id}`, "ok", "Application recorded.");
}

export async function updateApplication(form: FormData) {
  const { supabase } = await office();
  const id = str(form, "id");
  const { error } = await supabase.from("student_applications").update(applicationFields(form)).eq("id", id);
  if (error) back(`/manager/applications/${id}`, "error", error.message);
  revalidatePath("/manager/applications");
  back(`/manager/applications/${id}`, "ok", "Application updated.");
}

export async function markUnderReview(form: FormData) {
  const { supabase } = await office();
  const id = str(form, "id");
  const { error } = await supabase.from("student_applications").update({ status: "under_review" }).eq("id", id);
  if (error) back(`/manager/applications/${id}`, "error", error.message);
  revalidatePath("/manager", "layout");
  back(`/manager/applications/${id}`, "ok", "Marked as under review.");
}

export async function rejectApplication(form: FormData) {
  const { supabase } = await office();
  const id = str(form, "id");
  const note = str(form, "decision_note");
  if (!note) back(`/manager/applications/${id}`, "error", "Give a reason when rejecting an application.");
  const { error } = await supabase.from("student_applications").update({ status: "rejected", decision_note: note }).eq("id", id);
  if (error) back(`/manager/applications/${id}`, "error", error.message);
  revalidatePath("/manager", "layout");
  back(`/manager/applications/${id}`, "ok", "Application rejected.");
}

export async function acceptApplication(form: FormData) {
  const { supabase } = await office();
  const id = str(form, "id");
  const { data, error } = await supabase.rpc("accept_application", {
    p_application_id: id,
    p_password: str(form, "password"),
    p_note: optional(form, "decision_note"),
  });
  if (error) back(`/manager/applications/${id}`, "error", error.message);
  revalidatePath("/manager", "layout");
  back(`/manager/students/${data}`, "ok", "Application accepted and student account created. Share the temporary password with them securely.");
}

// Students ----------------------------------------------------------------------
export async function createStudent(form: FormData) {
  const { supabase } = await office();
  const { data, error } = await supabase.rpc("admin_create_user", {
    p_email: str(form, "email"),
    p_full_name: str(form, "full_name"),
    p_role: "student",
    p_password: str(form, "password"),
    p_phone: str(form, "phone"),
    p_department: str(form, "department"),
  });
  if (error) back("/manager/students", "error", error.message);
  revalidatePath("/manager", "layout");
  back(`/manager/students/${data}`, "ok", "Student created and onboarded. Share the temporary password with them securely.");
}

export async function saveStudentDetails(form: FormData) {
  const { supabase } = await office();
  const id = str(form, "id");
  const path = `/manager/students/${id}`;
  const status = str(form, "status");
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: str(form, "full_name"), phone: str(form, "phone"), department: str(form, "department"), ...(status && { status }) })
    .eq("id", id);
  if (profileError) back(path, "error", profileError.message);

  const { error } = await supabase.from("student_records").upsert({
    student_id: id,
    date_of_birth: optional(form, "date_of_birth"),
    gender: str(form, "gender"),
    address: str(form, "address"),
    guardian_name: str(form, "guardian_name"),
    guardian_phone: str(form, "guardian_phone"),
    guardian_relation: str(form, "guardian_relation"),
    previous_school: str(form, "previous_school"),
    program: str(form, "program"),
    admitted_on: optional(form, "admitted_on"),
    fee_plan: optional(form, "fee_plan"),
    payment_method: optional(form, "payment_method"),
  });
  if (error) back(path, "error", error.message);
  revalidatePath("/manager/students");
  back(path, "ok", "Student details saved.");
}

// Documents -----------------------------------------------------------------------
export async function uploadDocument(form: FormData) {
  const { supabase } = await office();
  const studentId = str(form, "student_id");
  const path = `/manager/students/${studentId}?tab=documents`;
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) back(path, "error", "Choose a file to upload.");
  if (file.size > 10 * 1024 * 1024) back(path, "error", "Files can be up to 10 MB.");

  const filePath = `${studentId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("student-documents").upload(filePath, file, { contentType: file.type });
  if (uploadError) back(path, "error", uploadError.message);

  const { error } = await supabase.from("student_documents").insert({
    student_id: studentId,
    doc_type: str(form, "doc_type"),
    title: str(form, "title") || file.name,
    file_path: filePath,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
  });
  if (error) {
    await supabase.storage.from("student-documents").remove([filePath]);
    back(path, "error", error.message);
  }
  revalidatePath(`/manager/students/${studentId}`);
  back(path, "ok", "Document uploaded.");
}

export async function reviewDocument(form: FormData) {
  const { supabase } = await office();
  const studentId = str(form, "student_id");
  const path = `/manager/students/${studentId}?tab=documents`;
  const { error } = await supabase
    .from("student_documents")
    .update({ status: str(form, "status"), note: str(form, "note") })
    .eq("id", str(form, "id"));
  if (error) back(path, "error", error.message);
  revalidatePath(`/manager/students/${studentId}`);
  back(path, "ok", "Document updated.");
}

export async function deleteDocument(form: FormData) {
  const { supabase } = await office();
  const studentId = str(form, "student_id");
  const path = `/manager/students/${studentId}?tab=documents`;
  const { data, error } = await supabase.from("student_documents").delete().eq("id", str(form, "id")).select("file_path").single();
  if (error) back(path, "error", error.message);
  await supabase.storage.from("student-documents").remove([data.file_path]);
  revalidatePath(`/manager/students/${studentId}`);
  back(path, "ok", "Document deleted.");
}

// Enrollment ----------------------------------------------------------------------
export async function enrollStudents(form: FormData) {
  const { supabase } = await office();
  const path = str(form, "back") || "/manager/enrollment";
  const courseIds = form.getAll("course_id").map(String).filter(Boolean);
  const studentIds = form.getAll("student_id").map(String).filter(Boolean);
  if (!courseIds.length || !studentIds.length) back(path, "error", "Choose a course and at least one student.");
  const rows = courseIds.flatMap((course_id) => studentIds.map((student_id) => ({ course_id, student_id })));
  const { error } = await supabase.from("enrollments").upsert(rows, { onConflict: "course_id,student_id", ignoreDuplicates: true });
  if (error) back(path, "error", error.message);
  revalidatePath("/manager", "layout");
  back(path, "ok", rows.length === 1 ? "Student enrolled." : `${rows.length} enrollments saved.`);
}

export async function unenrollStudent(form: FormData) {
  const { supabase } = await office();
  const path = str(form, "back") || "/manager/enrollment";
  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("course_id", str(form, "course_id"))
    .eq("student_id", str(form, "student_id"));
  if (error) back(path, "error", error.message);
  revalidatePath("/manager", "layout");
  back(path, "ok", "Student removed from the course.");
}

// Certificate lists: Prepared by Admin Manager -> Approved by Principal ------------
export async function createCertificateList(form: FormData) {
  const { supabase } = await office();
  const { data, error } = await supabase
    .from("certificate_lists")
    .insert({ title: str(form, "title"), course_id: optional(form, "course_id"), kind: str(form, "kind"), criteria: str(form, "criteria") })
    .select("id")
    .single();
  if (error) back("/manager/certificates", "error", error.message);
  revalidatePath("/manager/certificates");
  back(`/manager/certificates/${data.id}`, "ok", "List created. Add the eligible students, then submit it to the Principal.");
}

export async function updateCertificateList(form: FormData) {
  const { supabase } = await office();
  const id = str(form, "id");
  const { error } = await supabase
    .from("certificate_lists")
    .update({ title: str(form, "title"), kind: str(form, "kind"), criteria: str(form, "criteria") })
    .eq("id", id);
  if (error) back(`/manager/certificates/${id}`, "error", error.message);
  revalidatePath("/manager/certificates");
  back(`/manager/certificates/${id}`, "ok", "List saved.");
}

export async function deleteCertificateList(form: FormData) {
  const { supabase } = await office();
  const { error } = await supabase.from("certificate_lists").delete().eq("id", str(form, "id"));
  if (error) back(`/manager/certificates/${str(form, "id")}`, "error", error.message);
  revalidatePath("/manager", "layout");
  back("/manager/certificates", "ok", "List deleted.");
}

export async function addListStudents(form: FormData) {
  const { supabase } = await office();
  const listId = str(form, "list_id");
  const path = `/manager/certificates/${listId}`;
  const studentIds = form.getAll("student_id").map(String).filter(Boolean);
  if (!studentIds.length) back(path, "error", "Choose at least one student.");
  const { error } = await supabase
    .from("certificate_list_entries")
    .insert(studentIds.map((student_id) => ({ list_id: listId, student_id, note: str(form, "note") })));
  if (error) back(path, "error", error.code === "23505" ? "One of those students is already on the list." : error.message);
  revalidatePath(path);
  back(path, "ok", studentIds.length === 1 ? "Student added." : `${studentIds.length} students added.`);
}

export async function removeListStudent(form: FormData) {
  const { supabase } = await office();
  const listId = str(form, "list_id");
  const path = `/manager/certificates/${listId}`;
  const { error } = await supabase.from("certificate_list_entries").delete().eq("list_id", listId).eq("student_id", str(form, "student_id"));
  if (error) back(path, "error", error.message);
  revalidatePath(path);
  back(path, "ok", "Student removed from the list.");
}

export async function submitCertificateList(form: FormData) {
  const { supabase } = await office();
  const id = str(form, "id");
  const { error } = await supabase.rpc("submit_certificate_list", { p_list_id: id });
  if (error) back(`/manager/certificates/${id}`, "error", error.message);
  revalidatePath("/manager", "layout");
  back(`/manager/certificates/${id}`, "ok", "Submitted to the Principal for approval.");
}

export async function withdrawCertificateList(form: FormData) {
  const { supabase } = await office();
  const id = str(form, "id");
  const { error } = await supabase.rpc("withdraw_certificate_list", { p_list_id: id });
  if (error) back(`/manager/certificates/${id}`, "error", error.message);
  revalidatePath("/manager", "layout");
  back(`/manager/certificates/${id}`, "ok", "Withdrawn. The list is a draft again.");
}

// Student profile change requests: forward to the Principal or return to the student ----
export async function forwardProfileChange(form: FormData) {
  const { supabase } = await office();
  const id = str(form, "id");
  const path = `/manager/profile-requests/${id}`;
  // Only the fields the student asked to change are on the form; the Admin Manager may correct them.
  const changes = Object.fromEntries(PROFILE_FIELDS.filter((f) => form.has(f.key)).map((f) => [f.key, str(form, f.key)]));
  const { error } = await supabase.rpc("process_profile_change", {
    p_request_id: id,
    p_decision: "forward",
    p_note: optional(form, "manager_note"),
    p_changes: changes,
  });
  if (error) back(path, "error", error.message);
  revalidatePath("/manager", "layout");
  back(path, "ok", "Forwarded to the Principal for approval.");
}

export async function returnProfileChange(form: FormData) {
  const { supabase } = await office();
  const id = str(form, "id");
  const path = `/manager/profile-requests/${id}`;
  const note = str(form, "manager_note");
  if (!note) back(path, "error", "Tell the student why the request is being returned.");
  const { error } = await supabase.rpc("process_profile_change", { p_request_id: id, p_decision: "return", p_note: note });
  if (error) back(path, "error", error.message);
  revalidatePath("/manager", "layout");
  back(path, "ok", "Request returned to the student.");
}
