"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

// Certificate lists arrive here from the Admin Manager; approving issues the certificates.
// One action per button (formAction), as for course approvals.
export async function approveCertificateList(form: FormData) {
  return decide("approve", form);
}

export async function rejectCertificateList(form: FormData) {
  return decide("reject", form);
}

async function decide(decision: "approve" | "reject", form: FormData) {
  await requireRole("principal");
  const id = str(form, "id");
  const path = `/principal/certificates/${id}`;
  const note = str(form, "review_note");
  if (decision === "reject" && !note) back(path, "error", "Give a reason when returning a list.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_certificate_list", { p_list_id: id, p_decision: decision, p_note: note || null });
  if (error) back(path, "error", error.message);
  revalidatePath("/principal", "layout");
  back(path, "ok", decision === "approve" ? "List approved. Certificates have been issued." : "List returned to the Admin Manager.");
}

// Changes to submitted results, requested by Faculty. Approving applies the change.
export async function approveResultChange(form: FormData) {
  return decideResultChange("approve", form);
}

export async function rejectResultChange(form: FormData) {
  return decideResultChange("reject", form);
}

async function decideResultChange(decision: "approve" | "reject", form: FormData) {
  await requireRole("principal");
  const id = str(form, "id");
  const path = `/principal/changes/${id}`;
  const note = str(form, "review_note");
  if (decision === "reject" && !note) back(path, "error", "Give a reason when rejecting a change.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_result_change", { p_change_id: id, p_decision: decision, p_note: note || null });
  if (error) back(path, "error", error.message);
  revalidatePath("/principal", "layout");
  back(path, "ok", decision === "approve" ? "Change approved and applied." : "Change rejected. Faculty have been told why.");
}

// Student profile changes, forwarded by the Admin Manager. Approving updates the profile.
export async function approveProfileChange(form: FormData) {
  return decideProfileChange("approve", form);
}

export async function rejectProfileChange(form: FormData) {
  return decideProfileChange("reject", form);
}

async function decideProfileChange(decision: "approve" | "reject", form: FormData) {
  await requireRole("principal");
  const id = str(form, "id");
  const path = `/principal/profile-requests/${id}`;
  const note = str(form, "review_note");
  if (decision === "reject" && !note) back(path, "error", "Give a reason when rejecting a request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_profile_change", { p_request_id: id, p_decision: decision, p_note: note || null });
  if (error) back(path, "error", error.message);
  revalidatePath("/principal", "layout");
  back(path, "ok", decision === "approve" ? "Approved. The student's profile has been updated." : "Request rejected. The student has been told why.");
}
