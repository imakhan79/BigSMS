import Link from "next/link";
import { BarChart3, Bell, BellRing, BookOpen, BookPlus, ClipboardCheck, Clock, FileQuestion, GraduationCap, PencilLine } from "lucide-react";
import { QuickActions } from "@/components/DashboardWidgets";
import { Badge, Card, CardTitle, Empty, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getRoster } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import type { CourseStat } from "@/lib/types";
import { firstName, pct, timeAgo } from "@/lib/utils";

export default async function ProfessorDashboard() {
  const profile = await requireRole("professor");
  const supabase = await createClient();

  const [{ data: statsData }, { data: alerts }, { data: toGrade }, roster, { count: ready }] = await Promise.all([
    supabase.rpc("course_stats"),
    supabase.from("alerts").select("id, message, created_at, course_id").neq("status", "resolved").order("created_at", { ascending: false }).limit(5),
    supabase
      .from("submissions")
      // RLS limits this to submissions in the professor's own courses.
      .select("id, student_id, submitted_at, assignments(title, course_id)")
      .eq("status", "submitted")
      .order("submitted_at")
      .limit(8),
    getRoster(supabase),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("professor_id", profile.id).not("ready_at", "is", null),
  ]);
  const names = new Map(roster.map((s) => [s.student_id, s.full_name]));
  const stats = (statsData ?? []) as CourseStat[];
  const count = (s: string) => stats.filter((c) => c.status === s).length;

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const name = firstName(profile.full_name);
  const waiting = toGrade?.length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={name ? `Welcome back, ${name}` : "Your dashboard"}
        subtitle={waiting ? `${waiting} ${waiting === 1 ? "submission is" : "submissions are"} waiting to be graded.` : "You are all caught up on grading."}
        action={<LinkButton href="/professor/courses">Manage courses</LinkButton>}
      />

      <QuickActions
        actions={[
          { href: "/professor/courses", label: "New course", description: "Create, then mark ready to publish", icon: <BookPlus size={17} /> },
          { href: "/professor/question-bank", label: "Question bank", description: "Write and reuse questions", icon: <FileQuestion size={17} /> },
          { href: "/professor/analytics", label: "Analytics", description: "Track course performance", icon: <BarChart3 size={17} /> },
          { href: "/notifications", label: "Notifications", description: "Approvals and alerts", icon: <Bell size={17} /> },
        ]}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Published" value={count("published")} icon={<BookOpen size={16} />} />
        <Stat label="Ready to publish" value={ready ?? 0} icon={<Clock size={16} />} />
        <Stat label="Drafts" value={count("draft")} icon={<PencilLine size={16} />} />
        <Stat label="Students enrolled" value={stats.reduce((t, s) => t + Number(s.enrolled), 0)} icon={<GraduationCap size={16} />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>To grade</CardTitle>
          {!toGrade?.length ? (
            <Empty compact icon={<ClipboardCheck size={18} />} title="Nothing to grade">New submissions will show up here.</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {toGrade.map((s: any) => (
                <li key={s.id} className="flex justify-between gap-2 py-2">
                  <Link href={`/professor/courses/${s.assignments.course_id}?tab=assignments`} className="hover:underline">
                    {names.get(s.student_id) ?? "Student"} · {s.assignments.title}
                  </Link>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(s.submitted_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>KPI notifications</CardTitle>
          {!alerts?.length ? (
            <Empty compact icon={<BellRing size={18} />} title="All clear">Every course is within its KPI thresholds.</Empty>
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
