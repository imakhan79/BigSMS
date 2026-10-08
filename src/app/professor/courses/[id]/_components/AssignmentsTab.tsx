import { deleteAssignment, gradeSubmission, saveAssignment, setSubmissionStatus, toggleAssignment } from "@/app/professor/actions";
import { RequestChange, StudentCell } from "@/app/professor/_components";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Empty, Input, Label, Textarea } from "@/components/ui";
import { getPendingChanges, getRoster, pendingKey, SUBMISSION_STATUS_LABEL } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

const STATUS_TONE = { submitted: "warning", graded: "success", missing: "danger", excused: "neutral" } as const;

export async function AssignmentsTab({ courseId }: { courseId: string }) {
  const supabase = await createClient();
  const [{ data: assignments }, roster, pending] = await Promise.all([
    supabase.from("assignments").select("*, submissions(*)").eq("course_id", courseId).order("created_at"),
    getRoster(supabase, courseId),
    getPendingChanges(supabase, courseId),
  ]);
  const returnTo = `/professor/courses/${courseId}?tab=assignments`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {!assignments?.length && <Empty>No assignments yet.</Empty>}
        {assignments?.map((a: any) => {
          const byStudent = new Map<string, any>(a.submissions.map((s: any) => [s.student_id, s]));
          const graded = a.submissions.filter((s: any) => s.status === "graded").length;
          return (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{a.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    Due {formatDate(a.due_at)} · out of {a.max_score} · {graded} of {roster.length} graded
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge value={a.published ? "published" : "draft"} />
                  <form action={toggleAssignment}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="course_id" value={courseId} />
                    <input type="hidden" name="published" value={String(!a.published)} />
                    <SubmitButton size="sm" variant="outline">{a.published ? "Unpublish" : "Publish"}</SubmitButton>
                  </form>
                  {!graded && (
                    <form action={deleteAssignment}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="course_id" value={courseId} />
                      <SubmitButton size="sm" variant="ghost" confirm="Delete this assignment and all submissions?">Delete</SubmitButton>
                    </form>
                  )}
                </div>
              </div>
              {a.instructions && <p className="mt-2 whitespace-pre-wrap text-sm">{a.instructions}</p>}

              <h4 className="mt-4 text-sm font-semibold">Students</h4>
              {!roster.length ? (
                <p className="text-sm text-muted-foreground">No students are enrolled in this class.</p>
              ) : (
                <div className="mt-2 space-y-3">
                  {roster.map((st) => {
                    const s = byStudent.get(st.student_id);
                    const status: string | undefined = s?.status;
                    return (
                      <div key={st.student_id} className="rounded-md border border-border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                          <div><StudentCell name={st.full_name} code={st.user_code} /></div>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {s && formatDate(s.submitted_at)}
                            {status ? (
                              <Badge value={status} tone={STATUS_TONE[status as keyof typeof STATUS_TONE]}>{SUBMISSION_STATUS_LABEL[status] ?? status}</Badge>
                            ) : (
                              <Badge value="none" tone="neutral">Not submitted</Badge>
                            )}
                          </span>
                        </div>
                        {s?.content && <p className="mt-2 whitespace-pre-wrap text-sm">{s.content}</p>}
                        {s?.link_url && (
                          <a href={s.link_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{s.link_url}</a>
                        )}

                        {status === "graded" ? (
                          <div className="mt-3 flex flex-wrap items-start justify-between gap-2 text-sm">
                            <p>
                              <span className="font-semibold">{s.score} / {a.max_score}</span>
                              {s.feedback && <span className="text-muted-foreground"> · {s.feedback}</span>}
                            </p>
                            <RequestChange kind="assignment_grade" targetId={a.id} studentId={st.student_id} returnTo={returnTo} max={a.max_score}
                              current={{ score: s.score, feedback: s.feedback ?? "" }} pending={pending.has(pendingKey("assignment_grade", a.id, st.student_id))} />
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {s && (
                              <form action={gradeSubmission} className="grid gap-2 sm:grid-cols-[6rem_1fr_auto]">
                                <input type="hidden" name="id" value={s.id} />
                                <input type="hidden" name="course_id" value={courseId} />
                                <input type="hidden" name="max_score" value={a.max_score} />
                                <Input name="score" type="number" step="0.5" min={0} max={a.max_score} placeholder="Score" aria-label="Score" required />
                                <Input name="feedback" placeholder="Feedback for the student" aria-label="Feedback" />
                                <SubmitButton size="md" confirm="Grades are final once saved. Later changes need the Principal's approval." confirmTitle="Save this grade?">Grade</SubmitButton>
                              </form>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="text-muted-foreground">Record status:</span>
                              {(["submitted", "missing", "excused"] as const)
                                .filter((next) => next !== status)
                                .map((next) => (
                                  <form key={next} action={setSubmissionStatus}>
                                    <input type="hidden" name="course_id" value={courseId} />
                                    <input type="hidden" name="assignment_id" value={a.id} />
                                    <input type="hidden" name="student_id" value={st.student_id} />
                                    <input type="hidden" name="submission_id" value={s?.id ?? ""} />
                                    <input type="hidden" name="status" value={next} />
                                    <SubmitButton size="sm" variant="ghost">{next === "submitted" ? "Handed in" : SUBMISSION_STATUS_LABEL[next]}</SubmitButton>
                                  </form>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="h-fit">
        <CardTitle>New assignment</CardTitle>
        <form action={saveAssignment} className="space-y-3">
          <input type="hidden" name="course_id" value={courseId} />
          <Label label="Title"><Input name="title" required /></Label>
          <Label label="Instructions"><Textarea name="instructions" /></Label>
          <div className="grid grid-cols-2 gap-3">
            <Label label="Due"><Input name="due_at" type="datetime-local" /></Label>
            <Label label="Max score"><Input name="max_score" type="number" min={1} defaultValue={100} /></Label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" /> Publish to students now</label>
          <SubmitButton className="w-full">Create assignment</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
