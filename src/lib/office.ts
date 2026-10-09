import type { SupabaseClient } from "@supabase/supabase-js";

/** Currency code from system settings (seeded as PKR). */
export async function getCurrency(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.from("system_settings").select("value").eq("key", "currency").maybeSingle();
  return typeof data?.value === "string" && data.value ? data.value : "PKR";
}

export interface CertificateListRow {
  id: string;
  list_no: string;
  title: string;
  course_id: string | null;
  kind: string;
  criteria: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  course: { title: string } | null;
  preparer: { full_name: string } | null;
  reviewer: { full_name: string; role: string } | null;
}

export const CERTIFICATE_LIST_SELECT =
  "id, list_no, title, course_id, kind, criteria, status, submitted_at, reviewed_at, review_note, created_at, updated_at, " +
  "course:courses(title), preparer:profiles!certificate_lists_prepared_by_fkey(full_name), " +
  "reviewer:profiles!certificate_lists_reviewed_by_fkey(full_name, role)";

export interface CertificateEntryRow {
  student_id: string;
  completion_rate: number | null;
  attendance_rate: number | null;
  outstanding_fees: number | null;
  exam_average: number | null;
  final_percentage: number | null;
  final_grade: string | null;
  note: string;
  certificate_id: string | null;
  student: { full_name: string; user_code: string | null; email: string } | null;
  certificate: { certificate_no: string; status: string } | null;
}

export const CERTIFICATE_ENTRY_SELECT =
  "student_id, completion_rate, attendance_rate, outstanding_fees, exam_average, final_percentage, final_grade, note, certificate_id, " +
  "student:profiles!certificate_list_entries_student_id_fkey(full_name, user_code, email), " +
  "certificate:certificates!certificate_list_entries_certificate_id_fkey(certificate_no, status)";
