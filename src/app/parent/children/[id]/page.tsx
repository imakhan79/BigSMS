import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressCards } from "@/components/ProgressCards";
import { Badge, Card, CardTitle, Empty, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { StudentProgress } from "@/lib/types";
import { formatDate } from "@/lib/utils";

// Parents only see what their child sees: published courses, published assignments/quizzes,
// the child's own submissions, scores and feedback. RLS enforces this in the database.
export default async function ChildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("parent");
  const supabase = await createClient();

  const { data: child } = await supabase.from("profiles").select("id, full_name, email").eq("id", id).single();
  if (!child) notFound();

  const { data: progress } = await supabase.rpc("student_progress", { p_student_id: id });
  // Limit to this child's courses (a parent with several children can see all their courses).
  const courseIds = ((progress ?? []) as StudentProgress[]).map((p) => p.course_id);

  const [{ data: assignments }, { data: quizzes }] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, due_at, max_score, courses(title), submissions(status, score, feedback, submitted_at)")
      .in("course_id", courseIds)
      .eq("submissions.student_id", id)
      .order("due_at", { ascending: false }),
    supabase
      .from("quizzes")
      .select("id, title, courses(title), quiz_attempts(score, total, submitted_at)")
      .in("course_id", courseIds)
      .eq("quiz_attempts.student_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader
        title={child.full_name || child.email}
        subtitle="Progress overview"
        action={<Link href="/parent" className="text-sm text-primary hover:underline">← My children</Link>}
      />
      <ProgressCards rows={(progress ?? []) as StudentProgress[]} />

      <Card className="mt-6">
        <CardTitle>Assignments</CardTitle>
        {!assignments?.length ? (
          <Empty>No assignments.</Empty>
        ) : (
          <Table head={["Course", "Assignment", "Due", "Status", "Score", "Feedback"]}>
            {assignments.map((a: any) => {
              const s = a.submissions?.[0];
              return (
                <tr key={a.id}>
                  <Td>{a.courses?.title}</Td>
                  <Td className="font-medium">{a.title}</Td>
                  <Td className="whitespace-nowrap">{formatDate(a.due_at)}</Td>
                  <Td>{s ? <Badge value={s.status} /> : <Badge value="pending">Not submitted</Badge>}</Td>
                  <Td>{s?.status === "graded" ? `${s.score}/${a.max_score}` : "—"}</Td>
                  <Td className="text-xs">{s?.status === "graded" ? s.feedback ?? "—" : "—"}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardTitle>Quizzes</CardTitle>
        {!quizzes?.length ? (
          <Empty>No quizzes.</Empty>
        ) : (
          <Table head={["Course", "Quiz", "Score", "Taken"]}>
            {quizzes.map((q: any) => {
              const a = q.quiz_attempts?.[0];
              return (
                <tr key={q.id}>
                  <Td>{q.courses?.title}</Td>
                  <Td className="font-medium">{q.title}</Td>
                  <Td>{a ? `${a.score}/${a.total}` : "Not taken"}</Td>
                  <Td>{a ? formatDate(a.submitted_at) : "—"}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
