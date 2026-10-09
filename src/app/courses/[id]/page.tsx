import { notFound } from "next/navigation";
import { updateCourse } from "@/app/courses/actions";
import { CourseFields, CourseInfo, CourseWorkflow } from "@/components/CourseManagement";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, CardTitle, Empty, Flash, type FlashParams, PageHeader, Table, Td, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { courseChanges, courseFormOptions, courseStage, workingCopy } from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";
import { pct } from "@/lib/utils";

type Row = Course & { category: { name: string } | null; faculty: { full_name: string } | null };

export default async function CourseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const profile = await requireRole("principal", "admin_manager", "admin");
  const manages = profile.role === "principal" || profile.role === "admin_manager";
  const oversees = profile.role !== "admin_manager"; // reads lectures, materials and progress
  const supabase = await createClient();

  const { data } = await supabase
    .from("courses")
    .select("*, category:course_categories(name), faculty:profiles!courses_professor_id_fkey(full_name)")
    .eq("id", id)
    .single();
  if (!data) notFound();
  const course = data as Row;
  const stage = courseStage(course);
  const editable = manages && stage !== "archived";

  const [options, changes, content] = await Promise.all([
    courseFormOptions(supabase),
    courseChanges(supabase, course),
    oversees
      ? Promise.all([
          supabase.from("lectures").select("id, title, position").eq("course_id", id).order("position"),
          supabase.from("materials").select("id, type").eq("course_id", id),
          supabase.from("assignments").select("id", { count: "exact", head: true }).eq("course_id", id),
          supabase.from("quizzes").select("id", { count: "exact", head: true }).eq("course_id", id),
          supabase.rpc("course_student_progress", { p_course_id: id }),
        ])
      : null,
  ]);
  const [lectures, materials, assignments, quizzes, progress] = content ?? [null, null, null, null, null];

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href="/courses">← Courses</TextLink>}
        title={course.title}
        subtitle={<><span className="font-mono">{course.code}</span> · {course.faculty?.full_name ?? "No faculty"} · {course.category?.name ?? "Uncategorised"}</>}
      />
      <Flash params={sp} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {editable ? (
            <Card>
              <CardTitle description={stage === "published" || stage === "edit" ? "Changes are held in Edit until you publish them." : undefined}>
                {stage === "edit" ? "Course information (unpublished changes)" : "Course information"}
              </CardTitle>
              <form action={updateCourse} className="space-y-5">
                <input type="hidden" name="id" value={course.id} />
                <CourseFields course={workingCopy(course, changes)} {...options} />
                <SubmitButton>{stage === "draft" ? "Save draft" : "Save changes"}</SubmitButton>
              </form>
            </Card>
          ) : null}

          {(!editable || stage === "edit") && (
            <Card>
              <CardTitle description={stage === "edit" ? "What students see until the changes are published" : undefined}>
                {stage === "edit" ? "Published version" : "Course information"}
              </CardTitle>
              <CourseInfo course={course} facultyName={course.faculty?.full_name} categoryName={course.category?.name} currency={options.currency} />
            </Card>
          )}

          {content && (
            <>
              <Card>
                <CardTitle description="Managed by the course faculty">Content</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {lectures?.data?.length ?? 0} lectures · {materials?.data?.length ?? 0} materials · {assignments?.count ?? 0} assignments · {quizzes?.count ?? 0} quizzes
                </p>
                {!!lectures?.data?.length && (
                  <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                    {lectures.data.map((l: { id: string; title: string }) => <li key={l.id}>{l.title}</li>)}
                  </ol>
                )}
              </Card>
              <Card>
                <CardTitle>Student progress</CardTitle>
                {!progress?.data?.length ? (
                  <Empty compact>No students enrolled.</Empty>
                ) : (
                  <Table head={["Student", "Completion", "Quiz avg", "Assignment avg"]}>
                    {progress.data.map((p: any) => (
                      <tr key={p.student_id}>
                        <Td>{p.full_name}</Td>
                        <Td>{pct(p.completion_rate)}</Td>
                        <Td>{pct(p.quiz_avg)}</Td>
                        <Td>{pct(p.assignment_avg)}</Td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
            </>
          )}
        </div>

        <CourseWorkflow course={course} changes={changes} viewer={profile.role} />
      </div>
    </>
  );
}
