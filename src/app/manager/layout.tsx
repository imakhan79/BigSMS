import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export default async function ManagerLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("admin_manager");
  return <AppShell profile={profile}>{children}</AppShell>;
}
