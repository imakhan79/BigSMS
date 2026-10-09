import { updateCourse } from "@/app/courses/actions";
import { CourseFields, CourseInfo, CourseWorkflow } from "@/components/CourseManagement";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, CardTitle } from "@/components/ui";
import { courseChanges, courseFormOptions, courseStage, workingCopy } from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";

export async function OverviewTab({ course }: { course: Course }) {
  const supabase = await createClient();
  const [{ categories, currency }, changes, { data: category }, { data: faculty }] = await Promise.all([
    courseFormOptions(supabase),
    courseChanges(supabase, course),
    course.category_id ? supabase.from("course_categories").select("name").eq("id", course.category_id).single() : Promise.resolve({ data: null }),
    supabase.from("profiles").select("full_name").eq("id", course.professor_id).single(),
  ]);
  const stage = courseStage(course);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {stage === "archived" ? (
          <Card>
            <CardTitle>Course information</CardTitle>
            <CourseInfo course={course} facultyName={faculty?.full_name} categoryName={category?.name} currency={currency} />
          </Card>
        ) : (
          <Card>
            <CardTitle description={stage === "draft" ? undefined : "Changes are held in Edit until the Principal or Admin Manager publishes them."}>
              {stage === "edit" ? "Course information (unpublished changes)" : "Course information"}
            </CardTitle>
            <form action={updateCourse} className="space-y-5">
              <input type="hidden" name="id" value={course.id} />
              <CourseFields course={workingCopy(course, changes)} categories={categories} currency={currency} />
              <p className="text-xs text-muted-foreground">Course faculty: {faculty?.full_name ?? "you"}. Only the Principal or Admin Manager can reassign it.</p>
              <SubmitButton>{stage === "draft" ? "Save draft" : "Save changes"}</SubmitButton>
            </form>
          </Card>
        )}
        {stage === "edit" && (
          <Card>
            <CardTitle description="What students see until the changes are published">Published version</CardTitle>
            <CourseInfo course={course} facultyName={faculty?.full_name} categoryName={category?.name} currency={currency} />
          </Card>
        )}
      </div>
      <CourseWorkflow course={course} changes={changes} viewer="professor" />
    </div>
  );
}
