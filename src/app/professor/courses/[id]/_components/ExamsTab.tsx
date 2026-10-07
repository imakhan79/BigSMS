import Link from "next/link";
import { createExam, deleteExam, saveExamResults, submitExamResults } from "@/app/professor/actions";
import { RequestChange, StudentCell } from "@/app/professor/_components";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, buttonClass, Card, CardTitle, Empty, Input, Label, Select, Table, Td } from "@/components/ui";
import { EXAM_KINDS, getPendingChanges, getRoster, gradeFor, pendingKey } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDay, pct, today } from "@/lib/utils";

interface Exam {
  id: string;
  title: string;
  kind: string;
  held_on: string;
  max_marks: number;
  submitted_at: string | null;
  exam_results: { student_id: string; marks: number | null; absent: boolean; remarks: string }[];
}

export async function ExamsTab({ courseId, examId }: { courseId: string; examId?: string }) {
  const supabase = await createClient();
  const [{ data }, roster] = await Promise.all([
    supabase
      .from("exams")
      .select("id, title, kind, held_on, max_marks, submitted_at, exam_results(student_id, marks, absent, remarks)")
      .eq("course_id", courseId)
      .order("held_on", { ascending: false }),
    getRoster(supabase, courseId),
  ]);
  const exams = (data ?? []) as Exam[];
  const selected = exams.find((e) => e.id === examId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {selected ? (
          <MarkSheet courseId={courseId} exam={selected} roster={roster} />
        ) : (
          <Alert tone="info" title="Marks and exam results">
            Add an exam, enter marks for every student and save as a draft. Submit the results when they are complete. After that, changes need the Principal&apos;s approval.
          </Alert>
        )}
        <Card>
          <CardTitle>Exams</CardTitle>
          <Table head={["Exam", "Date", "Out of", "Class average", "Status", ""]} empty={!exams.length}>
            {exams.map((e) => {
              const marked = e.exam_results.filter((r) => !r.absent && r.marks != null);
              const avg = marked.length ? (marked.reduce((t, r) => t + Number(r.marks), 0) / marked.length / Number(e.max_marks)) * 100 : null;
              return (
                <tr key={e.id} className={cn(e.id === examId && "bg-secondary/50")}>
                  <Td><p className="font-medium">{e.title}</p><p className="text-xs text-muted-foreground">{EXAM_KINDS[e.kind] ?? e.kind}</p></Td>
                  <Td>{formatDay(e.held_on)}</Td>
                  <Td>{Number(e.max_marks)}</Td>
                  <Td>{pct(avg)}</Td>
                  <Td><Badge value={e.submitted_at ? "submitted" : "draft"} /></Td>
                  <Td className="text-right">
                    <Link href={`/professor/courses/${courseId}?tab=exams&exam=${e.id}`} className="text-sm text-primary hover:underline">
                      {e.submitted_at ? "View" : "Enter marks"}
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </div>

      <Card className="h-fit">
        <CardTitle>New exam</CardTitle>
        <form action={createExam} className="space-y-3">
          <input type="hidden" name="course_id" value={courseId} />
          <Label label="Title"><Input name="title" placeholder="e.g. Midterm examination" required /></Label>
          <Label label="Type">
            <Select name="kind" defaultValue="class_test">
              {Object.entries(EXAM_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </Select>
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <Label label="Date"><Input name="held_on" type="date" defaultValue={today()} required /></Label>
            <Label label="Total marks"><Input name="max_marks" type="number" min={1} step="0.5" defaultValue={100} required /></Label>
          </div>
          <SubmitButton className="w-full">Add exam</SubmitButton>
        </form>
      </Card>
    </div>
  );
}

async function MarkSheet({ courseId, exam, roster }: { courseId: string; exam: Exam; roster: Awaited<ReturnType<typeof getRoster>> }) {
  const supabase = await createClient();
  const pending = await getPendingChanges(supabase, courseId);
  const byStudent = new Map(exam.exam_results.map((r) => [r.student_id, r]));
  const max = Number(exam.max_marks);
  const returnTo = `/professor/courses/${courseId}?tab=exams&exam=${exam.id}`;
  const title = `${exam.title} · ${formatDay(exam.held_on)} · out of ${max}`;

  if (exam.submitted_at) {
    return (
      <Card>
        <CardTitle description="Submitted. Changes take effect once the Principal approves them." action={<Badge value="submitted" />}>{title}</CardTitle>
        <Table head={["Student", "Marks", "Percent", "Grade", "Remarks", ""]} empty={!roster.length}>
          {roster.map((s) => {
            const r = byStudent.get(s.student_id);
            const percent = r && !r.absent && r.marks != null ? (Number(r.marks) / max) * 100 : null;
            return (
              <tr key={s.student_id}>
                <Td><StudentCell name={s.full_name} code={s.user_code} /></Td>
                <Td>{!r ? "—" : r.absent ? <Badge value="absent" tone="danger" /> : Number(r.marks)}</Td>
                <Td>{pct(percent)}</Td>
                <Td>{gradeFor(percent) || "—"}</Td>
                <Td className="text-xs text-muted-foreground">{r?.remarks || "—"}</Td>
                <Td className="text-right">
                  {r && (
                    <RequestChange kind="exam_result" targetId={exam.id} studentId={s.student_id} returnTo={returnTo} max={max}
                      current={{ marks: r.marks, absent: r.absent, remarks: r.remarks }} pending={pending.has(pendingKey("exam_result", exam.id, s.student_id))} />
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle description="Draft. Enter marks for every student, then submit." action={<Badge value="draft" />}>{title}</CardTitle>
      {!roster.length ? (
        <Empty compact>No students are enrolled in this class.</Empty>
      ) : (
        <form className="space-y-4">
          <input type="hidden" name="course_id" value={courseId} />
          <input type="hidden" name="exam_id" value={exam.id} />
          <Table head={["Student", `Marks (/${max})`, "Absent", "Remarks"]}>
            {roster.map((s) => {
              const r = byStudent.get(s.student_id);
              return (
                <tr key={s.student_id}>
                  <Td><StudentCell name={s.full_name} code={s.user_code} /><input type="hidden" name="student_id" value={s.student_id} /></Td>
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
            <button formAction={submitExamResults} className={buttonClass("primary")}>Submit results</button>
          </div>
        </form>
      )}
      <form action={deleteExam} className="mt-3">
        <input type="hidden" name="course_id" value={courseId} />
        <input type="hidden" name="exam_id" value={exam.id} />
        <SubmitButton size="sm" variant="ghost" confirm="Delete this exam and its draft marks?">Delete exam</SubmitButton>
      </form>
    </Card>
  );
}
