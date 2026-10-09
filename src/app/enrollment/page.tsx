import Link from "next/link";
import { approveEnrollments, rejectEnrollments, resubmitEnrollment, submitEnrollment, withdrawEnrollment } from "@/app/enrollment/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, buttonClass, Card, CardTitle, Empty, Filters, Flash, type FlashParams, Input, Label, PageHeader, Select, Table, Td, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import {
  type BatchOption,
  ENROLLMENT_REQUEST_SELECT,
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUSES,
  type EnrollmentRequestRow,
  type EnrollmentRequestStatus,
} from "@/lib/enrollment";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDay } from "@/lib/utils";

type Course = { id: string; code: string; title: string; status: string };

function batchLabel(b: BatchOption) {
  return `${b.name}${b.starts_on ? ` · starts ${formatDay(b.starts_on)}` : ""}${b.capacity ? ` · ${b.capacity} seats` : ""}`;
}

export default async function EnrollmentPage({ searchParams }: { searchParams: Promise<FlashParams & { status?: string; course?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole("admin", "admin_manager", "principal");
  const isPrincipal = profile.role === "principal";
  const supabase = await createClient();
  // The Principal lands on the approval queue; ?status=all shows everything.
  const status = (ENROLLMENT_STATUSES as string[]).includes(params.status ?? "")
    ? (params.status as EnrollmentRequestStatus)
    : isPrincipal && !params.status ? "pending" : undefined;

  let requests = supabase.from("enrollment_requests").select(ENROLLMENT_REQUEST_SELECT).order("submitted_at", { ascending: false }).limit(300);
  if (status) requests = requests.eq("status", status);

  const [{ data: requestData }, { data: courseData }, { data: batchData }, { data: counts }] = await Promise.all([
    requests,
    supabase.from("courses").select("id, code, title, status").neq("status", "archived").order("title"),
    supabase.from("course_batches").select("id, course_id, name, status, starts_on, capacity").eq("status", "open").order("starts_on", { nullsFirst: false }),
    supabase.from("enrollment_requests").select("status").in("status", ["pending", "rejected"]),
  ]);
  const rows = (requestData ?? []) as unknown as EnrollmentRequestRow[];
  const courses = (courseData ?? []) as Course[];
  const batches = (batchData ?? []) as BatchOption[];
  const pendingCount = (counts ?? []).filter((c) => c.status === "pending").length;
  const rejectedCount = (counts ?? []).filter((c) => c.status === "rejected").length;
  const base = status ? `/enrollment?status=${status}` : "/enrollment";

  // New enrollment (office): step 1 picks the course, step 2 the batch and students.
  const course = !isPrincipal ? courses.find((c) => c.id === params.course) : undefined;
  let students: { id: string; full_name: string; user_code: string | null; note: string }[] = [];
  if (course) {
    const [{ data: people }, { data: enrolled }, { data: open }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, user_code").eq("role", "student").eq("status", "active").order("full_name"),
      supabase.from("enrollments").select("student_id, batch:course_batches(name)").eq("course_id", course.id),
      supabase.from("enrollment_requests").select("student_id").eq("course_id", course.id).in("status", ["pending", "rejected"]),
    ]);
    const enrolledIn = new Map((enrolled ?? []).map((e: any) => [e.student_id, e.batch?.name ?? "no batch"]));
    const hasOpen = new Set((open ?? []).map((r) => r.student_id));
    students = (people ?? [])
      .filter((p) => !hasOpen.has(p.id))
      .map((p) => ({ ...p, note: enrolledIn.has(p.id) ? `enrolled (${enrolledIn.get(p.id)})` : "" }));
  }

  return (
    <>
      <PageHeader
        title={isPrincipal ? "Enrollment approvals" : "Student enrollment"}
        subtitle={isPrincipal
          ? "Enrollments take effect only when you approve them."
          : "Enroll students in a course or batch. Every enrollment takes effect once the Principal approves it."}
        action={
          <>
            <TextLink href="/enrollment/enrolled">Enrolled students</TextLink>
            <TextLink href="/enrollment/batches" className="ml-3">Batches</TextLink>
          </>
        }
      />
      <Flash params={params} />

      {!isPrincipal && (
        <Card className="mb-6">
          <CardTitle description="Admin → Student Enrollment → Principal Approval">New enrollment</CardTitle>
          <form className="flex flex-wrap items-end gap-3">
            {status && <input type="hidden" name="status" value={status} />}
            <Label label="Course" className="min-w-72 flex-1">
              <Select name="course" defaultValue={course?.id ?? ""} required>
                <option value="" disabled>Choose a course</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}{c.status === "draft" ? " (draft)" : ""}</option>)}
              </Select>
            </Label>
            <SubmitButton variant="outline">Choose students</SubmitButton>
          </form>

          {course && (
            <form action={submitEnrollment} className="mt-5 space-y-4 border-t border-border pt-5">
              <input type="hidden" name="course_id" value={course.id} />
              <input type="hidden" name="back" value={`${base}${base.includes("?") ? "&" : "?"}course=${course.id}`} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Label label="Batch" hint={batches.some((b) => b.course_id === course.id) ? undefined : "This course has no open batches."}>
                  <Select name="batch_id" defaultValue="">
                    <option value="">Course only (no batch)</option>
                    {batches.filter((b) => b.course_id === course.id).map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
                  </Select>
                </Label>
                <Label label="Note for the Principal"><Input name="note" placeholder="Optional" /></Label>
              </div>
              {!students.length ? (
                <Empty compact>Every active student already has an open request for this course.</Empty>
              ) : (
                <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {students.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                      <input type="checkbox" name="student_id" value={s.id} className="accent-primary" />
                      <span className="flex-1">{s.full_name}{s.note && <span className="ml-2 text-xs text-muted-foreground">{s.note}</span>}</span>
                      <span className="font-mono text-xs text-muted-foreground">{s.user_code}</span>
                    </label>
                  ))}
                </div>
              )}
              <SubmitButton>Send for Principal approval</SubmitButton>
            </form>
          )}
        </Card>
      )}

      {!isPrincipal && rejectedCount > 0 && status !== "rejected" && (
        <Alert tone="warning" className="mb-6" title={`${rejectedCount} rejected ${rejectedCount === 1 ? "enrollment needs" : "enrollments need"} attention`}>
          <Link href="/enrollment?status=rejected" className="underline">Modify and resubmit, or withdraw them.</Link>
        </Alert>
      )}

      <Card>
        <div className="mb-4">
          <Filters
            items={[undefined, ...ENROLLMENT_STATUSES].map((s) => ({
              href: s ? `/enrollment?status=${s}` : "/enrollment?status=all",
              label: s ? `${ENROLLMENT_STATUS_LABEL[s]}${s === "pending" ? ` (${pendingCount})` : s === "rejected" ? ` (${rejectedCount})` : ""}` : "All",
              active: s ? status === s : !status,
            }))}
          />
        </div>

        {isPrincipal && status === "pending" ? (
          !rows.length ? (
            <Empty title="All caught up">No enrollments are waiting for your approval.</Empty>
          ) : (
            <form>
              {/* A disabled first submit button makes Enter a no-op, so typing a reason can't approve. */}
              <button type="submit" disabled hidden aria-hidden="true" tabIndex={-1} />
              <Table head={["", "Request", "Student", "Course / batch", "Enrolled by", "Note"]}>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td><input type="checkbox" name="request_id" value={r.id} defaultChecked className="accent-primary" aria-label={`Select ${r.request_no}`} /></Td>
                    <Td className="whitespace-nowrap font-mono text-xs">{r.request_no}{r.resubmissions > 0 && <p className="font-sans text-muted-foreground">resubmitted</p>}</Td>
                    <Td><p className="font-medium">{r.student?.full_name}</p><p className="font-mono text-xs text-muted-foreground">{r.student?.user_code}</p></Td>
                    <Td><p>{r.course?.code} {r.course?.title}</p><p className="text-xs text-muted-foreground">{r.batch?.name ?? "No batch"}</p></Td>
                    <Td className="whitespace-nowrap">{r.submitter?.full_name ?? "—"}<p className="text-xs text-muted-foreground">{formatDate(r.submitted_at)}</p></Td>
                    <Td className="text-xs">{r.note || "—"}</Td>
                  </tr>
                ))}
              </Table>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Input name="review_note" placeholder="Reason (required to reject)" className="min-w-60 flex-1" aria-label="Review note" />
                <button formAction={approveEnrollments} className={buttonClass("success")}>Approve selected</button>
                <button formAction={rejectEnrollments} className={buttonClass("danger")}>Reject selected</button>
              </div>
            </form>
          )
        ) : (
          <Table head={["Request", "Student", "Course / batch", "Status", "Submitted", "Decision", ""]} empty={!rows.length}>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <Td className="whitespace-nowrap font-mono text-xs">{r.request_no}</Td>
                <Td><p className="font-medium">{r.student?.full_name}</p><p className="font-mono text-xs text-muted-foreground">{r.student?.user_code}</p></Td>
                <Td><p>{r.course?.code} {r.course?.title}</p><p className="text-xs text-muted-foreground">{r.batch?.name ?? "No batch"}</p>{r.note && <p className="text-xs text-muted-foreground">Note: {r.note}</p>}</Td>
                <Td><Badge value={r.status}>{ENROLLMENT_STATUS_LABEL[r.status]}</Badge></Td>
                <Td className="whitespace-nowrap text-xs">{formatDate(r.submitted_at)}<p className="text-muted-foreground">{r.submitter?.full_name}</p></Td>
                <Td className="text-xs">
                  {r.reviewed_at ? <>{r.reviewer?.full_name} · {formatDate(r.reviewed_at)}</> : "—"}
                  {r.review_note && <p className={r.status === "rejected" ? "text-danger" : "text-muted-foreground"}>{r.review_note}</p>}
                </Td>
                <Td className="text-right">
                  {!isPrincipal && (r.status === "rejected" || r.status === "pending") && (
                    <details className="text-left">
                      <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline">{r.status === "rejected" ? "Modify & resubmit" : "Modify"}</summary>
                      <div className="mt-2 w-72 space-y-2 rounded-md border border-border bg-surface p-3 shadow-xs">
                        <form action={resubmitEnrollment} className="space-y-2">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="back" value={base} />
                          <Label label="Course">
                            <Select name="course_id" defaultValue={r.course_id}>
                              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
                            </Select>
                          </Label>
                          <Label label="Batch" hint="Must belong to the chosen course">
                            <Select name="batch_id" defaultValue={r.batch_id ?? ""}>
                              <option value="">Course only (no batch)</option>
                              {courses.filter((c) => batches.some((b) => b.course_id === c.id)).map((c) => (
                                <optgroup key={c.id} label={`${c.code} ${c.title}`}>
                                  {batches.filter((b) => b.course_id === c.id).map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
                                </optgroup>
                              ))}
                            </Select>
                          </Label>
                          <Label label="Note for the Principal"><Input name="note" defaultValue={r.note} /></Label>
                          <SubmitButton size="sm" className="w-full">{r.status === "rejected" ? "Resubmit for approval" : "Save"}</SubmitButton>
                        </form>
                        <form action={withdrawEnrollment}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="back" value={base} />
                          <SubmitButton size="sm" variant="outline" className="w-full" confirm="Withdraw this enrollment request?">Withdraw</SubmitButton>
                        </form>
                      </div>
                    </details>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
