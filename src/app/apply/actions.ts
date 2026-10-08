"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

/** Public admission form. submit_application() validates and caps every field. */
export async function submitApplication(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_application", {
    p_full_name: str(form, "full_name"),
    p_email: str(form, "email"),
    p_phone: str(form, "phone"),
    p_date_of_birth: str(form, "date_of_birth") || null,
    p_gender: str(form, "gender"),
    p_address: str(form, "address"),
    p_guardian_name: str(form, "guardian_name"),
    p_guardian_phone: str(form, "guardian_phone"),
    p_guardian_relation: str(form, "guardian_relation"),
    p_previous_school: str(form, "previous_school"),
    p_program: str(form, "program"),
    p_statement: str(form, "statement"),
  });
  if (error) back("/apply", "error", error.message);
  redirect(`/apply?no=${encodeURIComponent(data)}`);
}
