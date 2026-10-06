import Link from "next/link";
import { approveCourse, rejectCourse, reviewCourse } from "@/app/(shared)/review-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, buttonClass, Card, CardTitle, Empty, Filters, Flash, type FlashParams, Input, PageHeader, Table, Td } from "@/components/ui";
import { approvalState, getCourseWorkflow, workflowSummary } from "@/lib/approvals";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ApprovalStep, Role } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const STATUSES = ["draft", "pending_approval", "published", "rejected", "archived"];

export function ReviewButtons({ id }: { id: string }) {
  return (
    <form className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {/* Enter submits via the first submit button; a disabled one makes Enter a no-op so
          typing a rejection note and pressing Enter can't approve the course. */}
      <button type="submit" disabled hidden aria-hidden="true" tabIndex={-1} />
      <Input name="review_note" placeholder="Review note (required to reject)" className="min-w-60 flex-1" aria-label="Review note" />
      <button formAction={approveCourse} className={buttonClass("success")}>Approve</button>
      <button formAction={rejectCourse} className={buttonClass("danger")}>Reject</button>
    </form>
  );
}

/** Approve/Reject for whoever owns the course's current step; otherwise who it is waiting for. */
export function ApprovalControls({ id, approvalStep, steps, viewer }: { id: string; approvalStep: number | null; steps: ApprovalStep[]; viewer: Role }) {
  const { label, canAct, step } = approvalState(approvalStep, steps, viewer);
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-muted-foreground">
        {label}
        {viewer === "super_admin" && step && step.approver_role !== viewer && " · you can decide as Super Admin (approving publishes immediately)"}
      </p>
      {canAct && <ReviewButtons id={id} />}
    </div>
  );
}

/** Approval queue plus all-courses table. Admins can also archive/restore. */
export async function CourseApprovalList({
  base,
  isAdmin,
  params,
}: {
  base: "/admin/courses" | "/principal/courses";
  isAdmin: boolean;
  params: FlashParams & { status?: string };
}) {
  const viewer = await requireRole("admin", "principal");
  const supabase = await createClient();
  const select = "id, title, description, outline, status, review_note, approval_step, updated_at, course_categories(name), profiles!courses_professor_id_fkey(full_name, email)";

  let all = supabase.from("courses").select(select).order("updated_at", { ascending: false });
  if (params.status) all = all.eq("status", params.status);

  const [{ data: pending }, { data: courses }, steps] = await Promise.all([
    supabase.from("courses").select(select).eq("status", "pending_approval").order("updated_at"),
    all,
    getCourseWorkflow(supabase),
  ]);

  return (
    <>
      <PageHeader
        title={isAdmin ? "Course management" : "Course approvals"}
        subtitle={isAdmin ? "Approve, reject, archive and monitor courses" : "Review courses submitted by professors and monitor all courses"}
      />
      <Flash params={params} />

      <Card>
        <CardTitle action={<span className="text-xs text-muted-foreground">Workflow: {workflowSummary(steps)}</span>}>
          Approval queue ({pending?.length ?? 0})
        </CardTitle>
        {!pending?.length ? (
          <Empty>No courses waiting for approval.</Empty>
        ) : (
          <div className="space-y-4">
            {pending.map((c: any) => (
              <div key={c.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.profiles?.full_name} · {c.course_categories?.name ?? "Uncategorised"} · submitted {formatDate(c.updated_at)}
                    </p>
                  </div>
                  <Link href={`${base}/${c.id}`} className="text-sm text-primary hover:underline">View content</Link>
                </div>
                {c.description && <p className="mt-2 text-sm">{c.description}</p>}
                {c.outline && <pre className="mt-2 whitespace-pre-wrap rounded bg-secondary p-3 font-sans text-xs">{c.outline}</pre>}
                <ApprovalControls id={c.id} approvalStep={c.approval_step} steps={steps} viewer={viewer.role} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardTitle>All courses</CardTitle>
        <div className="mb-4">
          <Filters items={[undefined, ...STATUSES].map((s) => ({ href: s ? `${base}?status=${s}` : base, label: s?.replace("_", " ") ?? "All", active: params.status === s }))} />
        </div>
        <Table head={["Course", "Professor", "Category", "Status", "Updated", ""]} empty={!courses?.length}>
          {courses?.map((c: any) => (
            <tr key={c.id}>
              <Td className="font-medium">
                <Link href={`${base}/${c.id}`} className="hover:underline">{c.title}</Link>
                {c.review_note && <p className="text-xs text-muted-foreground">Note: {c.review_note}</p>}
              </Td>
              <Td>{c.profiles?.full_name}</Td>
              <Td>{c.course_categories?.name ?? "—"}</Td>
              <Td><Badge value={c.status} /></Td>
              <Td className="whitespace-nowrap">{formatDate(c.updated_at)}</Td>
              <Td className="text-right">
                {isAdmin && (
                  <form action={reviewCourse}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="decision" value={c.status === "archived" ? "draft" : "archived"} />
                    <SubmitButton size="sm" variant="outline" confirm={c.status === "archived" ? undefined : "Archive this course? Students will lose access."}>
                      {c.status === "archived" ? "Restore" : "Archive"}
                    </SubmitButton>
                  </form>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
