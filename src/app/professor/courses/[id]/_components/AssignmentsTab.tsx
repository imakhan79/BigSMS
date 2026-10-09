import {
  assignAssignment,
  deleteAssignment,
  gradeSubmission,
  saveAssignment,
  setSubmissionStatus,
  updateAssignment,
  withdrawAssignment,
} from "@/app/professor/actions";
import { AudienceFields, audienceStudents, RequestChange, rosterClasses, StudentCell } from "@/app/professor/_components";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, Card, CardTitle, Empty, Input, Label, Textarea } from "@/components/ui";
import { getPendingChanges, getRoster, pendingKey, type RosterStudent, SUBMISSION_STATUS_LABEL } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, toLocalInput } from "@/lib/utils";

const STATUS_TONE = { submitted: "warning", graded: "success", missing: "danger", excused: "neutral" } as const;

interface Assignment {
  id: string;
  title: string;
  instructions: string;
  due_at: string | null;
  max_score: number;
  published: boolean;
  assigned_at: string | null;
  audience: "course" | "batch" | "students";
  batch_id: string | null;
  submissions: Submission[];
  assignment_students: { student_id: string }[];
}

interface Submission {
  id: string;
  student_id: string;
  status: string;
  content: string;
  link_url: string | null;
  score: number | null;
  feedback: string | null;
  submitted_at: string;
  late: boolean;
}

interface StatusCounts {
  assignment_id: string;
  assigned: number;
  submitted: number;
  late: number;
  graded: number;
  missing: number;
  excused: number;
  pending: number;
}

/**
 * Assignment management (BRD 10): formulate a draft, assign it to the course, a class or chosen
 * students, take submissions (late ones are marked), grade them and follow each student's status.
 */
export async function AssignmentsTab({ courseId }: { courseId: string }) {
  const supabase = await createClient();
  const [{ data }, roster, pending, { data: statusRows }] = await Promise.all([
    supabase.from("assignments").select("*, submissions(*), assignment_students(student_id)").eq("course_id", courseId).order("created_at"),
    getRoster(supabase, courseId),
    getPendingChanges(supabase, courseId),
    supabase.rpc("assignment_status", { p_course_id: courseId }),
  ]);
  const assignments = (data ?? []) as Assignment[];
  const counts = new Map(((statusRows ?? []) as StatusCounts[]).map((r) => [r.assignment_id, r]));
  const classes = rosterClasses(roster);
  const returnTo = `/professor/courses/${courseId}?tab=assignments`;

  const studentsOf = (a: Assignment) => audienceStudents(roster, a.audience, a.batch_id, a.assignment_students.map((x) => x.student_id));
  const audienceLabel = (a: Assignment) =>
    a.audience === "batch"
      ? `Class: ${classes.find(([id]) => id === a.batch_id)?.[1] ?? "—"}`
      : a.audience === "students"
        ? `${a.assignment_students.length} chosen student${a.assignment_students.length === 1 ? "" : "s"}`
        : "Whole course";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Alert tone="info" title="Assignment workflow">
          Formulate a draft, then assign it to students; they are notified. Work handed in after the due date is accepted and marked late.
          A saved grade is final; changing it needs the Principal&apos;s approval.
        </Alert>
        {!assignments.length && <Empty>No assignments yet.</Empty>}
        {assignments.map((a) => {
          const students = studentsOf(a);
          const byStudent = new Map(a.submissions.map((s) => [s.student_id, s]));
          const c = counts.get(a.id);
          const pastDue = !!a.due_at && new Date(a.due_at) < new Date();
          return (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{a.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {audienceLabel(a)} · Due {formatDate(a.due_at)} · out of {a.max_score}
                    {a.assigned_at && ` · Assigned ${formatDate(a.assigned_at)}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge value={a.published ? "published" : "draft"}>{a.published ? "Assigned" : "Draft"}</Badge>
                  {!a.published ? (
                    <form action={assignAssignment}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="course_id" value={courseId} />
                      <SubmitButton size="sm" confirm={`Assign "${a.title}" to ${students.length} student${students.length === 1 ? "" : "s"}? They will be notified.`}>
                        Assign to students
                      </SubmitButton>
                    </form>
                  ) : (
                    !a.submissions.length && (
                      <form action={withdrawAssignment}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="course_id" value={courseId} />
                        <SubmitButton size="sm" variant="outline">Withdraw</SubmitButton>
                      </form>
                    )
                  )}
                  {!a.submissions.some((s) => s.status === "graded") && (
                    <form action={deleteAssignment}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="course_id" value={courseId} />
                      <SubmitButton size="sm" variant="ghost" confirm="Delete this assignment and all submissions?">Delete</SubmitButton>
                    </form>
                  )}
                </div>
              </div>
              {a.instructions && <p className="mt-2 whitespace-pre-wrap text-sm">{a.instructions}</p>}

              <details className="mt-3 rounded-md border border-border px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-primary">Edit assignment</summary>
                <form action={updateAssignment} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="course_id" value={courseId} />
                  <AssignmentFields a={a} roster={roster} audienceLocked={a.submissions.length > 0} />
                  <SubmitButton size="sm">Save changes</SubmitButton>
                </form>
              </details>

              {a.published && c && (
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span><b className="text-foreground">{c.assigned}</b> assigned</span>
                  <span><b className="text-foreground">{c.pending}</b> not submitted</span>
                  <span><b className="text-foreground">{c.submitted}</b> to grade</span>
                  <span><b className="text-foreground">{c.graded}</b> graded</span>
                  <span><b className={cn(c.late ? "text-warning" : "text-foreground")}>{c.late}</b> late</span>
                  <span><b className="text-foreground">{c.missing}</b> missing</span>
                  <span><b className="text-foreground">{c.excused}</b> excused</span>
                </div>
              )}

              {a.published && (
                <>
                  <h4 className="mt-4 text-sm font-semibold">Submission status</h4>
                  {!students.length ? (
                    <p className="text-sm text-muted-foreground">No enrolled students are assigned this assignment.</p>
                  ) : (
                    <div className="mt-2 space-y-3">
                      {students.map((st) => {
                        const s = byStudent.get(st.student_id);
                        const status = s?.status;
                        return (
                          <div key={st.student_id} className="rounded-md border border-border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                              <div><StudentCell name={st.full_name} code={st.user_code} /></div>
                              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {s && status !== "missing" && status !== "excused" && formatDate(s.submitted_at)}
                                {s?.late && <Badge value="late">Late submission</Badge>}
                                {status ? (
                                  <Badge value={status} tone={STATUS_TONE[status as keyof typeof STATUS_TONE]}>{SUBMISSION_STATUS_LABEL[status] ?? status}</Badge>
                                ) : (
                                  <Badge value={pastDue ? "overdue" : "none"} tone={pastDue ? "danger" : "neutral"}>{pastDue ? "Overdue" : "Not submitted"}</Badge>
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
                                  <span className="font-semibold">{s!.score} / {a.max_score}</span>
                                  {s!.feedback && <span className="text-muted-foreground"> · {s!.feedback}</span>}
                                </p>
                                <RequestChange kind="assignment_grade" targetId={a.id} studentId={st.student_id} returnTo={returnTo} max={a.max_score}
                                  current={{ score: s!.score, feedback: s!.feedback ?? "" }} pending={pending.has(pendingKey("assignment_grade", a.id, st.student_id))} />
                              </div>
                            ) : (
                              <div className="mt-3 space-y-2">
                                {status === "submitted" && (
                                  <form action={gradeSubmission} className="grid gap-2 sm:grid-cols-[6rem_1fr_auto]">
                                    <input type="hidden" name="id" value={s!.id} />
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
                </>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="h-fit">
        <CardTitle description="Saved as a draft until you assign it.">New assignment</CardTitle>
        {!roster.length ? (
          <p className="text-sm text-muted-foreground">No students are enrolled in this course yet.</p>
        ) : (
          <form action={saveAssignment} className="space-y-3">
            <input type="hidden" name="course_id" value={courseId} />
            <AssignmentFields roster={roster} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="assign_now" /> Assign to students now</label>
            <SubmitButton className="w-full">Save assignment</SubmitButton>
          </form>
        )}
      </Card>
    </div>
  );
}

/** Title, instructions, due date, maximum score and who the assignment is for. */
function AssignmentFields({ a, roster, audienceLocked }: { a?: Assignment; roster: RosterStudent[]; audienceLocked?: boolean }) {
  return (
    <>
      <Label label="Title"><Input name="title" defaultValue={a?.title} required /></Label>
      <Label label="Instructions"><Textarea name="instructions" defaultValue={a?.instructions} /></Label>
      <div className="grid grid-cols-2 gap-3">
        <Label label="Due (Pakistan time)"><Input name="due_at" type="datetime-local" defaultValue={toLocalInput(a?.due_at)} /></Label>
        <Label label="Max score"><Input name="max_score" type="number" min={1} defaultValue={a?.max_score ?? 100} /></Label>
      </div>
      {audienceLocked ? (
        <p className="text-xs text-muted-foreground">Students have handed in work, so who this assignment is for can no longer change.</p>
      ) : (
        <AudienceFields roster={roster} audience={a?.audience} batchId={a?.batch_id} chosen={a?.assignment_students.map((x) => x.student_id)} />
      )}
    </>
  );
}
