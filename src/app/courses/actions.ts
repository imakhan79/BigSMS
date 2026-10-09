"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

/**
 * Course management for the Principal, the Admin Manager and Faculty. The database enforces
 * who may do what (RLS, the guard_course trigger and the workflow functions in the course
 * management migration); these actions only shape the requests.
 */
async function editor() {
  const profile = await requireRole("principal", "admin_manager", "professor");
  return { profile, supabase: await createClient() };
}

function coursePath(role: string, id: string) {
  return role === "professor" ? `/professor/courses/${id}` : `/courses/${id}`;
}

function done(path: string, message: string): never {
  revalidatePath("/", "layout");
  back(path, "ok", message);
}

function number(form: FormData, key: string) {
  const v = str(form, key);
  return v === "" ? null : Number(v);
}

function courseFields(form: FormData) {
  return {
    title: str(form, "title"),
    code: str(form, "code"),
    description: str(form, "description"),
    outline: str(form, "outline"),
    curriculum: str(form, "curriculum"),
    duration_value: number(form, "duration_value"),
    duration_unit: str(form, "duration_unit") || "weeks",
    fee: number(form, "fee"),
    category_id: str(form, "category_id") || null,
  };
}

function friendly(message: string) {
  return message.includes("courses_code_key") ? "That Course ID is already used by another course." : message;
}

/** Create a draft. Faculty always create courses for themselves. */
export async function createCourse(form: FormData) {
  const { profile, supabase } = await editor();
  const failPath = str(form, "back") || (profile.role === "professor" ? "/professor/courses" : "/courses/new");
  const professorId = profile.role === "professor" ? profile.id : str(form, "professor_id");
  if (!professorId) back(failPath, "error", "Choose the course faculty.");
  const { data, error } = await supabase
    .from("courses")
    .insert({ ...courseFields(form), professor_id: professorId })
    .select("id, code")
    .single();
  if (error) back(failPath, "error", friendly(error.message));
  revalidatePath("/", "layout");
  redirect(`${coursePath(profile.role, data.id)}?ok=${encodeURIComponent(`Draft ${data.code} created.`)}`);
}

/** Save course information. On a published course the changes wait in the Edit stage. */
export async function updateCourse(form: FormData) {
  const { profile, supabase } = await editor();
  const id = str(form, "id");
  const path = coursePath(profile.role, id);
  const row: Record<string, unknown> = courseFields(form);
  if (profile.role !== "professor" && str(form, "professor_id")) row.professor_id = str(form, "professor_id");
  const { data, error } = await supabase.from("courses").update(row).eq("id", id).select("status, editing").single();
  if (error) back(path, "error", friendly(error.message));
  if (data.status === "published") {
    done(path, data.editing
      ? "Changes saved. Students see them once the changes are published."
      : "No differences from the published course, so there is nothing to publish.");
  }
  done(path, "Course saved.");
}

export async function setCourseReady(form: FormData) {
  const { profile, supabase } = await editor();
  const id = str(form, "id");
  const ready = str(form, "ready") === "true";
  const { error } = await supabase.rpc("set_course_ready", { p_course_id: id, p_ready: ready });
  if (error) back(coursePath(profile.role, id), "error", error.message);
  done(coursePath(profile.role, id), ready ? "Marked ready. The Principal and Admin Manager have been notified." : "No longer marked ready.");
}

export async function discardCourseChanges(form: FormData) {
  const { profile, supabase } = await editor();
  const id = str(form, "id");
  const { error } = await supabase.rpc("discard_course_changes", { p_course_id: id });
  if (error) back(coursePath(profile.role, id), "error", error.message);
  done(coursePath(profile.role, id), "Changes discarded. The published course is unchanged.");
}

export async function deleteCourse(form: FormData) {
  const { profile, supabase } = await editor();
  const id = str(form, "id");
  const { error, count } = await supabase.from("courses").delete({ count: "exact" }).eq("id", id);
  if (error || !count) back(coursePath(profile.role, id), "error", error?.message ?? "Only drafts that were never published can be deleted. Archive it instead.");
  done(profile.role === "professor" ? "/professor/courses" : "/courses", "Draft deleted.");
}

// Principal and Admin Manager only --------------------------------------------------------
async function manager() {
  await requireRole("principal", "admin_manager");
  return createClient();
}

async function workflow(fn: "publish_course" | "archive_course" | "restore_course", form: FormData, message: string) {
  const supabase = await manager();
  const id = str(form, "id");
  const path = str(form, "back") || `/courses/${id}`;
  const { error } = await supabase.rpc(fn, { p_course_id: id });
  if (error) back(path, "error", error.message);
  done(path, message);
}

export async function publishCourse(form: FormData) {
  return workflow("publish_course", form, "Course published.");
}

export async function archiveCourse(form: FormData) {
  return workflow("archive_course", form, "Course archived. Students no longer see it.");
}

export async function restoreCourse(form: FormData) {
  return workflow("restore_course", form, "Course restored to Draft.");
}
