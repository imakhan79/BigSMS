import { archiveCourse, deleteCourse, discardCourseChanges, publishCourse, restoreCourse, setCourseReady } from "@/app/courses/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, Card, CardTitle, Input, Label, Select, Textarea } from "@/components/ui";
import { changedFields, type CourseInfo as Info, courseStage, DURATION_UNITS, formatDuration, STAGE_LABEL } from "@/lib/courses";
import type { Course, Role } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/utils";

type Option = { id: string; name: string };

export function CourseStageBadge({ course }: { course: Pick<Course, "status" | "editing" | "ready_at"> }) {
  const stage = courseStage(course);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge value={stage}>{STAGE_LABEL[stage]}</Badge>
      {course.ready_at && <Badge value="ready" tone="warning">Ready to publish</Badge>}
    </span>
  );
}

/**
 * The course information fields. Pass the working copy (pending changes applied) when editing.
 * Faculty cannot choose the course faculty: pass `faculty` only to the Principal / Admin Manager.
 */
export function CourseFields({
  course,
  categories,
  faculty,
  currency,
  compact,
}: {
  course?: Partial<Course>;
  categories: Option[];
  faculty?: Option[];
  currency: string;
  /** Stack every field, for narrow side panels. */
  compact?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className={compact ? "space-y-4" : "grid gap-4 sm:grid-cols-[1fr_180px]"}>
        <Label label="Course name"><Input name="title" defaultValue={course?.title} required maxLength={200} /></Label>
        <Label label="Course ID" hint={course?.code ? undefined : "Leave blank to generate one"}>
          <Input name="code" defaultValue={course?.code} placeholder="e.g. CS-101" maxLength={30} className="font-mono uppercase" />
        </Label>
      </div>
      <div className={compact ? "grid grid-cols-2 gap-4 [&>*:last-child]:col-span-2" : "grid gap-4 sm:grid-cols-3"}>
        <Label label="Duration">
          <div className="flex gap-2">
            <Input name="duration_value" type="number" min={1} step={1} defaultValue={course?.duration_value ?? ""} className="w-24" aria-label="Duration" />
            <Select name="duration_unit" defaultValue={course?.duration_unit ?? "weeks"} aria-label="Duration unit">
              {DURATION_UNITS.map((u) => <option key={u} value={u} className="capitalize">{u}</option>)}
            </Select>
          </div>
        </Label>
        <Label label={`Course fee (${currency})`} hint="0 for a free course">
          <Input name="fee" type="number" min={0} step="0.01" defaultValue={course?.fee ?? ""} />
        </Label>
        <Label label="Category">
          <Select name="category_id" defaultValue={course?.category_id ?? ""}>
            <option value="">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Label>
      </div>
      {faculty && (
        <Label label="Course faculty">
          <Select name="professor_id" defaultValue={course?.professor_id ?? ""} required>
            <option value="" disabled>Choose a Faculty member</option>
            {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Label>
      )}
      <Label label="Description"><Textarea name="description" defaultValue={course?.description} className="min-h-20" /></Label>
      <Label label="Course outline" hint="A short overview of what the course covers, shown to students.">
        <Textarea name="outline" defaultValue={course?.outline} className="min-h-32" placeholder={"Week 1: ...\nWeek 2: ..."} />
      </Label>
      <Label label="Course curriculum" hint="Modules, topics, learning outcomes and assessment.">
        <Textarea name="curriculum" defaultValue={course?.curriculum} className="min-h-40" placeholder={"Module 1: ...\n  - Topic\n  - Topic\nAssessment: ..."} />
      </Label>
    </div>
  );
}

/** Read-only course information. */
export function CourseInfo({ course, facultyName, categoryName, currency }: { course: Course; facultyName?: string | null; categoryName?: string | null; currency: string }) {
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {[
          ["Course ID", <span key="c" className="font-mono">{course.code}</span>],
          ["Duration", formatDuration(course.duration_value, course.duration_unit)],
          ["Course fee", course.fee == null ? "—" : formatMoney(course.fee, currency)],
          ["Faculty", facultyName || "—"],
          ["Category", categoryName || "Uncategorised"],
          ["Published", formatDate(course.published_at)],
        ].map(([k, v]) => (
          <div key={String(k)}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {course.description && <p>{course.description}</p>}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Outline</p>
        {course.outline ? <pre className="whitespace-pre-wrap rounded bg-secondary p-3 font-sans">{course.outline}</pre> : <p className="text-muted-foreground">Not written yet.</p>}
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Curriculum</p>
        {course.curriculum ? <pre className="whitespace-pre-wrap rounded bg-secondary p-3 font-sans">{course.curriculum}</pre> : <p className="text-muted-foreground">Not written yet.</p>}
      </div>
    </div>
  );
}

function Action({ action, id, label, variant, confirm, extra }: {
  action: (form: FormData) => Promise<void>;
  id: string;
  label: string;
  variant?: "primary" | "accent" | "outline" | "success" | "danger";
  confirm?: string;
  extra?: Record<string, string>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton variant={variant} confirm={confirm} className="w-full">{label}</SubmitButton>
    </form>
  );
}

/** Stage and the actions this viewer may take. Only the Principal and Admin Manager publish or archive. */
export function CourseWorkflow({ course, changes, viewer }: { course: Course; changes: Partial<Info> | null; viewer: Role }) {
  const stage = courseStage(course);
  const manages = viewer === "principal" || viewer === "admin_manager";
  const edits = manages || viewer === "professor";
  const changed = changedFields(course, changes);

  return (
    <Card className="h-fit">
      <CardTitle action={<CourseStageBadge course={course} />}>Stage</CardTitle>
      <ol className="mb-4 grid grid-cols-4 gap-1 text-center text-[11px] font-medium">
        {(["draft", "published", "edit", "archived"] as const).map((s) => (
          <li key={s} className={s === stage ? "rounded bg-primary px-1 py-1 text-primary-foreground" : "rounded bg-muted px-1 py-1 text-muted-foreground"}>
            {STAGE_LABEL[s]}
          </li>
        ))}
      </ol>

      <div className="mb-4 space-y-2 text-sm text-muted-foreground">
        {stage === "draft" && <p>Being prepared. Students can&apos;t see it yet.{!manages && " The Principal or Admin Manager publishes it."}</p>}
        {stage === "published" && <p>Live to enrolled students. Saving changes moves it to Edit; the changes go live when they are published.</p>}
        {stage === "edit" && (
          <>
            <p>Students still see the published version. Unpublished changes: {changed.join(", ") || "none"}.</p>
          </>
        )}
        {stage === "archived" && <p>Archived. Students no longer see it.{manages ? " Restore it to Draft to edit or publish it again." : " Only the Principal or Admin Manager can restore it."}</p>}
        {course.ready_at && <p className="text-foreground">Marked ready to publish {formatDate(course.ready_at)}.</p>}
      </div>

      {viewer === "admin" || viewer === "super_admin" ? (
        <Alert tone="info">Courses are managed by the Principal, the Admin Manager and Faculty. You have read-only access.</Alert>
      ) : (
        <div className="flex flex-col gap-2">
          {manages && stage === "draft" && <Action action={publishCourse} id={course.id} label="Publish course" variant="success" confirm="Publish this course? Enrolled students will see it." />}
          {manages && stage === "edit" && <Action action={publishCourse} id={course.id} label="Publish changes" variant="success" confirm="Publish these changes? Students will see them straight away." />}
          {edits && (stage === "draft" || stage === "edit") && !manages && (
            course.ready_at
              ? <Action action={setCourseReady} id={course.id} label="Not ready yet" variant="outline" extra={{ ready: "false" }} />
              : <Action action={setCourseReady} id={course.id} label="Mark ready to publish" variant="accent" extra={{ ready: "true" }} />
          )}
          {edits && stage === "edit" && <Action action={discardCourseChanges} id={course.id} label="Discard changes" variant="outline" confirm="Discard the unpublished changes? The published course stays as it is." />}
          {manages && stage !== "archived" && <Action action={archiveCourse} id={course.id} label="Archive course" variant="outline" confirm="Archive this course? Students will lose access." />}
          {manages && stage === "archived" && <Action action={restoreCourse} id={course.id} label="Restore to Draft" variant="outline" />}
          {edits && stage === "draft" && !course.published_at && <Action action={deleteCourse} id={course.id} label="Delete draft" variant="danger" confirm="Permanently delete this draft course?" />}
        </div>
      )}
    </Card>
  );
}
