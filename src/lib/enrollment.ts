export type EnrollmentRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

export const ENROLLMENT_STATUSES: EnrollmentRequestStatus[] = ["pending", "rejected", "approved", "withdrawn"];

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentRequestStatus, string> = {
  pending: "Awaiting Principal",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export interface EnrollmentRequestRow {
  id: string;
  request_no: string;
  student_id: string;
  course_id: string;
  batch_id: string | null;
  note: string;
  status: EnrollmentRequestStatus;
  submitted_at: string;
  resubmissions: number;
  reviewed_at: string | null;
  review_note: string | null;
  student: { full_name: string; user_code: string | null } | null;
  course: { code: string; title: string } | null;
  batch: { name: string } | null;
  submitter: { full_name: string } | null;
  reviewer: { full_name: string } | null;
}

export const ENROLLMENT_REQUEST_SELECT =
  "id, request_no, student_id, course_id, batch_id, note, status, submitted_at, resubmissions, reviewed_at, review_note, " +
  "student:profiles!enrollment_requests_student_id_fkey(full_name, user_code), course:courses(code, title), " +
  "batch:course_batches(name), submitter:profiles!enrollment_requests_submitted_by_fkey(full_name), " +
  "reviewer:profiles!enrollment_requests_reviewed_by_fkey(full_name)";

export interface BatchOption {
  id: string;
  course_id: string;
  name: string;
  status: string;
  starts_on: string | null;
  capacity: number | null;
}
