"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

/**
 * Timetable actions for the Principal and the Admin Manager. They edit the draft; publishing
 * goes through publish_timetable() / review_timetable(), which enforce the approval rules.
 */
async function office() {
  const profile = await requireRole("principal", "admin_manager");
  return { profile, supabase: await createClient() };
}

function done(path: string, message: string): never {
  revalidatePath("/timetable", "layout");
  back(path, "ok", message);
}

export async function addSlot(form: FormData) {
  const { supabase } = await office();
  const path = "/timetable";
  const { error } = await supabase.from("timetable_slots").insert({
    course_id: str(form, "course_id"),
    batch_id: str(form, "batch_id") || null,
    weekday: Number(str(form, "weekday")),
    starts_at: str(form, "starts_at"),
    ends_at: str(form, "ends_at"),
    room: str(form, "room"),
    state: "draft",
  });
  if (error) back(path, "error", error.message.includes("timetable_slots_check") ? "The class must end after it starts." : error.message);
  done(path, "Class added to the draft timetable.");
}

export async function removeSlot(form: FormData) {
  const { supabase } = await office();
  const { error } = await supabase.from("timetable_slots").delete().eq("id", str(form, "id")).eq("state", "draft");
  if (error) back("/timetable", "error", error.message);
  done("/timetable", "Class removed from the draft timetable.");
}

export async function addEvent(form: FormData) {
  const { supabase } = await office();
  const path = "/timetable?tab=calendar";
  const starts = str(form, "starts_on");
  const { error } = await supabase.from("calendar_events").insert({
    title: str(form, "title"),
    kind: str(form, "kind") || "event",
    starts_on: starts,
    ends_on: str(form, "ends_on") || starts,
    course_id: str(form, "course_id") || null,
    notes: str(form, "notes"),
    state: "draft",
  });
  if (error) back(path, "error", error.message.includes("calendar_events_check") ? "The end date cannot be before the start date." : error.message);
  done(path, "Event added to the draft calendar.");
}

export async function removeEvent(form: FormData) {
  const { supabase } = await office();
  const { error } = await supabase.from("calendar_events").delete().eq("id", str(form, "id")).eq("state", "draft");
  if (error) back("/timetable?tab=calendar", "error", error.message);
  done("/timetable?tab=calendar", "Event removed from the draft calendar.");
}

export async function publishTimetable(form: FormData) {
  const { supabase } = await office();
  const path = "/timetable?tab=publish";
  const { data, error } = await supabase.rpc("publish_timetable", { p_note: str(form, "note") });
  if (error) back(path, "error", error.message);
  done(path, data === "published" ? "Timetable published. Faculty and students can see it now." : "Timetable sent to the Principal for approval.");
}

export async function reviewTimetable(form: FormData) {
  const { supabase } = await office();
  const path = "/timetable?tab=publish";
  const decision = str(form, "decision");
  const { error } = await supabase.rpc("review_timetable", { p_publication_id: str(form, "id"), p_decision: decision, p_note: str(form, "note") });
  if (error) back(path, "error", error.message);
  done(path, decision === "approve" ? "Approved. The timetable is published." : decision === "reject" ? "Timetable rejected." : "Publication withdrawn.");
}
