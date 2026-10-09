import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

/** Course management: the Principal and the Admin Manager manage courses; Admins read them. */
export default async function CoursesLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("principal", "admin_manager", "admin");
  return <AppShell profile={profile}>{children}</AppShell>;
}
