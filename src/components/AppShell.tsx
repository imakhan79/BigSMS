import Link from "next/link";
import { BRAND, BrandLockup, Crest } from "@/components/Brand";
import { Bell, LogOut, UserRound } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Dropdown, menuItemClass } from "@/components/Dropdown";
import { NavLinks, type NavGroup } from "@/components/NavLinks";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, Tooltip } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type PortalRole, type Profile } from "@/lib/types";

const PORTAL_NAME: Record<PortalRole, string> = {
  super_admin: "Super Admin Portal",
  admin: "Admin Portal",
  admin_manager: "Admin Manager Portal",
  principal: "Principal Portal",
  professor: "Faculty Portal",
  staff: "Staff Portal",
  student: "Student Portal",
};

function adminNav(): NavGroup[] {
  return [
    { items: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }] },
    {
      label: "Academics",
      items: [
        { href: "/courses", label: "Courses", icon: "courses" },
        { href: "/admin/categories", label: "Categories", icon: "categories" },
        { href: "/admin/question-bank", label: "Question Bank", icon: "questions" },
      ],
    },
    {
      label: "Administration",
      items: [
        { href: "/admin/users", label: "All Users", icon: "users" },
        { href: "/admin/users?role=student", label: "Students", icon: "students" },
        { href: "/admin/users?role=staff", label: "Staff", icon: "staff" },
      ],
    },
    {
      label: "Performance",
      items: [
        { href: "/admin/reports", label: "Reports & Analytics", icon: "reports" },
        { href: "/admin/kpis", label: "KPIs", icon: "kpis" },
        { href: "/admin/alerts", label: "Alerts", icon: "alerts" },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/admin/audit-logs", label: "Audit Logs", icon: "audit" },
        { href: "/admin/settings", label: "Settings", icon: "settings" },
      ],
    },
  ];
}

export const NAV: Record<PortalRole, NavGroup[]> = {
  super_admin: adminNav(),
  admin: adminNav(),
  admin_manager: [
    { items: [{ href: "/manager", label: "Dashboard", icon: "dashboard" }] },
    { label: "Academics", items: [{ href: "/courses", label: "Courses", icon: "courses" }] },
    {
      label: "Students",
      items: [
        { href: "/manager/applications", label: "Applications", icon: "applications" },
        { href: "/manager/students", label: "Students", icon: "students" },
        { href: "/manager/profile-requests", label: "Profile Changes", icon: "profileChanges" },
        { href: "/manager/enrollment", label: "Course Enrollment", icon: "enrollment" },
        { href: "/manager/certificates", label: "Certificate Lists", icon: "certificates" },
      ],
    },
    {
      label: "Finance",
      items: [
        { href: "/finance/fees", label: "Fee Records", icon: "fees" },
        { href: "/finance/salaries", label: "Staff Salaries", icon: "salaries" },
      ],
    },
    {
      label: "Directory",
      items: [
        { href: "/manager/faculty", label: "Faculty", icon: "faculty" },
        { href: "/manager/staff", label: "Staff", icon: "staff" },
      ],
    },
  ],
  principal: [
    { items: [{ href: "/principal", label: "Dashboard", icon: "dashboard" }] },
    { label: "Academics", items: [{ href: "/courses", label: "Courses", icon: "courses" }] },
    {
      label: "Approvals",
      items: [
        { href: "/principal/certificates", label: "Certificate Lists", icon: "certificates" },
        { href: "/principal/changes", label: "Result Changes", icon: "results" },
        { href: "/principal/profile-requests", label: "Profile Changes", icon: "profileChanges" },
      ],
    },
    {
      label: "Finance",
      items: [
        { href: "/finance/fees", label: "Fee Records", icon: "fees" },
        { href: "/finance/salaries", label: "Staff Salaries", icon: "salaries" },
      ],
    },
    {
      label: "Performance",
      items: [
        { href: "/principal/reports", label: "Reports & Analytics", icon: "reports" },
        { href: "/principal/alerts", label: "KPI Alerts", icon: "alerts" },
      ],
    },
  ],
  professor: [
    { items: [{ href: "/professor", label: "Dashboard", icon: "dashboard" }] },
    {
      label: "Teaching",
      items: [
        { href: "/professor/courses", label: "My Courses", icon: "courses" },
        { href: "/professor/timetable", label: "Timetable", icon: "timetable" },
        { href: "/professor/question-bank", label: "Question Bank", icon: "questions" },
      ],
    },
    { label: "Results", items: [{ href: "/professor/changes", label: "Change Requests", icon: "approvals" }] },
    { label: "Performance", items: [{ href: "/professor/analytics", label: "Analytics", icon: "reports" }] },
  ],
  staff: [{ items: [{ href: "/staff", label: "Dashboard", icon: "dashboard" }] }],
  student: [
    {
      items: [
        { href: "/student", label: "My Courses", icon: "courses" },
        { href: "/student/id-card", label: "My ID Card", icon: "idCard" },
        { href: "/profile", label: "My Profile", icon: "profileChanges" },
      ],
    },
  ],
};

export async function AppShell({ profile, children }: { profile: Profile & { role: PortalRole }; children: ReactNode }) {
  const nav = NAV[profile.role];
  const name = profile.full_name || profile.email;
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .is("read_at", null);

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="shrink-0 border-b border-sidebar-border px-4 pb-4 pt-5 text-center">
          <Link href="/" className="mx-auto block w-fit" aria-label={`${BRAND.short} home`}>
            <Crest className="mx-auto h-[88px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]" priority />
          </Link>
          <p className="mt-2.5 font-display text-lg font-bold tracking-wide text-white">{BRAND.short}</p>
          <p className="mx-auto max-w-[200px] text-[11px] leading-snug text-sidebar-muted">{BRAND.name}</p>
          <p className="mt-3 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gold">
            <span className="h-px w-5 bg-gold/70" aria-hidden />
            {PORTAL_NAME[profile.role]}
            <span className="h-px w-5 bg-gold/70" aria-hidden />
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <Suspense>
            <NavLinks groups={nav} />
          </Suspense>
        </div>
        <Link
          href="/profile"
          className="flex shrink-0 items-center gap-3 border-t border-sidebar-border px-4 py-3 transition-colors hover:bg-sidebar-hover"
        >
          <Avatar name={name} className="!bg-gold !text-sidebar" />
          <span className="min-w-0 text-sm">
            <span className="block truncate font-medium">{name}</span>
            <span className="block truncate text-xs text-sidebar-muted">{ROLE_LABEL[profile.role]}</span>
          </span>
        </Link>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-md sm:px-6">
        <MobileNav groups={nav} title={PORTAL_NAME[profile.role]} />
        <Link href="/" className="lg:hidden" aria-label={`${BRAND.short} home`}>
          <BrandLockup sub={PORTAL_NAME[profile.role]} />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Tooltip label={count ? `${count} unread` : "Notifications"} side="bottom">
            <Link
              href="/notifications"
              className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
            >
              <Bell size={18} />
              {!!count && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold tabular-nums text-accent-foreground ring-2 ring-surface">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </Link>
          </Tooltip>
          <div className="mx-1.5 h-6 w-px bg-border" aria-hidden />
          <Dropdown label="Account menu" className="gap-2 py-1 pl-1 pr-2" trigger={
            <>
              <Avatar name={name} className="h-7 w-7 text-[11px]" />
              <span className="hidden max-w-40 truncate text-sm font-medium md:inline">{name}</span>
            </>
          }>
            <div className="border-b border-border px-2.5 pb-2 pt-1.5">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
            </div>
            <div className="py-1">
              <Link href="/profile" role="menuitem" className={menuItemClass}>
                <UserRound size={16} className="text-muted-foreground" /> Profile
              </Link>
              <Link href="/notifications" role="menuitem" className={menuItemClass}>
                <Bell size={16} className="text-muted-foreground" /> Notifications
                {!!count && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>}
              </Link>
            </div>
            <form action={signOut} className="border-t border-border pt-1">
              <button role="menuitem" className={menuItemClass}>
                <LogOut size={16} className="text-muted-foreground" /> Sign out
              </button>
            </form>
          </Dropdown>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
