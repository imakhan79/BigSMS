import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

/** Student enrollment: the student office enrolls, the Principal approves. */
export default async function EnrollmentLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("admin", "admin_manager", "principal");
  return <AppShell profile={profile}>{children}</AppShell>;
}
