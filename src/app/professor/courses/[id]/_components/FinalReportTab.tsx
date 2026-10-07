import { saveFinalReports, submitFinalReports } from "@/app/professor/actions";
import { RequestChange, StudentCell } from "@/app/professor/_components";
import { Alert, Badge, buttonClass, Card, CardTitle, Empty, Input, Table, Td } from "@/components/ui";
import { getPendingChanges, getRoster, gradeFor, pendingKey } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { pct } from "@/lib/utils";

interface Report {
  student_id: string;
  percentage: number | null;
  grade: string;
  remarks: string;
  submitted_at: string | null;
}

export async function FinalReportTab({ courseId }: { courseId: string }) {
  const supabase = await createClient();
  const [roster, { data: reportData }, { data: progress }, { data: exams }, pending] = await Promise.all([
    getRoster(supabase, courseId),
    supabase.from("final_reports").select("student_id, percentage, grade, remarks, submitted_at").eq("course_id", courseId),
    supabase.rpc("course_student_progress", { p_course_id: courseId }),
    supabase.from("exams").select("max_marks, exam_results(student_id, marks, absent)").eq("course_id", courseId).not("submitted_at", "is", null),
    getPendingChanges(supabase, courseId),
  ]);
  const reports = new Map(((reportData ?? []) as Report[]).map((r) => [r.student_id, r]));
  const progressBy = new Map<string, any>((progress ?? []).map((p: any) => [p.student_id, p]));

  // Average percentage across submitted exams; an absence counts as zero.
  const examAvg = new Map<string, number>();
  for (const s of roster) {
    const scores = (exams ?? []).flatMap((e: any) =>
      e.exam_results.filter((r: any) => r.student_id === s.student_id).map((r: any) => (r.absent ? 0 : (Number(r.marks) / Number(e.max_marks)) * 100)),
    );
    if (scores.length) examAvg.set(s.student_id, scores.reduce((t: number, x: number) => t + x, 0) / scores.length);
  }

  const drafts = roster.filter((s) => !reports.get(s.student_id)?.submitted_at);
  const submitted = roster.filter((s) => reports.get(s.student_id)?.submitted_at);
  const returnTo = `/professor/courses/${courseId}?tab=report`;
  const reference = (id: string) => {
    const p = progressBy.get(id);
    return (
      <>
        <Td>{pct(p?.attendance_rate)}</Td>
        <Td>{pct(p?.assignment_avg)}</Td>
        <Td>{pct(examAvg.get(id))}</Td>
      </>
    );
  };

  if (!roster.length) return <Empty>No students are enrolled in this class. The Admin Manager enrols students.</Empty>;

  return (
    <div className="space-y-6">
      <Alert tone="info" title="Final report">
        Enter each student&apos;s overall percentage, grade and remarks. The suggested figure is the exam average. Submit when every student has a percentage and grade. After that, changes need the Principal&apos;s approval.
      </Alert>

      {!!drafts.length && (
        <Card>
          <CardTitle description={`${drafts.length} student${drafts.length === 1 ? "" : "s"} not yet submitted`} action={<Badge value="draft" />}>Draft</CardTitle>
          <form className="space-y-4">
            <input type="hidden" name="course_id" value={courseId} />
            <Table head={["Student", "Attendance", "Assignments", "Exams", "Overall %", "Grade", "Remarks"]}>
              {drafts.map((s) => {
                const r = reports.get(s.student_id);
                const suggested = examAvg.get(s.student_id);
                const value = r?.percentage ?? (suggested != null ? Math.round(suggested * 10) / 10 : null);
                return (
                  <tr key={s.student_id}>
                    <Td><StudentCell name={s.full_name} code={s.user_code} /><input type="hidden" name="student_id" value={s.student_id} /></Td>
                    {reference(s.student_id)}
                    <Td>
                      <Input name={`percentage_${s.student_id}`} type="number" step="0.1" min={0} max={100} defaultValue={value ?? ""}
                        aria-label={`Overall percentage for ${s.full_name}`} className="w-24" />
                    </Td>
                    <Td>
                      <Input name={`grade_${s.student_id}`} defaultValue={r?.grade || gradeFor(value)} maxLength={10}
                        aria-label={`Grade for ${s.full_name}`} className="w-20" />
                    </Td>
                    <Td><Input name={`remarks_${s.student_id}`} defaultValue={r?.remarks ?? ""} aria-label={`Remarks for ${s.full_name}`} /></Td>
                  </tr>
                );
              })}
            </Table>
            <div className="flex flex-wrap gap-2">
              <button formAction={saveFinalReports} className={buttonClass("outline")}>Save draft</button>
              <button formAction={submitFinalReports} className={buttonClass("primary")}>Submit final report</button>
            </div>
          </form>
        </Card>
      )}

      {!!submitted.length && (
        <Card>
          <CardTitle description="Changes take effect once the Principal approves them." action={<Badge value="submitted" />}>Submitted</CardTitle>
          <Table head={["Student", "Attendance", "Assignments", "Exams", "Overall", "Grade", "Remarks", ""]}>
            {submitted.map((s) => {
              const r = reports.get(s.student_id)!;
              return (
                <tr key={s.student_id}>
                  <Td><StudentCell name={s.full_name} code={s.user_code} /></Td>
                  {reference(s.student_id)}
                  <Td className="font-semibold">{pct(r.percentage)}</Td>
                  <Td className="font-semibold">{r.grade}</Td>
                  <Td className="text-xs text-muted-foreground">{r.remarks || "—"}</Td>
                  <Td className="text-right">
                    <RequestChange kind="final_report" targetId={courseId} studentId={s.student_id} returnTo={returnTo}
                      current={{ percentage: r.percentage, grade: r.grade, remarks: r.remarks }}
                      pending={pending.has(pendingKey("final_report", courseId, s.student_id))} />
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
    </div>
  );
}
