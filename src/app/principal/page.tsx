import Link from "next/link";
import { ReviewButtons } from "@/components/CourseApprovalList";
import { Badge, Card, CardTitle, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CourseStat } from "@/lib/types";
import { formatDate, pct } from "@/lib/utils";

export default async function PrincipalDashboard() {
  const profile = await requireRole("principal");
  const supabase = await createClient();

  const [{ data: statsData }, { data: pending }, { data: alerts }, { count: students }, { count: professors }] = await Promise.all([
    supabase.rpc("course_stats"),
    supabase
      .from("courses")
      .select("id, title, description, updated_at, profiles!courses_professor_id_fkey(full_name)")
      .eq("status", "pending_approval")
      .order("updated_at"),
    supabase.from("alerts").select("id, message, created_at, course_id").neq("status", "resolved").order("created_at", { ascending: false }).limit(6),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student").eq("status", "active"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "professor").eq("status", "active"),
  ]);
  const stats = (statsData ?? []) as CourseStat[];
  const live = stats.filter((s) => s.status === "published");
  const avg = (key: keyof CourseStat) => (live.length ? live.reduce((t, s) => t + Number(s[key]), 0) / live.length : null);

  return (
    <>
      <PageHeader title={`Welcome, ${profile.full_name || "Principal"}`} subtitle="Academic overview and approvals" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link href="/principal/courses"><Stat label="Courses to approve" value={pending?.length ?? 0} /></Link>
        <Stat label="Published courses" value={live.length} />
        <Stat label="Active students" value={students ?? 0} />
        <Stat label="Active professors" value={professors ?? 0} />
        <Stat label="Avg completion" value={pct(avg("completion_rate"))} />
        <Stat label="Avg quiz score" value={pct(avg("avg_quiz_score"))} />
        <Stat label="Avg submission rate" value={pct(avg("submission_rate"))} />
        <Link href="/principal/alerts"><Stat label="Open KPI alerts" value={alerts?.length ?? 0} /></Link>
      </div>

      <Card className="mt-6">
        <CardTitle action={<Link href="/principal/courses" className="text-sm text-primary hover:underline">All courses</Link>}>
          Awaiting your approval
        </CardTitle>
        {!pending?.length ? (
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
                <ReviewButtons id={c.id} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardTitle action={<Link href="/principal/reports" className="text-sm text-primary hover:underline">Full report</Link>}>Course performance</CardTitle>
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
