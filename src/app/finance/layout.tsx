import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

/** Finance (BRD 6): student fees and staff salaries, kept by the Principal and the Admin Manager. */
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("principal", "admin_manager");
  return <AppShell profile={profile}>{children}</AppShell>;
}
