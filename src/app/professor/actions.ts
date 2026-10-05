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

// Courses ---------------------------------------------------------------------
export async function createCourse(form: FormData) {
  const { profile, supabase } = await professor();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      professor_id: profile.id,
      title: str(form, "title"),
      description: str(form, "description"),
      category_id: str(form, "category_id") || null,
    })
    .select("id")
    .single();
  if (error) back("/professor/courses", "error", error.message);
  revalidatePath("/professor", "layout");
  redirect(coursePath(data.id));
}

export async function updateCourse(form: FormData) {
  const { supabase } = await professor();
  const id = str(form, "id");
  const { error } = await supabase
    .from("courses")
    .update({
      title: str(form, "title"),
      description: str(form, "description"),
      outline: str(form, "outline"),
      category_id: str(form, "category_id") || null,
    })
    .eq("id", id);
  if (error) back(coursePath(id), "error", error.message);
  done(coursePath(id), "Course saved.");
}

/** Workflow transitions; the database trigger enforces which ones a professor may make. */
export async function setCourseStatus(form: FormData) {
  const { supabase } = await professor();
  const id = str(form, "id");
  const status = str(form, "status");
  const { error } = await supabase.from("courses").update({ status }).eq("id", id);
  if (error) back(coursePath(id), "error", error.message);
  const messages: Record<string, string> = {
    pending_approval: "Submitted for admin approval.",
    draft: "Moved back to draft.",
    archived: "Course archived.",
  };
  done(coursePath(id), messages[status] ?? "Status updated.");
}

export async function deleteCourse(form: FormData) {
  const { supabase } = await professor();
  const id = str(form, "id");
  const { error, count } = await supabase.from("courses").delete({ count: "exact" }).eq("id", id);
  if (error || !count) back(coursePath(id), "error", error?.message ?? "Only draft courses can be deleted.");
  revalidatePath("/professor", "layout");
  back("/professor/courses", "ok", "Course deleted.");
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

// Students --------------------------------------------------------------------
export async function enrollStudents(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const ids = form.getAll("student_id").map(String).filter(Boolean);
  if (!ids.length) back(coursePath(courseId, "students"), "error", "Select at least one student.");
  const { error } = await supabase
    .from("enrollments")
    .upsert(ids.map((student_id) => ({ course_id: courseId, student_id })), { ignoreDuplicates: true });
  if (error) back(coursePath(courseId, "students"), "error", error.message);
  done(coursePath(courseId, "students"), `${ids.length} student(s) assigned.`);
}

export async function unenrollStudent(form: FormData) {
  const { supabase } = await professor();
  const courseId = str(form, "course_id");
  const { error } = await supabase.from("enrollments").delete().eq("course_id", courseId).eq("student_id", str(form, "student_id"));
  if (error) back(coursePath(courseId, "students"), "error", error.message);
  done(coursePath(courseId, "students"), "Student removed from course.");
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
