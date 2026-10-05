import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export default async function ProfessorLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("professor");
  return <AppShell profile={profile}>{children}</AppShell>;
}
