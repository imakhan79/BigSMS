"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

async function professor() {
  const profile = await requireRole("professor");
  return { profile, supabase: await createClient() };
}

const coursePath = (id: string, tab?: string) => `/professor/courses/${id}${tab ? `?tab=${tab}` : ""}`;

function done(path: string, message: string): never {
  revalidatePath("/professor", "layout");
  back(path, "ok", message);
}

// Lectures and materials ------------------------------------------------------
export async function saveLecture(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const id = str(form, "id");
  const row = { title: str(form, "title"), content: str(form, "content"), position: Number(str(form, "position")) || 0 };
  const { error } = id
    ? await supabase.from("lectures").update(row).eq("id", id)
    : await supabase.from("lectures").insert({ ...row, course_id: courseId });
  if (error) back(coursePath(courseId, "lectures"), "error", error.message);
  done(coursePath(courseId, "lectures"), "Lecture saved.");
}

export async function deleteLecture(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const { error } = await supabase.from("lectures").delete().eq("id", str(form, "id"));
  if (error) back(coursePath(courseId, "lectures"), "error", error.message);
  done(coursePath(courseId, "lectures"), "Lecture deleted.");
}

export async function addMaterial(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const path = coursePath(courseId, "lectures");
  const file = form.get("file");
  const externalUrl = str(form, "external_url");
  let filePath: string | null = null;

  if (file instanceof File && file.size > 0) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    filePath = `${courseId}/${randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from("course-materials").upload(filePath, file, { contentType: file.type });
    if (error) back(path, "error", `Upload failed: ${error.message}`);
  } else if (!externalUrl) {
    back(path, "error", "Upload a file or provide a link.");
  }

  const { error } = await supabase.from("materials").insert({
    course_id: courseId,
    lecture_id: str(form, "lecture_id") || null,
    type: str(form, "type"),
    title: str(form, "title") || (file instanceof File ? file.name : "Material"),
    file_path: filePath,
    external_url: externalUrl || null,
  });
  if (error) back(path, "error", error.message);
  done(path, "Material added.");
}

export async function deleteMaterial(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const filePath = str(form, "file_path");
  const { error } = await supabase.from("materials").delete().eq("id", str(form, "id"));
  if (error) back(coursePath(courseId, "lectures"), "error", error.message);
  if (filePath) await supabase.storage.from("course-materials").remove([filePath]);
  done(coursePath(courseId, "lectures"), "Material removed.");
}

// Assignments -----------------------------------------------------------------
export async function saveAssignment(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const due = str(form, "due_at");
  const { error } = await supabase.from("assignments").insert({
    course_id: courseId,
    title: str(form, "title"),
    instructions: str(form, "instructions"),
    due_at: due ? new Date(due).toISOString() : null,
    max_score: Number(str(form, "max_score")) || 100,
    published: form.get("published") === "on",
  });
  if (error) back(coursePath(courseId, "assignments"), "error", error.message);
  done(coursePath(courseId, "assignments"), "Assignment created.");
}

export async function toggleAssignment(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const { error } = await supabase.from("assignments").update({ published: str(form, "published") === "true" }).eq("id", str(form, "id"));
  if (error) back(coursePath(courseId, "assignments"), "error", error.message);
  done(coursePath(courseId, "assignments"), "Assignment updated.");
}

export async function deleteAssignment(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const { error } = await supabase.from("assignments").delete().eq("id", str(form, "id"));
  if (error) back(coursePath(courseId, "assignments"), "error", error.message);
  done(coursePath(courseId, "assignments"), "Assignment deleted.");
}

export async function gradeSubmission(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const score = Number(str(form, "score"));
  const max = Number(str(form, "max_score"));
  if (Number.isNaN(score) || score < 0 || score > max) back(coursePath(courseId, "assignments"), "error", `Score must be between 0 and ${max}.`);
  const { error } = await supabase
    .from("submissions")
    .update({ score, feedback: str(form, "feedback") || null, status: "graded" })
    .eq("id", str(form, "id"));
  if (error) back(coursePath(courseId, "assignments"), "error", error.message);
  done(coursePath(courseId, "assignments"), "Submission graded.");
}

// Quizzes ---------------------------------------------------------------------
export async function createQuiz(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const { data, error } = await supabase
    .from("quizzes")
    .insert({ course_id: courseId, title: str(form, "title"), description: str(form, "description") })
    .select("id")
    .single();
  if (error) back(coursePath(courseId, "quizzes"), "error", error.message);
  done(`${coursePath(courseId, "quizzes")}&quiz=${data.id}`, "Quiz created. Now select questions from the bank.");
}

export async function setQuizQuestions(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const quizId = str(form, "quiz_id");
  const path = `${coursePath(courseId, "quizzes")}&quiz=${quizId}`;
  const ids = form.getAll("question_id").map(String);

  const { error: delError } = await supabase.from("quiz_questions").delete().eq("quiz_id", quizId);
  if (delError) back(path, "error", delError.message);
  if (ids.length) {
    const { error } = await supabase
      .from("quiz_questions")
      .insert(ids.map((question_id, position) => ({ quiz_id: quizId, question_id, position })));
    if (error) back(path, "error", error.message);
  }
  done(path, `${ids.length} question(s) selected.`);
}

export async function toggleQuiz(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const publish = str(form, "published") === "true";
  if (publish) {
    const { count } = await supabase.from("quiz_questions").select("*", { count: "exact", head: true }).eq("quiz_id", str(form, "id"));
    if (!count) back(coursePath(courseId, "quizzes"), "error", "Add at least one question before publishing.");
  }
  const { error } = await supabase.from("quizzes").update({ published: publish }).eq("id", str(form, "id"));
  if (error) back(coursePath(courseId, "quizzes"), "error", error.message);
  done(coursePath(courseId, "quizzes"), publish ? "Quiz published." : "Quiz unpublished.");
}

export async function deleteQuiz(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const { error } = await supabase.from("quizzes").delete().eq("id", str(form, "id"));
  if (error) back(coursePath(courseId, "quizzes"), "error", error.message);
  done(coursePath(courseId, "quizzes"), "Quiz deleted.");
}

// Assignment submission status ------------------------------------------------
/** Records a status for a student who did not submit online: handed in, missing or excused. */
export async function setSubmissionStatus(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const path = coursePath(courseId, "assignments");
  const status = str(form, "status");
  const id = str(form, "submission_id");
  const { error } = id
    ? await supabase.from("submissions").update({ status }).eq("id", id)
    : await supabase.from("submissions").insert({ assignment_id: str(form, "assignment_id"), student_id: str(form, "student_id"), status, content: "" });
  if (error) back(path, "error", error.message);
  done(path, "Submission status recorded.");
}

// Attendance --------------------------------------------------------------------
const attendancePath = (courseId: string, sessionId?: string) =>
  `${coursePath(courseId, "attendance")}${sessionId ? `&session=${sessionId}` : ""}`;

export async function createAttendanceSession(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const { data, error } = await supabase
    .from("attendance_sessions")
    .insert({ course_id: courseId, held_on: str(form, "held_on"), topic: str(form, "topic") })
    .select("id")
    .single();
  if (error) back(attendancePath(courseId), "error", error.message);
  revalidatePath("/professor", "layout");
  redirect(attendancePath(courseId, data.id));
}

export async function deleteAttendanceSession(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const { error } = await supabase.from("attendance_sessions").delete().eq("id", str(form, "session_id"));
  if (error) back(attendancePath(courseId), "error", error.message);
  done(attendancePath(courseId), "Draft register deleted.");
}

async function writeAttendance(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const sessionId = str(form, "session_id");
  const rows = form
    .getAll("student_id")
    .map(String)
    .map((student_id) => ({ session_id: sessionId, student_id, status: str(form, `status_${student_id}`), note: str(form, `note_${student_id}`) }))
    .filter((r) => r.status);
  if (rows.length) {
    const { error } = await supabase.from("attendance_records").upsert(rows, { onConflict: "session_id,student_id" });
    if (error) back(attendancePath(courseId, sessionId), "error", error.message);
  }
  return { supabase, courseId, sessionId };
}

export async function saveAttendance(form: FormData) {
  const { courseId, sessionId } = await writeAttendance(form);
  done(attendancePath(courseId, sessionId), "Register saved as a draft.");
}

export async function submitAttendance(form: FormData) {
  const { supabase, courseId, sessionId } = await writeAttendance(form);
  const { error } = await supabase.rpc("submit_attendance", { p_session_id: sessionId });
  if (error) back(attendancePath(courseId, sessionId), "error", error.message);
  done(attendancePath(courseId, sessionId), "Attendance submitted. Further changes need the Principal's approval.");
}

// Exams and marks ---------------------------------------------------------------
const examPath = (courseId: string, examId?: string) => `${coursePath(courseId, "exams")}${examId ? `&exam=${examId}` : ""}`;

export async function createExam(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const { data, error } = await supabase
    .from("exams")
    .insert({
      course_id: courseId,
      title: str(form, "title"),
      kind: str(form, "kind") || "class_test",
      held_on: str(form, "held_on"),
      max_marks: Number(str(form, "max_marks")) || 100,
    })
    .select("id")
    .single();
  if (error) back(examPath(courseId), "error", error.message);
  revalidatePath("/professor", "layout");
  redirect(examPath(courseId, data.id));
}

export async function deleteExam(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const { error } = await supabase.from("exams").delete().eq("id", str(form, "exam_id"));
  if (error) back(examPath(courseId), "error", error.message);
  done(examPath(courseId), "Exam deleted.");
}

async function writeExamResults(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const examId = str(form, "exam_id");
  const path = examPath(courseId, examId);
  const rows = [];
  for (const studentId of form.getAll("student_id").map(String)) {
    const absent = form.get(`absent_${studentId}`) === "on";
    const raw = str(form, `marks_${studentId}`);
    if (!absent && !raw) continue;
    const marks = absent ? null : Number(raw);
    if (marks != null && (Number.isNaN(marks) || marks < 0)) back(path, "error", "Marks must be a number of 0 or more.");
    rows.push({ exam_id: examId, student_id: studentId, marks, absent, remarks: str(form, `remarks_${studentId}`) });
  }
  if (rows.length) {
    const { error } = await supabase.from("exam_results").upsert(rows, { onConflict: "exam_id,student_id" });
    if (error) back(path, "error", error.message);
  }
  return { supabase, examId, path };
}

export async function saveExamResults(form: FormData) {
  const { path } = await writeExamResults(form);
  done(path, "Marks saved as a draft.");
}

export async function submitExamResults(form: FormData) {
  const { supabase, examId, path } = await writeExamResults(form);
  const { error } = await supabase.rpc("submit_exam", { p_exam_id: examId });
  if (error) back(path, "error", error.message);
  done(path, "Exam results submitted. Further changes need the Principal's approval.");
}

// Final report ------------------------------------------------------------------
async function writeFinalReports(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const path = coursePath(courseId, "report");
  const rows = [];
  for (const studentId of form.getAll("student_id").map(String)) {
    const raw = str(form, `percentage_${studentId}`);
    const grade = str(form, `grade_${studentId}`);
    const remarks = str(form, `remarks_${studentId}`);
    if (!raw && !grade && !remarks) continue;
    const percentage = raw ? Number(raw) : null;
    if (percentage != null && (Number.isNaN(percentage) || percentage < 0 || percentage > 100)) back(path, "error", "Percentages must be between 0 and 100.");
    rows.push({ course_id: courseId, student_id: studentId, percentage, grade, remarks });
  }
  if (rows.length) {
    const { error } = await supabase.from("final_reports").upsert(rows, { onConflict: "course_id,student_id" });
    if (error) back(path, "error", error.message);
  }
  return { supabase, courseId, path };
}

export async function saveFinalReports(form: FormData) {
  const { path } = await writeFinalReports(form);
  done(path, "Final report saved as a draft.");
}

export async function submitFinalReports(form: FormData) {
  const { supabase, courseId, path } = await writeFinalReports(form);
  const { data, error } = await supabase.rpc("submit_final_reports", { p_course_id: courseId });
  if (error) back(path, "error", error.message);
  done(path, `Final report submitted for ${data} student(s). Further changes need the Principal's approval.`);
}

// Changes to submitted results (approved by the Principal) -----------------------
const CHANGE_FIELDS: Record<string, string[]> = {
  attendance: ["status", "note"],
  exam_result: ["marks", "absent", "remarks"],
  assignment_grade: ["score", "feedback"],
  final_report: ["percentage", "grade", "remarks"],
};

export async function requestResultChange(form: FormData) {
  const { supabase } = await professor();
  const kind = str(form, "kind");
  const returnTo = str(form, "return_to");
  const path = returnTo.startsWith("/professor/") ? returnTo : "/professor/changes";
  const value: Record<string, string | boolean> = {};
  for (const field of CHANGE_FIELDS[kind] ?? []) value[field] = field === "absent" ? form.get("absent") === "on" : str(form, field);
  const { error } = await supabase.rpc("request_result_change", {
    p_kind: kind,
    p_target_id: str(form, "target_id"),
    p_student_id: str(form, "student_id"),
    p_new: value,
    p_reason: str(form, "reason"),
  });
  if (error) back(path, "error", error.message);
  done(path, "Change requested. It takes effect once the Principal approves it.");
}

export async function withdrawResultChange(form: FormData) {
  const { supabase } = await professor();
  const { error } = await supabase.rpc("withdraw_result_change", { p_change_id: str(form, "id") });
  if (error) back("/professor/changes", "error", error.message);
  done("/professor/changes", "Request withdrawn.");
}
