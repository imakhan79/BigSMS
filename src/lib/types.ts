export type Role = "super_admin" | "admin" | "admin_manager" | "principal" | "professor" | "staff" | "student" | "parent";
export type UserStatus = "pending" | "active" | "inactive" | "offboarded";
export type CourseStatus = "draft" | "published" | "archived";
export type MaterialType = "video" | "pdf" | "book" | "notes" | "worksheet";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: UserStatus;
  user_code: string | null;
  phone: string;
  department: string;
  onboarded_at: string | null;
  onboarded_by: string | null;
  offboarded_at: string | null;
  offboarded_by: string | null;
  offboard_reason: string | null;
  created_at: string;
}

export interface Course {
  id: string;
  professor_id: string;
  category_id: string | null;
  title: string;
  /** Course ID shown to people, e.g. CS-101. */
  code: string;
  description: string;
  outline: string;
  curriculum: string;
  duration_value: number | null;
  duration_unit: string;
  fee: number | null;
  status: CourseStatus;
  /** A published course with unpublished changes in course_edits (the Edit stage). */
  editing: boolean;
  ready_at: string | null;
  ready_by: string | null;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseStat {
  course_id: string;
  title: string;
  professor_name: string;
  status: CourseStatus;
  enrolled: number;
  lectures: number;
  completion_rate: number;
  avg_quiz_score: number;
  submission_rate: number;
}

export interface StudentProgress {
  course_id: string;
  title: string;
  professor_name: string;
  lectures_total: number;
  lectures_done: number;
  completion_rate: number;
  quiz_avg: number | null;
  assignment_avg: number | null;
}

/** Roles with a portal. The parent role remains in the database but no longer has access. */
export type PortalRole = Exclude<Role, "parent">;

export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/admin",
  admin: "/admin",
  admin_manager: "/manager",
  principal: "/principal",
  professor: "/professor",
  staff: "/staff",
  student: "/student",
  parent: "/pending", // Parent access has been removed
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  admin_manager: "Admin Manager",
  principal: "Principal",
  professor: "Faculty",
  staff: "Staff",
  student: "Student",
  parent: "Parent",
};

/** Roles only a Super Admin may assign or manage. */
export const ADMIN_ROLES: Role[] = ["super_admin", "admin"];

export type ApplicationStatus = "submitted" | "under_review" | "accepted" | "rejected";
export type CertificateListStatus = "draft" | "submitted" | "approved" | "rejected";
export type InvoiceStatus = "unpaid" | "partial" | "paid" | "cancelled";

export const CERTIFICATE_KINDS = ["completion", "achievement", "participation", "merit"] as const;

export const DOCUMENT_TYPES: Record<string, string> = {
  birth_certificate: "Birth certificate",
  national_id: "National ID / B-Form",
  photo: "Photograph",
  academic_transcript: "Academic transcript",
  transfer_certificate: "Transfer / leaving certificate",
  medical_record: "Medical record",
  other: "Other",
};

/** Labels for every stored payment method, including older ones. */
export const PAYMENT_METHODS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "IBFT",
  card: "Card",
  cheque: "Cheque",
  online: "Online",
};

/** Payment methods that can be selected: Cash, IBFT (inter-bank funds transfer) and Cheque. */
export const PAYMENT_METHOD_CHOICES: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "IBFT",
  cheque: "Cheque",
};

/** Fee payment mode, chosen by the Admin Manager on the application. */
export const FEE_PLANS: Record<string, string> = {
  full: "Full",
  partial: "Partial",
  installment: "Installment",
};

/** Staff salary payment status. "Due" means pending with the due date reached. */
export const SALARY_STATUSES: Record<string, string> = {
  pending: "Pending",
  due: "Due",
  paid: "Paid",
  on_hold: "On hold",
};

/** Roles that can be on the payroll. */
export const EMPLOYEE_ROLES = ["super_admin", "admin", "admin_manager", "principal", "professor", "staff"] as const;
