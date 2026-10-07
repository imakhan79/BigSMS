/** Fields a student may ask to change, in display order. */
export const PROFILE_FIELDS: { key: string; label: string; type?: "date" | "tel" | "gender" | "long" }[] = [
  { key: "full_name", label: "Full name" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "date_of_birth", label: "Date of birth", type: "date" },
  { key: "gender", label: "Gender", type: "gender" },
  { key: "address", label: "Address", type: "long" },
  { key: "guardian_name", label: "Guardian name" },
  { key: "guardian_phone", label: "Guardian phone", type: "tel" },
  { key: "guardian_relation", label: "Guardian relation" },
];

export const PROFILE_FIELD_LABEL: Record<string, string> = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, f.label]));

export type ProfileRequestStatus = "submitted" | "forwarded" | "approved" | "rejected" | "withdrawn";

export interface ProfileRequest {
  id: string;
  request_no: string;
  student_id: string;
  changes: Record<string, string>;
  current_values: Record<string, string>;
  reason: string;
  status: ProfileRequestStatus;
  submitted_at: string;
  forwarded_at: string | null;
  manager_note: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  student?: { full_name: string; user_code: string | null } | null;
  forwarder?: { full_name: string } | null;
  reviewer?: { full_name: string } | null;
}

/** For the Admin Manager and the Principal, who can read the people involved. */
export const PROFILE_REQUEST_SELECT =
  "*, student:profiles!profile_change_requests_student_id_fkey(full_name, user_code), " +
  "forwarder:profiles!profile_change_requests_forwarded_by_fkey(full_name), reviewer:profiles!profile_change_requests_reviewed_by_fkey(full_name)";

/** Where a request is in the workflow: Student → Admin Manager → Principal. */
export const PROFILE_STATUS_LABEL: Record<ProfileRequestStatus, string> = {
  submitted: "with Admin Manager",
  forwarded: "with Principal",
  approved: "approved",
  rejected: "rejected",
  withdrawn: "withdrawn",
};

export function showValue(key: string, value: string | undefined | null) {
  if (!value) return "—";
  if (key === "gender") return value.charAt(0).toUpperCase() + value.slice(1);
  if (key === "date_of_birth") return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return value;
}
