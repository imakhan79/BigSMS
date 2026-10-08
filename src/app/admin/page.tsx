import Link from "next/link";
import {
  BarChart3,
  BellRing,
  BookOpen,
  BookOpenCheck,
  CircleCheck,
  GraduationCap,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { QuickActions, RecentActivity, StudentPerformance } from "@/components/DashboardWidgets";
import { Badge, Card, CardTitle, Empty, PageHeader, Stat, Table, Td, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CourseStat } from "@/lib/types";
import { firstName, pct, timeAgo } from "@/lib/utils";

export default async function AdminDashboard() {
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const count = (table: string, filter?: (q: any) => any) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    return q.then((r: { count: number | null }) => r.count ?? 0);
  };

  const [students, professors, parents, pendingUsers, published, pendingCourses, openAlerts, stats, pendingList, alerts] = await Promise.all([
    count("profiles", (q) => q.eq("role", "student").eq("status", "active")),
    count("profiles", (q) => q.eq("role", "professor").eq("status", "active")),
    count("profiles", (q) => q.eq("role", "parent").eq("status", "active")),
    count("profiles", (q) => q.eq("status", "pending")),
    count("courses", (q) => q.eq("status", "published")),
    count("courses", (q) => q.eq("status", "pending_approval")),
    count("alerts", (q) => q.eq("status", "open")),
    supabase.rpc("course_stats").then((r) => (r.data ?? []) as CourseStat[]),
    supabase.from("courses").select("id, title, updated_at, profiles!courses_professor_id_fkey(full_name)").eq("status", "pending_approval").order("updated_at").limit(5),
    supabase.from("alerts").select("id, message, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(5),
  ]);

  const live = stats.filter((s) => s.status === "published");
  const avg = (key: keyof CourseStat) => (live.length ? live.reduce((t, s) => t + Number(s[key]), 0) / live.length : null);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const name = firstName(profile.full_name);
  const attention = pendingUsers + pendingCourses + openAlerts;

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={name ? `Welcome back, ${name}` : "Admin dashboard"}
        subtitle={attention ? `${attention} ${attention === 1 ? "item needs" : "items need"} your attention today.` : "Everything is up to date."}
      />

      <QuickActions
        actions={[
          { href: "/admin/users", label: "Add a user", description: "Onboard staff, students or parents", icon: <UserPlus size={17} /> },
          { href: "/admin/courses", label: "Review courses", description: `${pendingCourses} waiting for approval`, icon: <BookOpenCheck size={17} /> },
          { href: "/admin/reports", label: "View reports", description: "Completion, scores, submissions", icon: <BarChart3 size={17} /> },
          { href: "/admin/settings", label: "System settings", description: "Configure Big SMS", icon: <Settings size={17} /> },
        ]}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Active students" value={students} icon={<GraduationCap size={16} />} href="/admin/users?role=student" />
        <Stat label="Active Faculty" value={professors} icon={<Users size={16} />} href="/admin/users?role=professor" />
        <Stat label="Active parents" value={parents} icon={<UsersRound size={16} />} href="/admin/users?role=parent" />
        <Stat label="Published courses" value={published} icon={<BookOpen size={16} />} href="/admin/courses?status=published" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StudentPerformance reportHref="/admin/reports" />
        </div>
        <Card>
          <CardTitle description="Items waiting on an administrator">Needs attention</CardTitle>
          <ul className="space-y-1">
            {[
              { label: "Accounts to activate", value: pendingUsers, href: "/admin/users?status=pending", icon: <ShieldCheck size={16} /> },
              { label: "Courses to approve", value: pendingCourses, href: "/admin/courses", icon: <BookOpenCheck size={16} /> },
              { label: "Open KPI alerts", value: openAlerts, href: "/admin/alerts", icon: <BellRing size={16} /> },
            ].map((i) => (
              <li key={i.label}>
                <Link href={i.href} className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-secondary/60">
                  <span className={i.value ? "text-accent" : "text-muted-foreground"}>{i.icon}</span>
                  <span className="flex-1">{i.label}</span>
                  {i.value ? (
                    <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-warning">{i.value}</span>
                  ) : (
                    <CircleCheck size={16} className="text-success" aria-label="None" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-[13px] text-muted-foreground">Average completion</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">{pct(avg("completion_rate"))}</p>
            <p className="text-xs text-muted-foreground">across {live.length} published {live.length === 1 ? "course" : "courses"}</p>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardTitle action={<TextLink href="/admin/courses">Review all</TextLink>}>Awaiting approval</CardTitle>
            {!pendingList.data?.length ? (
              <Empty compact icon={<BookOpenCheck size={18} />} title="All caught up">No courses are waiting for approval.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {pendingList.data.map((c: any) => (
                  <li key={c.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <Link href={`/admin/courses/${c.id}`} className="min-w-0 truncate font-medium hover:text-primary">
                      {c.title} <span className="font-normal text-muted-foreground">· {c.profiles?.full_name}</span>
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(c.updated_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle action={<TextLink href="/admin/alerts">Manage</TextLink>}>Open alerts</CardTitle>
            {!alerts.data?.length ? (
              <Empty compact icon={<BellRing size={18} />} title="No open alerts">Every course is within its KPI thresholds.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {alerts.data.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                    <span>{a.message}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <RecentActivity />
      </div>

      <Card className="mt-6">
        <CardTitle action={<TextLink href="/admin/reports">Full report</TextLink>}>Course performance</CardTitle>
        <Table head={["Course", "Faculty", "Status", "Students", "Completion", "Quiz avg", "Submissions"]} empty={!stats.length}>
          {stats.slice(0, 8).map((s) => (
            <tr key={s.course_id}>
              <Td className="font-medium">{s.title}</Td>
              <Td>{s.professor_name}</Td>
              <Td><Badge value={s.status} /></Td>
              <Td>{s.enrolled}</Td>
              <Td>{pct(s.completion_rate)}</Td>
              <Td>{pct(s.avg_quiz_score)}</Td>
              <Td>{pct(s.submission_rate)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
