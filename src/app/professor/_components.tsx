import { requestResultChange } from "@/app/professor/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Input, Label, Select, Textarea } from "@/components/ui";
import { ATTENDANCE_STATUSES, type ResultChangeKind, type RosterStudent } from "@/lib/faculty";

/** A student as Faculty see them: name and System ID. */
export function StudentCell({ name, code }: { name?: string | null; code?: string | null }) {
  return (
    <>
      <p className="font-medium">{name || "—"}</p>
      <p className="font-mono text-xs text-muted-foreground">{code ?? "—"}</p>
    </>
  );
}

/**
 * Submitted results are locked. This asks the Principal to approve a change; the current
 * values are prefilled. While a request is open, the row shows that instead.
 */
export function RequestChange({
  kind,
  targetId,
  studentId,
  returnTo,
  current,
  pending,
  max,
}: {
  kind: ResultChangeKind;
  targetId: string;
  studentId: string;
  returnTo: string;
  current: Record<string, unknown>;
  pending?: boolean;
  max?: number;
}) {
  if (pending) return <Badge value="pending_approval">change pending</Badge>;
  const v = (k: string) => (current[k] == null ? "" : String(current[k]));

  return (
    <details className="group text-left">
      <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline">Request change</summary>
      <form action={requestResultChange} className="mt-2 w-64 space-y-2 rounded-md border border-border bg-surface p-3 shadow-xs">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="target_id" value={targetId} />
        <input type="hidden" name="student_id" value={studentId} />
        <input type="hidden" name="return_to" value={returnTo} />
        {kind === "attendance" && (
          <>
            <Label label="Status">
              <Select name="status" defaultValue={v("status")}>
                {ATTENDANCE_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
              </Select>
            </Label>
            <Label label="Note"><Input name="note" defaultValue={v("note")} /></Label>
          </>
        )}
        {kind === "exam_result" && (
          <>
            <Label label={`Marks (out of ${max})`}><Input name="marks" type="number" step="0.5" min={0} max={max} defaultValue={v("marks")} /></Label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="absent" defaultChecked={current.absent === true} /> Absent</label>
            <Label label="Remarks"><Input name="remarks" defaultValue={v("remarks")} /></Label>
          </>
        )}
        {kind === "assignment_grade" && (
          <>
            <Label label={`Score (out of ${max})`}><Input name="score" type="number" step="0.5" min={0} max={max} defaultValue={v("score")} required /></Label>
            <Label label="Feedback"><Input name="feedback" defaultValue={v("feedback")} /></Label>
          </>
        )}
        {kind === "final_report" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Label label="Percentage"><Input name="percentage" type="number" step="0.1" min={0} max={100} defaultValue={v("percentage")} required /></Label>
              <Label label="Grade"><Input name="grade" defaultValue={v("grade")} maxLength={10} required /></Label>
            </div>
            <Label label="Remarks"><Input name="remarks" defaultValue={v("remarks")} /></Label>
          </>
        )}
        <Label label="Reason for the change"><Textarea name="reason" required className="min-h-16" /></Label>
        <SubmitButton size="sm" className="w-full">Send to Principal</SubmitButton>
      </form>
    </details>
  );
}


/** Classes (batches) that have students in the roster, as [id, name]. */
export function rosterClasses(roster: RosterStudent[]): [string, string][] {
  return [...new Map(roster.filter((s) => s.batch_id).map((s) => [s.batch_id!, s.batch_name ?? ""])).entries()];
}

/**
 * Who an assignment or exam is for: the whole course, one class or chosen students. The class
 * picker and student list show only for the matching choice (CSS :has, no client script).
 */
export function AudienceFields({
  roster,
  audience = "course",
  batchId,
  chosen = [],
}: {
  roster: RosterStudent[];
  audience?: string;
  batchId?: string | null;
  chosen?: string[];
}) {
  const classes = rosterClasses(roster);
  const picked = new Set(chosen);
  return (
    <fieldset className="group space-y-2">
      <legend className="mb-1.5 text-sm font-medium">Assign to</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <label className="flex items-center gap-1.5"><input type="radio" name="audience" value="course" defaultChecked={audience === "course"} /> Whole course</label>
        {!!classes.length && (
          <label className="flex items-center gap-1.5"><input type="radio" name="audience" value="batch" defaultChecked={audience === "batch"} /> One class</label>
        )}
        <label className="flex items-center gap-1.5"><input type="radio" name="audience" value="students" defaultChecked={audience === "students"} /> Chosen students</label>
      </div>
      {!!classes.length && (
        <div className="hidden group-has-[input[value=batch]:checked]:block">
          <Select name="batch_id" defaultValue={batchId ?? ""} aria-label="Class">
            <option value="">Choose a class</option>
            {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </div>
      )}
      <div className="hidden max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2 group-has-[input[value=students]:checked]:block">
        {roster.map((s) => (
          <label key={s.student_id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="student_ids" value={s.student_id} defaultChecked={picked.has(s.student_id)} />
            <span>{s.full_name}</span>
            <span className="font-mono text-xs text-muted-foreground">{s.user_code}</span>
            {s.batch_name && <span className="text-xs text-muted-foreground">· {s.batch_name}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The roster students an assignment or exam is for. */
export function audienceStudents(roster: RosterStudent[], audience: string, batchId: string | null, chosen: string[]) {
  if (audience === "batch") return roster.filter((s) => s.batch_id === batchId);
  if (audience === "students") {
    const picked = new Set(chosen);
    return roster.filter((s) => picked.has(s.student_id));
  }
  return roster;
}
