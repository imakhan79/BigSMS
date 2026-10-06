import Link from "next/link";
import { ApprovalControls } from "@/components/CourseApprovalList";
import { Badge, Card, CardTitle, Empty, PageHeader, Stat, Table, Td, TextLink } from "@/components/ui";
import { approvalState, getCourseWorkflow } from "@/lib/approvals";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CourseStat } from "@/lib/types";
import { formatDate, pct } from "@/lib/utils";

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

  return (
    <>
      <PageHeader title={`Welcome, ${profile.full_name || "Principal"}`} subtitle="Academic overview and approvals" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Courses to approve" value={pending.length} href="/principal/courses" />
        <Stat label="Published courses" value={live.length} />
        <Stat label="Active students" value={students ?? 0} />
        <Stat label="Active professors" value={professors ?? 0} />
        <Stat label="Avg completion" value={pct(avg("completion_rate"))} />
        <Stat label="Avg quiz score" value={pct(avg("avg_quiz_score"))} />
        <Stat label="Avg submission rate" value={pct(avg("submission_rate"))} />
        <Stat label="Open KPI alerts" value={alerts?.length ?? 0} href="/principal/alerts" />
      </div>

      <Card className="mt-6">
        <CardTitle action={<TextLink href="/principal/courses">All courses</TextLink>}>
          Awaiting your approval
        </CardTitle>
        {!pending.length ? (
          <Empty>No courses waiting for approval.</Empty>
        ) : (
          <div className="space-y-4">
            {pending.map((c: any) => (
              <div key={c.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <Link href={`/principal/courses/${c.id}`} className="font-semibold hover:underline">{c.title}</Link>
                  <span className="text-xs text-muted-foreground">{c.profiles?.full_name} · {formatDate(c.updated_at)}</span>
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
        <Table head={["Course", "Professor", "Status", "Students", "Completion", "Quiz avg", "Submissions"]} empty={!stats.length}>
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
