import Image from "next/image";
import Link from "next/link";
import { Bell, LogOut, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { signOut } from "@/app/(auth)/actions";
import { NavLinks, type NavItem } from "@/components/NavLinks";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

const PORTAL_NAME: Record<Role, string> = {
  admin: "Admin Portal",
  professor: "Professor Portal",
  student: "Student Portal",
  parent: "Parent Portal",
};

export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/courses", label: "Courses" },
    { href: "/admin/categories", label: "Categories" },
    { href: "/admin/question-bank", label: "Question Bank" },
    { href: "/admin/kpis", label: "KPIs" },
    { href: "/admin/alerts", label: "Alerts" },
    { href: "/admin/reports", label: "Reports & Analytics" },
    { href: "/admin/audit-logs", label: "Audit Logs" },
    { href: "/admin/settings", label: "System Settings" },
  ],
  professor: [
    { href: "/professor", label: "Dashboard" },
    { href: "/professor/courses", label: "My Courses" },
    { href: "/professor/question-bank", label: "Question Bank" },
    { href: "/professor/analytics", label: "Analytics" },
  ],
  student: [
    { href: "/student", label: "My Courses" },
  ],
  parent: [
    { href: "/parent", label: "My Children" },
  ],
};

export async function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  const nav = NAV[profile.role];
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .is("read_at", null);

  return (
    <div className="min-h-screen bg-secondary/40">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background px-4">
        <MobileNav items={nav} />
        <Link href="/" className="flex items-center gap-3">
          <Image src="/zicon-logo.png" alt="Zicon" width={96} height={56} className="h-10 w-auto rounded" priority />
          <span className="hidden text-sm font-semibold text-primary sm:inline">{PORTAL_NAME[profile.role]}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Link href="/notifications" className="relative rounded-md p-2 hover:bg-secondary" aria-label="Notifications">
            <Bell size={18} />
            {!!count && (
              <span className="absolute -right-0.5 -top-0.5 rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                {count}
              </span>
            )}
          </Link>
          <Link href="/profile" className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-secondary" aria-label="Profile">
            <UserRound size={18} />
            <span className="hidden md:inline">{profile.full_name || profile.email}</span>
          </Link>
          <form action={signOut}>
            <button className="rounded-md p-2 hover:bg-secondary" aria-label="Log out">
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-border bg-background p-4 lg:block">
          <NavLinks items={nav} />
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
