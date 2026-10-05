import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export default async function SharedLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole();
  return <AppShell profile={profile}>{children}</AppShell>;
}
