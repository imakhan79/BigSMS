import { submitExamAnswer } from "@/app/student/exams/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, Card, Empty, Flash, type FlashParams, Input, PageHeader, Textarea } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { EXAM_KINDS, gradeFor } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDay, pct } from "@/lib/utils";

interface Exam {
  id: string;
  title: string;
  kind: string;
  held_on: string;
  max_marks: number;
  instructions: string;
  mode: "offline" | "online";
  starts_at: string | null;
  duration_minutes: number | null;
  results_status: string;
  course: { title: string } | null;
  exam_papers: { paper: string } | null;
  exam_submissions: { answer: string; link_url: string | null; submitted_at: string }[];
  exam_results: { marks: number | null; absent: boolean; remarks: string }[];
}

/** The student's exams: schedule, online answering while open, and results once the Principal publishes them. */
export default async function StudentExamsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  const profile = await requireRole("student");
  const supabase = await createClient();
  const { data } = await supabase
    .from("exams")
    .select("id, title, kind, held_on, max_marks, instructions, mode, starts_at, duration_minutes, results_status, course:courses(title), exam_papers(paper), exam_submissions(answer, link_url, submitted_at), exam_results(marks, absent, remarks)")
    .eq("exam_submissions.student_id", profile.id)
    .eq("exam_results.student_id", profile.id)
    .order("held_on", { ascending: false });
  const exams = (data ?? []) as unknown as Exam[];
  const now = Date.now();

  return (
    <>
      <PageHeader title="My exams" subtitle="Your exams, online papers while they are open, and results once the Principal publishes them." />
      <Flash params={params} />
      {!exams.length && <Empty>No exams yet.</Empty>}
      <div className="space-y-4">
        {exams.map((e) => {
          const start = e.starts_at ? new Date(e.starts_at).getTime() : null;
          const end = start != null && e.duration_minutes ? start + e.duration_minutes * 60000 : null;
          const open = e.mode === "online" && start != null && end != null && now >= start && now <= end;
          const answer = e.exam_submissions[0];
          const result = e.results_status === "approved" ? e.exam_results[0] : undefined;
          const percent = result && !result.absent && result.marks != null ? (Number(result.marks) / Number(e.max_marks)) * 100 : null;
          return (
            <Card key={e.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{e.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {e.course?.title} · {EXAM_KINDS[e.kind] ?? e.kind} · out of {Number(e.max_marks)} ·{" "}
                    {e.mode === "online" ? `Online, ${formatDate(e.starts_at)} (${e.duration_minutes} min)` : `In class, ${formatDay(e.held_on)}`}
                  </p>
                </div>
                {result ? (
                  <Badge value="published">Result published</Badge>
                ) : open ? (
                  <Badge value="open" tone="success">Open now</Badge>
                ) : answer ? (
                  <Badge value="submitted">Answers submitted</Badge>
                ) : (
                  <Badge value="pending">{start != null && now < start ? "Upcoming" : "Awaiting result"}</Badge>
                )}
              </div>
              {e.instructions && <p className="mt-2 whitespace-pre-wrap text-sm">{e.instructions}</p>}

              {result && (
                <div className="mt-3 rounded-md bg-secondary p-3 text-sm">
                  {result.absent ? (
                    <p className="font-semibold text-danger">Absent</p>
                  ) : (
                    <p className="font-semibold text-primary">
                      Marks: {Number(result.marks)} / {Number(e.max_marks)} · {pct(percent)} · Grade {gradeFor(percent) || "—"}
                    </p>
                  )}
                  {result.remarks && <p className="mt-1">Remarks: {result.remarks}</p>}
                </div>
              )}

              {open && (
                <div className="mt-3 space-y-3">
                  {e.exam_papers?.paper && (
                    <div className="rounded-md border border-border p-3">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Question paper</p>
                      <p className="whitespace-pre-wrap text-sm">{e.exam_papers.paper}</p>
                    </div>
                  )}
                  <Alert tone="info">The exam closes at {formatDate(new Date(end!).toISOString())}. You can resubmit until then.</Alert>
                  <form action={submitExamAnswer} className="space-y-2">
                    <input type="hidden" name="exam_id" value={e.id} />
                    <Textarea name="answer" defaultValue={answer?.answer} placeholder="Your answers" aria-label="Your answers" className="min-h-40" />
                    <Input name="link_url" type="url" defaultValue={answer?.link_url ?? ""} placeholder="Optional link (e.g. shared document)" aria-label="Link" />
                    <SubmitButton size="sm">{answer ? "Resubmit answers" : "Submit answers"}</SubmitButton>
                  </form>
                </div>
              )}
              {!open && answer && !result && (
                <p className="mt-3 text-xs text-muted-foreground">Answers submitted {formatDate(answer.submitted_at)}.</p>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
