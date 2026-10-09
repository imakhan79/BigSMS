import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

/** Timetable management: kept and published by the Principal and the Admin Manager; admins read. */
export default async function TimetableLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("admin", "admin_manager", "principal");
  return <AppShell profile={profile}>{children}</AppShell>;
}
