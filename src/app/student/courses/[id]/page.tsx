import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { submitAssignment, toggleLecture } from "@/app/student/actions";
import { MaterialLink } from "@/components/MaterialLink";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Empty, Flash, type FlashParams, Input, LinkButton, PageHeader, Tabs, Textarea } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

const TABS = [
  { id: "outline", label: "Outline" },
  { id: "lectures", label: "Lectures" },
  { id: "assignments", label: "Assignments" },
  { id: "quizzes", label: "Quizzes" },
];

export default async function StudentCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FlashParams & { tab?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const profile = await requireRole("student");
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("*, professor:profiles!courses_professor_id_fkey(full_name)")
    .eq("id", id)
    .single();
  if (!course) notFound();
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : "outline";

  const [{ data: lectures }, { data: materials }, { data: done }, { data: assignments }, { data: quizzes }] = await Promise.all([
    supabase.from("lectures").select("*").eq("course_id", id).order("position"),
    supabase.from("materials").select("*").eq("course_id", id).order("created_at"),
    supabase.from("lecture_progress").select("lecture_id").eq("course_id", id).eq("student_id", profile.id),
    supabase.from("assignments").select("*, submissions(*)").eq("course_id", id).eq("submissions.student_id", profile.id).order("due_at"),
    supabase.from("quizzes").select("*, quiz_attempts(score, total, submitted_at)").eq("course_id", id).eq("quiz_attempts.student_id", profile.id).order("created_at"),
  ]);
  const completed = new Set(done?.map((d) => d.lecture_id));

  return (
    <>
      <PageHeader
        title={course.title}
        subtitle={course.professor?.full_name}
        eyebrow={<Link href="/student" className="transition-colors hover:text-foreground">My courses</Link>}
      />
      <Flash params={sp} />
      <Tabs items={TABS.map((t) => ({ href: `/student/courses/${id}?tab=${t.id}`, label: t.label, active: tab === t.id }))} />

      {tab === "outline" && (
        <Card>
          <CardTitle>About this course</CardTitle>
          <p className="text-sm">{course.description || "No description."}</p>
          {course.outline ? (
            <pre className="mt-4 whitespace-pre-wrap rounded bg-secondary p-4 font-sans text-sm">{course.outline}</pre>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No outline provided.</p>
          )}
          <p className="mt-4 text-sm">{completed.size} of {lectures?.length ?? 0} lectures completed.</p>
        </Card>
      )}

      {tab === "lectures" && (
        <div className="space-y-4">
          {!lectures?.length && <Empty>No lectures yet.</Empty>}
          {lectures?.map((l) => {
            const isDone = completed.has(l.id);
            return (
              <Card key={l.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">{l.position}. {l.title}</h3>
                  <form action={toggleLecture}>
                    <input type="hidden" name="course_id" value={id} />
                    <input type="hidden" name="lecture_id" value={l.id} />
                    <input type="hidden" name="done" value={String(isDone)} />
                    <button className={cn("inline-flex items-center gap-1 text-sm", isDone ? "text-success" : "text-muted-foreground hover:text-foreground")}>
                      {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />} {isDone ? "Completed" : "Mark complete"}
                    </button>
                  </form>
                </div>
                {l.content && <p className="mt-2 whitespace-pre-wrap text-sm">{l.content}</p>}
                <ul className="mt-3 space-y-1 text-sm">
                  {materials?.filter((m) => m.lecture_id === l.id).map((m) => (
                    <li key={m.id} className="flex items-center gap-2"><Badge value={m.type} /><MaterialLink material={m} /></li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {!!materials?.some((m) => !m.lecture_id) && (
            <Card className="p-4">
              <h3 className="font-semibold">Course materials</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {materials.filter((m) => !m.lecture_id).map((m) => (
                  <li key={m.id} className="flex items-center gap-2"><Badge value={m.type} /><MaterialLink material={m} /></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === "assignments" && (
        <div className="space-y-4">
          {!assignments?.length && <Empty>No assignments yet.</Empty>}
          {assignments?.map((a: any) => {
            const sub = a.submissions?.[0];
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="text-xs text-muted-foreground">Due {formatDate(a.due_at)} · out of {a.max_score}</p>
                  </div>
                  {sub ? <Badge value={sub.status} /> : <Badge value="pending">Not submitted</Badge>}
                </div>
                {a.instructions && <p className="mt-2 whitespace-pre-wrap text-sm">{a.instructions}</p>}
                {sub?.status === "graded" ? (
                  <div className="mt-3 rounded-md bg-secondary p-3 text-sm">
                    <p className="font-semibold text-primary">Score: {sub.score}/{a.max_score}</p>
                    {sub.feedback && <p className="mt-1">Feedback: {sub.feedback}</p>}
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{sub.content}</p>
                  </div>
                ) : (
                  <form action={submitAssignment} className="mt-3 space-y-2">
                    <input type="hidden" name="course_id" value={id} />
                    <input type="hidden" name="assignment_id" value={a.id} />
                    <Textarea name="content" defaultValue={sub?.content} placeholder="Your answer" aria-label="Your answer" required />
                    <Input name="link_url" type="url" defaultValue={sub?.link_url ?? ""} placeholder="Optional link (e.g. shared document)" aria-label="Link" />
                    <SubmitButton size="sm">{sub ? "Resubmit" : "Submit"}</SubmitButton>
                  </form>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === "quizzes" && (
        <div className="space-y-4">
          {!quizzes?.length && <Empty>No quizzes yet.</Empty>}
          {quizzes?.map((q: any) => {
            const attempt = q.quiz_attempts?.[0];
            return (
              <Card key={q.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{q.title}</h3>
                  {q.description && <p className="text-sm text-muted-foreground">{q.description}</p>}
                </div>
                {attempt ? (
                  <span className="text-sm font-semibold text-primary">Score {attempt.score}/{attempt.total} · {formatDate(attempt.submitted_at)}</span>
                ) : (
                  <LinkButton href={`/student/quizzes/${q.id}`} variant="accent">Take quiz</LinkButton>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
