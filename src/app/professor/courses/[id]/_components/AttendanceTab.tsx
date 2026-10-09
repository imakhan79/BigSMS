import Link from "next/link";
import { createAttendanceSession, deleteAttendanceSession, saveAttendance, submitAttendance } from "@/app/professor/actions";
import { RequestChange, StudentCell } from "@/app/professor/_components";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, buttonClass, Card, CardTitle, Empty, Input, Label, Select, Table, Td } from "@/components/ui";
import { ATTENDANCE_STATUSES, getPendingChanges, getRoster, pendingKey } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDay, today } from "@/lib/utils";

export async function AttendanceTab({ courseId, sessionId }: { courseId: string; sessionId?: string }) {
  const supabase = await createClient();
  const [{ data: sessions }, roster] = await Promise.all([
    supabase
      .from("attendance_sessions")
      .select("id, held_on, topic, submitted_at, batch_id, attendance_records(student_id, status)")
      .eq("course_id", courseId)
      .order("held_on", { ascending: false }),
    getRoster(supabase, courseId),
  ]);
  const selected = sessions?.find((s) => s.id === sessionId);
  // Classes (batches) with students in them; a register is for the whole course or one class.
  const classes = [...new Map(roster.filter((s) => s.batch_id).map((s) => [s.batch_id!, s.batch_name ?? ""])).entries()];
  const className = (batchId: string | null) => (batchId ? classes.find(([id]) => id === batchId)?.[1] ?? "Class" : "All students");
  const classRoster = (batchId: string | null) => (batchId ? roster.filter((s) => s.batch_id === batchId) : roster);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {selected ? (
          <Register courseId={courseId} session={selected} className={className(selected.batch_id)} roster={classRoster(selected.batch_id)} />
        ) : (
          <Alert tone="info" title="Taking attendance">
            Start a register for the whole course or one class, mark every student and save it as a draft. Only students enrolled in your class can be marked. Submit it when it is complete. After that, changes need the Principal&apos;s approval.
          </Alert>
        )}
        <Card>
          <CardTitle>Registers</CardTitle>
          <Table head={["Date", "Class", "Topic", "Present", "Absent", "Status", ""]} empty={!sessions?.length}>
            {sessions?.map((s) => {
              const count = (st: string) => s.attendance_records.filter((r: { status: string }) => r.status === st).length;
              return (
                <tr key={s.id} className={cn(s.id === sessionId && "bg-secondary/50")}>
                  <Td className="font-medium">{formatDay(s.held_on)}</Td>
                  <Td>{className(s.batch_id)}</Td>
                  <Td>{s.topic || "—"}</Td>
                  <Td>{count("present") + count("late")}</Td>
                  <Td>{count("absent")}</Td>
                  <Td><Badge value={s.submitted_at ? "submitted" : "draft"} /></Td>
                  <Td className="text-right">
                    <Link href={`/professor/courses/${courseId}?tab=attendance&session=${s.id}`} className="text-sm text-primary hover:underline">
                      {s.submitted_at ? "View" : "Mark"}
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </div>

      <Card className="h-fit">
        <CardTitle>New register</CardTitle>
        {!roster.length ? (
          <p className="text-sm text-muted-foreground">No students are enrolled in this class yet. The Admin Manager enrols students.</p>
        ) : (
          <form action={createAttendanceSession} className="space-y-3">
            <input type="hidden" name="course_id" value={courseId} />
            <Label label="Date"><Input name="held_on" type="date" defaultValue={today()} max={today()} required /></Label>
            {!!classes.length && (
              <Label label="Class">
                <Select name="batch_id" defaultValue="">
                  <option value="">All students ({roster.length})</option>
                  {classes.map(([id, name]) => <option key={id} value={id}>{name} ({classRoster(id).length})</option>)}
                </Select>
              </Label>
            )}
            <Label label="Topic"><Input name="topic" placeholder="Optional" /></Label>
            <SubmitButton className="w-full">Start register</SubmitButton>
          </form>
        )}
      </Card>
    </div>
  );
}

async function Register({
  courseId,
  session,
  className,
  roster,
}: {
  courseId: string;
  session: { id: string; held_on: string; topic: string; submitted_at: string | null };
  className: string;
  roster: Awaited<ReturnType<typeof getRoster>>;
}) {
  const supabase = await createClient();
  const [{ data: records }, pending] = await Promise.all([
    supabase.from("attendance_records").select("student_id, status, note").eq("session_id", session.id),
    getPendingChanges(supabase, courseId),
  ]);
  const byStudent = new Map((records ?? []).map((r) => [r.student_id, r]));
  const returnTo = `/professor/courses/${courseId}?tab=attendance&session=${session.id}`;
  const title = `${formatDay(session.held_on)} · ${className}${session.topic ? ` · ${session.topic}` : ""}`;

  if (session.submitted_at) {
    return (
      <Card>
        <CardTitle description="Submitted. Changes take effect once the Principal approves them." action={<Badge value="submitted" />}>{title}</CardTitle>
        <Table head={["Student", "Status", "Note", ""]} empty={!roster.length}>
          {roster.map((s) => {
            const r = byStudent.get(s.student_id);
            return (
              <tr key={s.student_id}>
                <Td><StudentCell name={s.full_name} code={s.user_code} /></Td>
                <Td>{r ? <Badge value={r.status} tone={r.status === "absent" ? "danger" : r.status === "present" ? "success" : "warning"} /> : "—"}</Td>
                <Td className="text-xs text-muted-foreground">{r?.note || "—"}</Td>
                <Td className="text-right">
                  {r && (
                    <RequestChange kind="attendance" targetId={session.id} studentId={s.student_id} returnTo={returnTo}
                      current={{ status: r.status, note: r.note }} pending={pending.has(pendingKey("attendance", session.id, s.student_id))} />
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
      <CardTitle description="Draft. Mark every student, then submit." action={<Badge value="draft" />}>{title}</CardTitle>
      {!roster.length ? (
        <Empty compact>No students are enrolled in this class.</Empty>
      ) : (
        <form className="space-y-4">
          <input type="hidden" name="course_id" value={courseId} />
          <input type="hidden" name="session_id" value={session.id} />
          <Table head={["Student", "Status", "Note"]}>
            {roster.map((s) => {
              const r = byStudent.get(s.student_id);
              return (
                <tr key={s.student_id}>
                  <Td><StudentCell name={s.full_name} code={s.user_code} /><input type="hidden" name="student_id" value={s.student_id} /></Td>
                  <Td>
                    <Select name={`status_${s.student_id}`} defaultValue={r?.status ?? "present"} aria-label={`Status for ${s.full_name}`} className="w-32 capitalize">
                      {ATTENDANCE_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                    </Select>
                  </Td>
                  <Td><Input name={`note_${s.student_id}`} defaultValue={r?.note ?? ""} aria-label={`Note for ${s.full_name}`} /></Td>
                </tr>
              );
            })}
          </Table>
          <div className="flex flex-wrap gap-2">
            <button formAction={saveAttendance} className={buttonClass("outline")}>Save draft</button>
            <button formAction={submitAttendance} className={buttonClass("primary")}>Submit attendance</button>
          </div>
        </form>
      )}
      <form action={deleteAttendanceSession} className="mt-3">
        <input type="hidden" name="course_id" value={courseId} />
        <input type="hidden" name="session_id" value={session.id} />
        <SubmitButton size="sm" variant="ghost" confirm="Delete this draft register?">Delete draft</SubmitButton>
      </form>
    </Card>
  );
}
