import Link from "next/link";
import { BarChart3, Bell, BellRing, BookOpen, BookOpenCheck, GraduationCap, Users } from "lucide-react";
import { ApprovalControls } from "@/components/CourseApprovalList";
import { QuickActions, StudentPerformance } from "@/components/DashboardWidgets";
import { Badge, Card, CardTitle, Empty, PageHeader, Stat, Table, Td, TextLink } from "@/components/ui";
import { approvalState, getCourseWorkflow } from "@/lib/approvals";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CourseStat } from "@/lib/types";
import { pct, timeAgo } from "@/lib/utils";

export default async function PrincipalDashboard() {
  const profile = await requireRole("principal");
  const supabase = await createClient();

  const [{ data: statsData }, { data: allPending }, { data: alerts }, { count: students }, { count: professors }, steps] = await Promise.all([
    supabase.rpc("course_stats"),
    supabase
      .from("courses")
      .select("id, title, description, approval_step, updated_at, profiles!courses_professor_id_fkey(full_name)")
      .eq("status", "pending_approval")
      .order("updated_at"),
    supabase.from("alerts").select("id, message, created_at, course_id").neq("status", "resolved").order("created_at", { ascending: false }).limit(6),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student").eq("status", "active"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "professor").eq("status", "active"),
    getCourseWorkflow(supabase),
  ]);
  // Only courses currently at the principal's step; others are waiting on someone else.
  const pending = (allPending ?? []).filter((c: any) => approvalState(c.approval_step, steps, "principal").canAct);
  const stats = (statsData ?? []) as CourseStat[];
  const live = stats.filter((s) => s.status === "published");
  const avg = (key: keyof CourseStat) => (live.length ? live.reduce((t, s) => t + Number(s[key]), 0) / live.length : null);

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const firstName = (profile.full_name || "").split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={firstName ? `Welcome back, ${firstName}` : "Principal dashboard"}
        subtitle={pending.length ? `${pending.length} ${pending.length === 1 ? "course is" : "courses are"} waiting for your approval.` : "No approvals waiting. Here is how the institution is doing."}
      />

      <QuickActions
        actions={[
          { href: "/principal/courses", label: "Course approvals", description: `${pending.length} waiting for you`, icon: <BookOpenCheck size={17} /> },
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
        <Stat label="Courses to approve" value={pending.length} href="/principal/courses" />
      </div>

      <div className="mt-6">
        <StudentPerformance reportHref="/principal/reports" />
      </div>

      <Card className="mt-6">
        <CardTitle action={<TextLink href="/principal/courses">All courses</TextLink>}>
          Awaiting your approval
        </CardTitle>
        {!pending.length ? (
          <Empty compact icon={<BookOpenCheck size={18} />} title="All caught up">No courses are waiting for your approval.</Empty>
        ) : (
          <div className="space-y-4">
            {pending.map((c: any) => (
              <div key={c.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <Link href={`/principal/courses/${c.id}`} className="font-semibold hover:underline">{c.title}</Link>
                  <span className="text-xs text-muted-foreground">{c.profiles?.full_name} · {timeAgo(c.updated_at)}</span>
                </div>
                {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
                <ApprovalControls id={c.id} approvalStep={c.approval_step} steps={steps} viewer={profile.role} />
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
              <Td className="font-medium"><Link href={`/principal/courses/${s.course_id}`} className="hover:underline">{s.title}</Link></Td>
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
