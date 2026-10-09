import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

/** Parent portal: read-only, showing what the parent's linked children see as students. */
export default async function ParentLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("parent");
  return <AppShell profile={profile}>{children}</AppShell>;
}
