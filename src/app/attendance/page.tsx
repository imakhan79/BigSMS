import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

export default async function AttendanceHome() {
  const profile = await requireRole("admin", "admin_manager", "principal", "professor", "staff");
  if (profile.role === "professor") redirect("/attendance/students");
  if (profile.role === "staff") redirect("/attendance/me");
  redirect("/attendance/staff");
}
