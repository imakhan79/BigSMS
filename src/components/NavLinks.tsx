"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Award,
  BarChart3,
  BellRing,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardPen,
  IdCard,
  FileQuestion,
  FileText,
  NotebookPen,
  FolderTree,
  GaugeCircle,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  Presentation,
  ScrollText,
  Settings,
  UserCheck,
  UserCog,
  UserPen,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  Banknote,
} from "lucide-react";
import { LayoutGroup, m } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Icons are referenced by name so the nav config can live in server components. */
const ICONS = {
  dashboard: LayoutDashboard,
  users: Users,
  staff: UserCog,
  parents: UsersRound,
  courses: BookOpen,
  approvals: ClipboardCheck,
  categories: FolderTree,
  questions: FileQuestion,
  kpis: GaugeCircle,
  alerts: BellRing,
  reports: BarChart3,
  audit: ScrollText,
  settings: Settings,
  workflows: GitBranch,
  students: GraduationCap,
  applications: FileText,
  enrollment: UserPlus,
  fees: Wallet,
  salaries: Banknote,
  certificates: Award,
  faculty: Presentation,
  timetable: CalendarDays,
  results: ClipboardPen,
  profileChanges: UserPen,
  idCard: IdCard,
  attendance: UserCheck,
  exams: NotebookPen,
} as const;
export type NavIcon = keyof typeof ICONS;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

function isActive(item: NavItem, pathname: string, search: URLSearchParams, all: NavItem[]): boolean {
  const [path, query] = item.href.split("?");
  if (query) {
    return pathname === path && [...new URLSearchParams(query)].every(([k, v]) => search.get(k) === v);
  }
  // A plain link yields to a more specific sibling (same path plus a query) that matches.
  if (all.some((o) => o !== item && o.href.startsWith(`${path}?`) && isActive(o, pathname, search, all))) return false;
  const isPortalRoot = path.split("/").length === 2;
  return isPortalRoot ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * The active item's highlight is one shared element that glides to the new item on navigation.
 * `instance` keeps the sidebar and the mobile drawer from sharing it.
 */
export function NavLinks({ groups, onNavigate, instance = "sidebar" }: { groups: NavGroup[]; onNavigate?: () => void; instance?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const all = groups.flatMap((g) => g.items);
  return (
    <LayoutGroup id={instance}>
    <nav className="space-y-5" aria-label="Main">
      {groups.map((group, gi) => (
        <div key={group.label ?? gi}>
          {group.label && (
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted/80">{group.label}</p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item, pathname, search, all);
              const Icon = ICONS[item.icon];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-150 lg:h-8",
                      active ? "font-medium text-white" : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
                    )}
                  >
                    {active && (
                      <m.span layoutId="nav-active" transition={spring} className="absolute inset-0 rounded-md bg-sidebar-active" aria-hidden>
                        <span className="absolute inset-y-1.5 -left-3 w-[3px] rounded-r bg-gold" />
                      </m.span>
                    )}
                    <Icon
                      size={16}
                      strokeWidth={active ? 2.2 : 1.8}
                      className={cn("relative shrink-0", active && "text-gold")}
                      aria-hidden
                    />
                    <span className="relative truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
    </LayoutGroup>
  );
}
