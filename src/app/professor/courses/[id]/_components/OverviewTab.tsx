import { deleteCourse, setCourseStatus, updateCourse } from "@/app/professor/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, CardTitle, Input, Label, Select, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";

function StatusForm({ id, status, label, variant, confirm }: { id: string; status: string; label: string; variant?: "primary" | "accent" | "outline"; confirm?: string }) {
  return (
    <form action={setCourseStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={variant} confirm={confirm}>{label}</SubmitButton>
    </form>
  );
}

export async function OverviewTab({ course }: { course: Course }) {
  const supabase = await createClient();
  const { data: categories } = await supabase.from("course_categories").select("id, name").order("name");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardTitle>Course details</CardTitle>
        <form action={updateCourse} className="space-y-4">
          <input type="hidden" name="id" value={course.id} />
          <Label label="Title"><Input name="title" defaultValue={course.title} required /></Label>
          <Label label="Description"><Textarea name="description" defaultValue={course.description} /></Label>
          <Label label="Course outline (shown to students)">
            <Textarea name="outline" defaultValue={course.outline} className="min-h-48" placeholder={"Week 1: ...\nWeek 2: ..."} />
          </Label>
          <Label label="Category">
            <Select name="category_id" defaultValue={course.category_id ?? ""}>
              <option value="">Uncategorised</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Label>
          <SubmitButton>Save changes</SubmitButton>
        </form>
      </Card>

      <Card className="h-fit">
        <CardTitle>Approval workflow</CardTitle>
        <ol className="mb-4 space-y-1 text-sm text-muted-foreground">
          <li>1. Build the course as a draft.</li>
          <li>2. Submit it for admin approval.</li>
          <li>3. Once approved it is published to assigned students.</li>
        </ol>
        {course.status === "rejected" && course.review_note && (
          <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            <strong>Rejected:</strong> {course.review_note}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {(course.status === "draft" || course.status === "rejected") && (
            <StatusForm id={course.id} status="pending_approval" label="Submit for approval" variant="accent" />
          )}
          {course.status === "pending_approval" && (
            <>
              <p className="text-sm">Waiting for an administrator to review.</p>
              <StatusForm id={course.id} status="draft" label="Withdraw submission" variant="outline" />
            </>
          )}
          {course.status === "published" && <p className="text-sm">Published and visible to assigned students.</p>}
          {course.status !== "archived" && (
            <StatusForm id={course.id} status="archived" label="Archive course" variant="outline" confirm="Archive this course? Students will lose access." />
          )}
          {course.status === "archived" && <p className="text-sm">Archived. Ask an administrator to restore it.</p>}
          {course.status === "draft" && (
            <form action={deleteCourse}>
              <input type="hidden" name="id" value={course.id} />
              <SubmitButton variant="danger" confirm="Permanently delete this draft course?">Delete draft</SubmitButton>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
