"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

/** The Principal approves exam results (publishing them to students) or returns them with a note. */
export async function reviewExamResults(form: FormData) {
  await requireRole("principal");
  const supabase = await createClient();
  const decision = str(form, "decision");
  const { error } = await supabase.rpc("review_exam_results", { p_exam_id: str(form, "exam_id"), p_decision: decision, p_note: str(form, "note") });
  if (error) back("/principal/exams", "error", error.message);
  revalidatePath("/principal", "layout");
  back("/principal/exams", "ok", decision === "approve" ? "Results approved and published to students." : "Results returned to the Faculty.");
}
