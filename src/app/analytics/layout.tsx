import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

/** Analytics: the Principal and admins see everything, Faculty their own classes, students themselves. */
export default async function AnalyticsLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("admin", "principal", "professor", "student");
  return <AppShell profile={profile}>{children}</AppShell>;
}
