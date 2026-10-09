import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

/** Attendance: the staff and Faculty register, student attendance by class and each employee's own record. */
export default async function AttendanceLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("admin", "admin_manager", "principal", "professor", "staff");
  return <AppShell profile={profile}>{children}</AppShell>;
}
