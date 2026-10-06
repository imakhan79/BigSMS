import Link from "next/link";
import { notFound } from "next/navigation";
import { reviewCourse } from "@/app/(shared)/review-actions";
import { ApprovalControls } from "@/components/CourseApprovalList";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Empty, PageHeader, Table, Td, TextLink } from "@/components/ui";
import { getCourseWorkflow } from "@/lib/approvals";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { formatDate, pct } from "@/lib/utils";

/** Read-only course view with review controls, for admins and principals. */
export async function CourseReview({ id, base, isAdmin }: { id: string; base: "/admin/courses" | "/principal/courses"; isAdmin: boolean }) {
  const viewer = await requireRole("admin", "principal");
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("*, course_categories(name), professor:profiles!courses_professor_id_fkey(full_name, email)")
    .eq("id", id)
    .single();
  if (!course) notFound();

  const [{ data: lectures }, { data: materials }, { data: assignments }, { data: quizzes }, { data: progress }, steps, { data: history }] = await Promise.all([
    supabase.from("lectures").select("id, title, position").eq("course_id", id).order("position"),
    supabase.from("materials").select("id, title, type").eq("course_id", id),
    supabase.from("assignments").select("id, title, due_at, published").eq("course_id", id),
    supabase.from("quizzes").select("id, title, published").eq("course_id", id),
    supabase.rpc("course_student_progress", { p_course_id: id }),
    getCourseWorkflow(supabase),
    supabase
      .from("course_approvals")
      .select("id, step_order, reviewer_role, decision, note, created_at, reviewer:profiles!course_approvals_reviewer_id_fkey(full_name)")
      .eq("course_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader
        title={course.title}
        subtitle={`${course.professor?.full_name} · ${course.course_categories?.name ?? "Uncategorised"}`}
        action={<TextLink href={base}>← All courses</TextLink>}
      />
      <div className="mb-4 flex items-center gap-2">
        <Badge value={course.status} />
        {course.review_note && <span className="text-sm text-muted-foreground">Note: {course.review_note}</span>}
      </div>

      {course.status === "pending_approval" && (
        <Card className="mb-6 border-accent">
          <CardTitle>Review</CardTitle>
          <ApprovalControls id={course.id} approvalStep={course.approval_step} steps={steps} viewer={viewer.role} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Overview</CardTitle>
          <p className="text-sm">{course.description || "No description."}</p>
          {course.outline && <pre className="mt-3 whitespace-pre-wrap rounded bg-secondary p-3 font-sans text-sm">{course.outline}</pre>}
        </Card>
        <Card>
          <CardTitle>Content</CardTitle>
          <ul className="space-y-1 text-sm">
            <li>{lectures?.length ?? 0} lectures</li>
            <li>{materials?.length ?? 0} materials ({[...new Set(materials?.map((m) => m.type))].join(", ") || "none"})</li>
            <li>{assignments?.length ?? 0} assignments</li>
            <li>{quizzes?.length ?? 0} quizzes</li>
          </ul>
          {!!lectures?.length && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              {lectures.map((l) => <li key={l.id}>{l.title}</li>)}
            </ol>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardTitle>Student progress</CardTitle>
        {!progress?.length ? (
          <Empty>No students enrolled.</Empty>
        ) : (
          <Table head={["Student", "Email", "Completion", "Quiz avg", "Assignment avg"]}>
            {progress.map((p: any) => (
              <tr key={p.student_id}>
                <Td>{p.full_name}</Td>
                <Td>{p.email}</Td>
                <Td>{pct(p.completion_rate)}</Td>
                <Td>{pct(p.quiz_avg)}</Td>
                <Td>{pct(p.assignment_avg)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {!!history?.length && (
        <Card className="mt-6">
          <CardTitle>Approval history</CardTitle>
          <Table head={["When", "Reviewer", "Step", "Decision", "Note"]}>
            {history.map((h: any) => (
              <tr key={h.id}>
                <Td className="whitespace-nowrap">{formatDate(h.created_at)}</Td>
                <Td>{h.reviewer?.full_name ?? "—"} <span className="text-xs text-muted-foreground">({ROLE_LABEL[h.reviewer_role as Role]})</span></Td>
                <Td>{h.step_order}</Td>
                <Td><Badge value={h.decision === "approved" ? "published" : "rejected"}>{h.decision}</Badge></Td>
                <Td>{h.note ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {isAdmin && course.status !== "archived" && (
        <form action={reviewCourse} className="mt-6">
          <input type="hidden" name="id" value={course.id} />
          <input type="hidden" name="decision" value="archived" />
          <SubmitButton variant="outline" confirm="Archive this course?">Archive course</SubmitButton>
          <span className="ml-3 text-xs text-muted-foreground">Last updated {formatDate(course.updated_at)}</span>
        </form>
      )}
    </>
  );
}
