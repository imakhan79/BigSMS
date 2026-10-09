import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** A student as Faculty see them: name and System ID only. */
export interface RosterStudent {
  course_id: string;
  student_id: string;
  full_name: string;
  user_code: string | null;
  batch_id: string | null;
  batch_name: string | null;
}

/** Students in one class, or in every class the signed-in Faculty member teaches. */
export async function getRoster(supabase: Supabase, courseId?: string): Promise<RosterStudent[]> {
  const { data } = await supabase.rpc("class_roster", courseId ? { p_course_id: courseId } : {});
  return (data ?? []) as RosterStudent[];
}

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"] as const;

export const EXAM_KINDS: Record<string, string> = {
  class_test: "Class test",
  midterm: "Midterm",
  final: "Final exam",
  practical: "Practical",
  other: "Other",
};

export const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  graded: "Graded",
  missing: "Missing",
  excused: "Excused",
};

/** Suggested letter grade for a percentage. Faculty can enter a different grade. */
export function gradeFor(percentage: number | null | undefined): string {
  if (percentage == null) return "";
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  return "F";
}

export type ResultChangeKind = "attendance" | "exam_result" | "assignment_grade" | "final_report";

export const RESULT_KIND_LABEL: Record<ResultChangeKind, string> = {
  attendance: "Attendance",
  exam_result: "Exam marks",
  assignment_grade: "Assignment grade",
  final_report: "Final report",
};

export interface ResultChange {
  id: string;
  change_no: string;
  kind: ResultChangeKind;
  course_id: string;
  student_id: string;
  target_id: string;
  label: string;
  old_value: Record<string, unknown>;
  new_value: Record<string, unknown>;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  requested_by: string | null;
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  course?: { title: string } | null;
}

/** For overseers, who can read student and Faculty profiles. */
export const RESULT_CHANGE_SELECT =
  "*, course:courses(title), student:profiles!result_changes_student_id_fkey(full_name, user_code), requester:profiles!result_changes_requested_by_fkey(full_name)";

/** "status: absent, note: —" style summary of a result value. */
export function describeValue(kind: ResultChangeKind, v: Record<string, unknown> | null | undefined): string {
  if (!v) return "—";
  const text = (x: unknown) => (x == null || x === "" ? "—" : String(x));
  switch (kind) {
    case "attendance":
      return `${text(v.status)}${v.note ? ` (${v.note})` : ""}`;
    case "exam_result":
      return `${v.absent ? "Absent" : `${text(v.marks)} marks`}${v.remarks ? ` (${v.remarks})` : ""}`;
    case "assignment_grade":
      return `${text(v.score)}${v.feedback ? ` (${v.feedback})` : ""}`;
    case "final_report":
      return `${text(v.percentage)}%, grade ${text(v.grade)}${v.remarks ? ` (${v.remarks})` : ""}`;
  }
}

/** Key for one result: `${kind}:${targetId}:${studentId}`. */
export function pendingKey(kind: ResultChangeKind, targetId: string, studentId: string) {
  return `${kind}:${targetId}:${studentId}`;
}

/** Results in one course with a change awaiting the Principal. */
export async function getPendingChanges(supabase: Supabase, courseId: string): Promise<Set<string>> {
  const { data } = await supabase.from("result_changes").select("kind, target_id, student_id").eq("course_id", courseId).eq("status", "pending");
  return new Set((data ?? []).map((c) => pendingKey(c.kind as ResultChangeKind, c.target_id, c.student_id)));
}
