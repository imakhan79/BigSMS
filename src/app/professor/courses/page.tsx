import Link from "next/link";
import { createCourse } from "@/app/courses/actions";
import { CourseFields, CourseStageBadge } from "@/components/CourseManagement";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, CardTitle, Empty, Filters, Flash, type FlashParams, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { COURSE_STAGES, courseFormOptions, filterStage, formatDuration, STAGE_LABEL } from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function ProfessorCourses({ searchParams }: { searchParams: Promise<FlashParams & { stage?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole("professor");
  const supabase = await createClient();

  let query = supabase
    .from("courses")
    .select("id, code, title, description, status, editing, ready_at, duration_value, duration_unit, updated_at, course_categories(name), enrollments(count)")
    .eq("professor_id", profile.id)
    .order("updated_at", { ascending: false });
  query = filterStage(query, params.stage);
  const [{ data: courses }, { categories, currency }] = await Promise.all([query, courseFormOptions(supabase)]);

  return (
    <>
      <PageHeader title="My courses" subtitle="Create and edit your courses. The Principal or Admin Manager publishes and archives them." />
      <Flash params={params} />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-4">
            <Filters
              items={[undefined, ...COURSE_STAGES].map((s) => ({
                href: s ? `/professor/courses?stage=${s}` : "/professor/courses",
                label: s ? STAGE_LABEL[s] : "All",
                active: params.stage === s,
              }))}
            />
          </div>
          {!courses?.length ? (
            <Empty>No courses yet. Create your first course.</Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {courses.map((c: any) => (
                <Link key={c.id} href={`/professor/courses/${c.id}`}>
                  <Card className="h-full transition-colors duration-150 hover:border-foreground/20">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
                        <h3 className="font-semibold text-foreground">{c.title}</h3>
                      </div>
                      <CourseStageBadge course={c} />
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{c.description || "No description"}</p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {c.course_categories?.name ?? "Uncategorised"} · {formatDuration(c.duration_value, c.duration_unit)} · {c.enrollments?.[0]?.count ?? 0} students · {formatDate(c.updated_at)}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
        <Card className="h-fit">
          <CardTitle description="You are the course faculty. You can finish the details later.">New course</CardTitle>
          <form action={createCourse} className="space-y-4">
            <CourseFields categories={categories} currency={currency} compact />
            <SubmitButton className="w-full">Create draft</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
