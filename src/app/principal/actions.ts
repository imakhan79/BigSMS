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
