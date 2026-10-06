import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("staff");
  return <AppShell profile={profile}>{children}</AppShell>;
}
