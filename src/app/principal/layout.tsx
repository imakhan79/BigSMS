import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export default async function PrincipalLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("principal");
  return <AppShell profile={profile}>{children}</AppShell>;
}
