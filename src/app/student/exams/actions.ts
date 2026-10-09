"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

/** Answers to an online exam, accepted only while it is open. */
export async function submitExamAnswer(form: FormData) {
  const profile = await requireRole("student");
  const supabase = await createClient();
  const { error } = await supabase.from("exam_submissions").upsert(
    { exam_id: str(form, "exam_id"), student_id: profile.id, answer: str(form, "answer"), link_url: str(form, "link_url") || null },
    { onConflict: "exam_id,student_id" },
  );
  if (error) back("/student/exams", "error", error.message);
  revalidatePath("/student/exams");
  back("/student/exams", "ok", "Answers submitted. You can resubmit until the exam ends.");
}
