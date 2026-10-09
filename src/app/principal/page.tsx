import Link from "next/link";
import { BarChart3, Bell, BellRing, BookOpen, BookOpenCheck, GraduationCap, Users } from "lucide-react";
import { CourseStageBadge } from "@/components/CourseManagement";
import { QuickActions, StudentPerformance } from "@/components/DashboardWidgets";
import { Badge, Card, CardTitle, Empty, PageHeader, Stat, Table, Td, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CourseStat } from "@/lib/types";
import { firstName, pct, timeAgo } from "@/lib/utils";

export default async function PrincipalDashboard() {
  const profile = await requireRole("principal");
  const supabase = await createClient();

  const [{ data: statsData }, { data: readyData }, { data: alerts }, { count: students }, { count: professors }] = await Promise.all([
    supabase.rpc("course_stats"),
    supabase
      .from("courses")
      .select("id, code, title, description, status, editing, ready_at, profiles!courses_professor_id_fkey(full_name)")
      .not("ready_at", "is", null)
      .order("ready_at"),
    supabase.from("alerts").select("id, message, created_at, course_id").neq("status", "resolved").order("created_at", { ascending: false }).limit(6),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student").eq("status", "active"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "professor").eq("status", "active"),
  ]);
  const pending = readyData ?? [];
  const stats = (statsData ?? []) as CourseStat[];
  const live = stats.filter((s) => s.status === "published");
  const avg = (key: keyof CourseStat) => (live.length ? live.reduce((t, s) => t + Number(s[key]), 0) / live.length : null);

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const name = firstName(profile.full_name);

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={name ? `Welcome back, ${name}` : "Principal dashboard"}
        subtitle={pending.length ? `${pending.length} ${pending.length === 1 ? "course is" : "courses are"} ready to publish.` : "Nothing waiting to be published. Here is how the institution is doing."}
      />

      <QuickActions
        actions={[
          { href: "/courses", label: "Courses", description: `${pending.length} ready to publish`, icon: <BookOpenCheck size={17} /> },
          { href: "/principal/reports", label: "Reports & analytics", description: "Completion, scores, submissions", icon: <BarChart3 size={17} /> },
          { href: "/principal/alerts", label: "KPI alerts", description: `${alerts?.length ?? 0} open`, icon: <BellRing size={17} /> },
          { href: "/notifications", label: "Notifications", description: "Updates sent to you", icon: <Bell size={17} /> },
        ]}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Active students" value={students ?? 0} icon={<GraduationCap size={16} />} />
        <Stat label="Active Faculty" value={professors ?? 0} icon={<Users size={16} />} />
        <Stat label="Published courses" value={live.length} icon={<BookOpen size={16} />} />
        <Stat label="Open KPI alerts" value={alerts?.length ?? 0} icon={<BellRing size={16} />} href="/principal/alerts" />
        <Stat label="Avg completion" value={pct(avg("completion_rate"))} hint="published courses" />
        <Stat label="Avg quiz score" value={pct(avg("avg_quiz_score"))} hint="published courses" />
        <Stat label="Avg submission rate" value={pct(avg("submission_rate"))} hint="published courses" />
        <Stat label="Ready to publish" value={pending.length} href="/courses?stage=ready" />
      </div>

      <div className="mt-6">
        <StudentPerformance reportHref="/principal/reports" />
      </div>

      <Card className="mt-6">
        <CardTitle action={<TextLink href="/courses">All courses</TextLink>} description="Marked ready by Faculty. You or the Admin Manager can publish them.">
          Ready to publish
        </CardTitle>
        {!pending.length ? (
          <Empty compact icon={<BookOpenCheck size={18} />} title="All caught up">No courses are waiting to be published.</Empty>
        ) : (
          <div className="space-y-4">
            {pending.map((c: any) => (
              <div key={c.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <Link href={`/courses/${c.id}`} className="font-semibold hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{c.code}</span> {c.title}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {c.profiles?.full_name} · {timeAgo(c.ready_at)}
                    <CourseStageBadge course={{ ...c, ready_at: null }} />
                  </span>
                </div>
                {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardTitle action={<TextLink href="/principal/reports">Full report</TextLink>}>Course performance</CardTitle>
        <Table head={["Course", "Faculty", "Status", "Students", "Completion", "Quiz avg", "Submissions"]} empty={!stats.length}>
          {stats.map((s) => (
            <tr key={s.course_id}>
              <Td className="font-medium"><Link href={`/courses/${s.course_id}`} className="hover:underline">{s.title}</Link></Td>
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
