export type Role = "admin" | "professor" | "student" | "parent";
export type UserStatus = "pending" | "active" | "inactive";
export type CourseStatus = "draft" | "pending_approval" | "published" | "rejected" | "archived";
export type MaterialType = "video" | "pdf" | "book" | "notes" | "worksheet";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: UserStatus;
  created_at: string;
}

export interface Course {
  id: string;
  professor_id: string;
  category_id: string | null;
  title: string;
  description: string;
  outline: string;
  status: CourseStatus;
  review_note: string | null;
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

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  professor: "/professor",
  student: "/student",
  parent: "/parent",
};
