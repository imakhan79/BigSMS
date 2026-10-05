import Link from "next/link";
import { Badge, Card, CardTitle, Empty, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CourseStat } from "@/lib/types";
import { formatDate, pct } from "@/lib/utils";

export default async function ProfessorDashboard() {
  const profile = await requireRole("professor");
  const supabase = await createClient();

  const [{ data: statsData }, { data: alerts }, { data: toGrade }] = await Promise.all([
    supabase.rpc("course_stats"),
    supabase.from("alerts").select("id, message, created_at, course_id").neq("status", "resolved").order("created_at", { ascending: false }).limit(5),
    supabase
      .from("submissions")
      // RLS limits this to submissions in the professor's own courses.
      .select("id, submitted_at, student:profiles!submissions_student_id_fkey(full_name), assignments(title, course_id)")
      .eq("status", "submitted")
      .order("submitted_at")
      .limit(8),
  ]);
  const stats = (statsData ?? []) as CourseStat[];
  const count = (s: string) => stats.filter((c) => c.status === s).length;

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile.full_name || "Professor"}`}
        subtitle="Your courses at a glance"
        action={<LinkButton href="/professor/courses">Manage courses</LinkButton>}
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Published" value={count("published")} />
        <Stat label="Awaiting approval" value={count("pending_approval")} />
        <Stat label="Drafts / rejected" value={count("draft") + count("rejected")} />
        <Stat label="Students enrolled" value={stats.reduce((t, s) => t + Number(s.enrolled), 0)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>To grade</CardTitle>
          {!toGrade?.length ? (
            <Empty>No submissions waiting.</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {toGrade.map((s: any) => (
                <li key={s.id} className="flex justify-between gap-2 py-2">
                  <Link href={`/professor/courses/${s.assignments.course_id}?tab=assignments`} className="hover:underline">
                    {s.student?.full_name} · {s.assignments.title}
                  </Link>
                  <span className="whitespace-nowrap text-muted-foreground">{formatDate(s.submitted_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>KPI notifications</CardTitle>
          {!alerts?.length ? (
            <Empty>All KPIs within thresholds.</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {alerts.map((a) => (
                <li key={a.id} className="py-2">
                  <Link href={`/professor/courses/${a.course_id}`} className="hover:underline">{a.message}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardTitle>Course progress</CardTitle>
        <Table head={["Course", "Status", "Students", "Completion", "Quiz avg", "Submissions"]} empty={!stats.length}>
          {stats.map((s) => (
            <tr key={s.course_id}>
              <Td className="font-medium"><Link href={`/professor/courses/${s.course_id}`} className="hover:underline">{s.title}</Link></Td>
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
