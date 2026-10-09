import Link from "next/link";
import {
  assignExam,
  createExam,
  deleteExam,
  saveExamResults,
  submitExamResults,
  unassignExam,
  updateExam,
} from "@/app/professor/actions";
import { AudienceFields, audienceStudents, RequestChange, rosterClasses, StudentCell } from "@/app/professor/_components";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, buttonClass, Card, CardTitle, Empty, Input, Label, Select, Table, Td, Textarea } from "@/components/ui";
import { EXAM_KINDS, EXAM_RESULT_STATUS, examStage, getPendingChanges, getRoster, gradeFor, pendingKey, type RosterStudent } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatDay, pct, toLocalInput, today } from "@/lib/utils";

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
  audience: string;
  batch_id: string | null;
  assigned_at: string | null;
  results_status: string;
  review_note: string;
  submitted_at: string | null;
  approved_at: string | null;
  exam_results: { student_id: string; marks: number | null; absent: boolean; remarks: string }[];
  exam_students: { student_id: string }[];
  exam_submissions: { student_id: string; answer: string; link_url: string | null; submitted_at: string }[];
  exam_papers: { paper: string } | null;
}

/**
 * Examination management: formulate an exam (draft), assign it to students, collect online
 * answers, enter marks and submit the results to the Principal, who publishes them.
 */
export async function ExamsTab({ courseId, examId }: { courseId: string; examId?: string }) {
  const supabase = await createClient();
  const [{ data }, roster] = await Promise.all([
    supabase
      .from("exams")
      .select("*, exam_results(student_id, marks, absent, remarks), exam_students(student_id), exam_submissions(student_id, answer, link_url, submitted_at), exam_papers(paper)")
      .eq("course_id", courseId)
      .order("held_on", { ascending: false }),
    getRoster(supabase, courseId),
  ]);
  const exams = (data ?? []) as Exam[];
  const selected = exams.find((e) => e.id === examId);
  const classes = rosterClasses(roster);
  const forLabel = (e: Exam) =>
    e.audience === "batch" ? `Class: ${classes.find(([id]) => id === e.batch_id)?.[1] ?? "—"}`
      : e.audience === "students" ? `${e.exam_students.length} chosen` : "Whole course";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {selected ? (
          <ExamDetail courseId={courseId} exam={selected} roster={roster} />
        ) : (
          <Alert tone="info" title="Examination workflow">
            Formulate an exam as a draft, then assign it to students; they are notified. In an online exam students answer during the exam time.
            Enter marks, save as a draft and submit the results to the Principal. Results are published to students once the Principal approves them.
          </Alert>
        )}
        <Card>
          <CardTitle>Exams</CardTitle>
          <Table head={["Exam", "When", "Sat", "For", "Stage", ""]} empty={!exams.length}>
            {exams.map((e) => (
              <tr key={e.id} className={cn(e.id === examId && "bg-secondary/50")}>
                <Td><p className="font-medium">{e.title}</p><p className="text-xs text-muted-foreground">{EXAM_KINDS[e.kind] ?? e.kind} · out of {Number(e.max_marks)}</p></Td>
                <Td className="whitespace-nowrap">{e.starts_at ? formatDate(e.starts_at) : formatDay(e.held_on)}</Td>
                <Td>{e.mode === "online" ? `Online, ${e.duration_minutes} min` : "In class"}</Td>
                <Td>{forLabel(e)}</Td>
                <Td><StageBadge exam={e} /></Td>
                <Td className="text-right">
                  <Link href={`/professor/courses/${courseId}?tab=exams&exam=${e.id}`} className="text-sm text-primary hover:underline">Open</Link>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card className="h-fit">
        <CardTitle description="Saved as a draft until you assign it.">New exam</CardTitle>
        {!roster.length ? (
          <p className="text-sm text-muted-foreground">No students are enrolled in this course yet.</p>
        ) : (
          <form action={createExam} className="space-y-3">
            <input type="hidden" name="course_id" value={courseId} />
            <ExamFields roster={roster} />
            <SubmitButton className="w-full">Save exam</SubmitButton>
          </form>
        )}
      </Card>
    </div>
  );
}

function StageBadge({ exam }: { exam: Pick<Exam, "assigned_at" | "results_status"> }) {
  const stage = examStage(exam);
  return <Badge value={stage.tone}>{stage.label}</Badge>;
}

/** Formulation fields. Who sits the exam and how are fixed once there are answers or marks. */
function ExamFields({ exam, roster, locked }: { exam?: Exam; roster: RosterStudent[]; locked?: boolean }) {
  const mode = exam?.mode ?? "offline";
  return (
    <>
      <Label label="Title"><Input name="title" defaultValue={exam?.title} placeholder="e.g. Midterm examination" required /></Label>
      <div className="grid grid-cols-2 gap-3">
        <Label label="Type">
          <Select name="kind" defaultValue={exam?.kind ?? "class_test"}>
            {Object.entries(EXAM_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Label>
        <Label label="Total marks"><Input name="max_marks" type="number" min={1} step="0.5" defaultValue={exam?.max_marks ?? 100} required /></Label>
      </div>
      <Label label="Instructions" hint="Shown to students as soon as the exam is assigned."><Textarea name="instructions" defaultValue={exam?.instructions} className="min-h-16" /></Label>
      <div className="group space-y-3">
        {locked ? (
          <p className="text-xs text-muted-foreground">Sat {mode === "online" ? "online" : "in class"}. Students have answers or marks, so this and who sits the exam can no longer change.</p>
        ) : (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">How it is sat</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <label className="flex items-center gap-1.5"><input type="radio" name="mode" value="offline" defaultChecked={mode === "offline"} /> In class (on paper)</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="mode" value="online" defaultChecked={mode === "online"} /> Online</label>
            </div>
          </fieldset>
        )}
        <div className={cn(mode === "online" && locked ? "block" : "hidden group-has-[input[value=online]:checked]:block", "space-y-3")}>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Label label="Starts (Pakistan time)"><Input name="starts_at" type="datetime-local" defaultValue={toLocalInput(exam?.starts_at)} /></Label>
            <Label label="Minutes"><Input name="duration_minutes" type="number" min={5} max={600} defaultValue={exam?.duration_minutes ?? 60} /></Label>
          </div>
          <Label label="Question paper" hint="Students can open it only once the exam has started.">
            <Textarea name="paper" defaultValue={exam?.exam_papers?.paper} className="min-h-28" />
          </Label>
        </div>
        <div className={cn(mode === "online" && locked ? "hidden" : "group-has-[input[value=online]:checked]:hidden")}>
          <Label label="Date"><Input name="held_on" type="date" defaultValue={exam?.held_on ?? today()} /></Label>
        </div>
      </div>
      {!locked && (
        <AudienceFields roster={roster} audience={exam?.audience} batchId={exam?.batch_id} chosen={exam?.exam_students.map((s) => s.student_id)} />
      )}
    </>
  );
}

async function ExamDetail({ courseId, exam, roster }: { courseId: string; exam: Exam; roster: RosterStudent[] }) {
  const supabase = await createClient();
  const pending = await getPendingChanges(supabase, courseId);
  const students = audienceStudents(roster, exam.audience, exam.batch_id, exam.exam_students.map((s) => s.student_id));
  const byStudent = new Map(exam.exam_results.map((r) => [r.student_id, r]));
  const answers = new Map(exam.exam_submissions.map((s) => [s.student_id, s]));
  const max = Number(exam.max_marks);
  const returnTo = `/professor/courses/${courseId}?tab=exams&exam=${exam.id}`;
  const hidden = (
    <>
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="exam_id" value={exam.id} />
    </>
  );
  const assigned = !!exam.assigned_at;
  const locked = exam.exam_results.length > 0 || exam.exam_submissions.length > 0;
  const resultsLocked = exam.results_status === "pending" || exam.results_status === "approved";
  const ends = exam.starts_at && exam.duration_minutes ? new Date(new Date(exam.starts_at).getTime() + exam.duration_minutes * 60000) : null;

  return (
    <Card>
      <CardTitle
        description={
          <>
            {EXAM_KINDS[exam.kind] ?? exam.kind} · out of {max} ·{" "}
            {exam.mode === "online" ? `Online, ${formatDate(exam.starts_at)} to ${formatDate(ends?.toISOString())}` : `In class, ${formatDay(exam.held_on)}`}
            {` · ${students.length} student${students.length === 1 ? "" : "s"}`}
          </>
        }
        action={<StageBadge exam={exam} />}
      >
        {exam.title}
      </CardTitle>

      {exam.results_status === "returned" && (
        <Alert tone="warning" title="Returned by the Principal" className="mb-4">{exam.review_note}</Alert>
      )}
      {exam.results_status === "pending" && (
        <Alert tone="info" className="mb-4">Results submitted. They are published to students once the Principal approves them.</Alert>
      )}
      {exam.results_status === "approved" && (
        <Alert tone="success" className="mb-4">
          Results published {formatDate(exam.approved_at)}. Changes take effect once the Principal approves them.
        </Alert>
      )}
      {exam.instructions && <p className="mb-3 whitespace-pre-wrap text-sm">{exam.instructions}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!assigned ? (
          <form action={assignExam}>
            {hidden}
            <SubmitButton size="sm" confirm={`Assign "${exam.title}" to ${students.length} student${students.length === 1 ? "" : "s"}? They will be notified.`}>
              Assign to students
            </SubmitButton>
          </form>
        ) : (
          !locked && (
            <form action={unassignExam}>
              {hidden}
              <SubmitButton size="sm" variant="outline">Withdraw</SubmitButton>
            </form>
          )
        )}
        {!resultsLocked && !exam.exam_submissions.length && (
          <form action={deleteExam}>
            {hidden}
            <SubmitButton size="sm" variant="ghost" confirm="Delete this exam and its draft marks?">Delete exam</SubmitButton>
          </form>
        )}
      </div>

      {!resultsLocked && (
        <details className="mb-4 rounded-md border border-border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-primary">Edit exam</summary>
          <form action={updateExam} className="mt-3 space-y-3">
            {hidden}
            <ExamFields exam={exam} roster={roster} locked={locked} />
            <SubmitButton size="sm">Save changes</SubmitButton>
          </form>
        </details>
      )}

      {!assigned ? (
        <Empty compact>Assign the exam to students before entering marks.</Empty>
      ) : !students.length ? (
        <Empty compact>No enrolled students are sitting this exam.</Empty>
      ) : resultsLocked ? (
        <Table head={["Student", "Marks", "Percent", "Grade", "Remarks", ""]}>
          {students.map((s) => {
            const r = byStudent.get(s.student_id);
            const percent = r && !r.absent && r.marks != null ? (Number(r.marks) / max) * 100 : null;
            return (
              <tr key={s.student_id}>
                <Td><StudentCell name={s.full_name} code={s.user_code} /><Answer answer={answers.get(s.student_id)} /></Td>
                <Td>{!r ? "—" : r.absent ? <Badge value="absent" tone="danger" /> : Number(r.marks)}</Td>
                <Td>{pct(percent)}</Td>
                <Td>{gradeFor(percent) || "—"}</Td>
                <Td className="text-xs text-muted-foreground">{r?.remarks || "—"}</Td>
                <Td className="text-right">
                  {r && exam.results_status === "approved" && (
                    <RequestChange kind="exam_result" targetId={exam.id} studentId={s.student_id} returnTo={returnTo} max={max}
                      current={{ marks: r.marks, absent: r.absent, remarks: r.remarks }} pending={pending.has(pendingKey("exam_result", exam.id, s.student_id))} />
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <form className="space-y-4">
          {hidden}
          <Table head={["Student", `Marks (/${max})`, "Absent", "Remarks"]}>
            {students.map((s) => {
              const r = byStudent.get(s.student_id);
              return (
                <tr key={s.student_id} className="align-top">
                  <Td><StudentCell name={s.full_name} code={s.user_code} /><input type="hidden" name="student_id" value={s.student_id} /><Answer answer={answers.get(s.student_id)} /></Td>
                  <Td>
                    <Input name={`marks_${s.student_id}`} type="number" step="0.5" min={0} max={max} defaultValue={r?.marks ?? ""}
                      aria-label={`Marks for ${s.full_name}`} className="w-24" />
                  </Td>
                  <Td><input type="checkbox" name={`absent_${s.student_id}`} defaultChecked={r?.absent} aria-label={`${s.full_name} was absent`} /></Td>
                  <Td><Input name={`remarks_${s.student_id}`} defaultValue={r?.remarks ?? ""} aria-label={`Remarks for ${s.full_name}`} /></Td>
                </tr>
              );
            })}
          </Table>
          <div className="flex flex-wrap gap-2">
            <button formAction={saveExamResults} className={buttonClass("outline")}>Save draft</button>
            <button formAction={submitExamResults} className={buttonClass("primary")}>Submit results to the Principal</button>
          </div>
        </form>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Results: {EXAM_RESULT_STATUS[exam.results_status]}</p>
    </Card>
  );
}

/** A student's online answer, collapsed under their name. */
function Answer({ answer }: { answer?: Exam["exam_submissions"][number] }) {
  if (!answer) return null;
  return (
    <details className="mt-1 max-w-md text-xs">
      <summary className="cursor-pointer text-primary">Answer · {formatDate(answer.submitted_at)}</summary>
      {answer.answer && <p className="mt-1 whitespace-pre-wrap text-foreground">{answer.answer}</p>}
      {answer.link_url && <a href={answer.link_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{answer.link_url}</a>}
    </details>
  );
}
