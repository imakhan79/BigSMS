"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

function basePath(form: FormData) {
  const path = str(form, "base");
  return path === "/admin/question-bank" ? path : "/professor/question-bank";
}

export async function saveQuestion(form: FormData) {
  const profile = await requireRole("admin", "professor");
  const path = basePath(form);
  const options = str(form, "options").split("\n").map((o) => o.trim()).filter(Boolean);
  const correct = Number(str(form, "correct_index")) - 1;
  if (options.length < 2 || options.length > 6) back(path, "error", "Enter 2–6 options, one per line.");
  if (!(correct >= 0 && correct < options.length)) back(path, "error", "Correct option number is out of range.");

  const row = {
    prompt: str(form, "prompt"),
    options,
    correct_index: correct,
    difficulty: str(form, "difficulty") || "medium",
    category_id: str(form, "category_id") || null,
  };
  const supabase = await createClient();
  const id = str(form, "id");
  const { error } = id
    ? await supabase.from("questions").update(row).eq("id", id)
    : await supabase.from("questions").insert({ ...row, created_by: profile.id });
  if (error) back(path, "error", error.message);
  revalidatePath(path);
  back(path, "ok", "Question saved.");
}

export async function deleteQuestion(form: FormData) {
  await requireRole("admin", "professor");
  const path = basePath(form);
  const supabase = await createClient();
  const { error, count } = await supabase.from("questions").delete({ count: "exact" }).eq("id", str(form, "id"));
  if (error) back(path, "error", error.message);
  if (!count) back(path, "error", "You can only delete your own questions.");
  revalidatePath(path);
  back(path, "ok", "Question deleted.");
}
