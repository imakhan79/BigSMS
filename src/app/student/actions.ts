"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

async function student() {
  const profile = await requireRole("student");
  return { profile, supabase: await createClient() };
}

export async function toggleLecture(form: FormData) {
  const { profile, supabase } = await student();
  const courseId = str(form, "course_id");
  const lectureId = str(form, "lecture_id");
  const { error } =
    str(form, "done") === "true"
      ? await supabase.from("lecture_progress").delete().eq("student_id", profile.id).eq("lecture_id", lectureId)
      : await supabase.from("lecture_progress").insert({ student_id: profile.id, lecture_id: lectureId, course_id: courseId });
  if (error) back(`/student/courses/${courseId}`, "error", error.message);
  revalidatePath(`/student/courses/${courseId}`);
}

export async function submitAssignment(form: FormData) {
  const { profile, supabase } = await student();
  const courseId = str(form, "course_id");
  const { error } = await supabase.from("submissions").upsert(
    {
      assignment_id: str(form, "assignment_id"),
      student_id: profile.id,
      content: str(form, "content"),
      link_url: str(form, "link_url") || null,
    },
    { onConflict: "assignment_id,student_id" },
  );
  if (error) back(`/student/courses/${courseId}?tab=assignments`, "error", error.message);
  revalidatePath(`/student/courses/${courseId}`);
  back(`/student/courses/${courseId}?tab=assignments`, "ok", "Assignment submitted.");
}

export async function submitQuiz(form: FormData) {
  const { supabase } = await student();
  const quizId = str(form, "quiz_id");
  const courseId = str(form, "course_id");
  const answers: Record<string, number> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("q_")) answers[key.slice(2)] = Number(value);
  }
  const { data, error } = await supabase.rpc("submit_quiz", { p_quiz_id: quizId, p_answers: answers });
  if (error) back(`/student/quizzes/${quizId}`, "error", error.message);
  revalidatePath(`/student/courses/${courseId}`);
  back(`/student/courses/${courseId}?tab=quizzes`, "ok", `Quiz submitted: ${data.score}/${data.total}.`);
}
