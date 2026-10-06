import { enrollStudents, unenrollStudent } from "@/app/manager/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, CardTitle, Empty, Flash, type FlashParams, Label, PageHeader, Select, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/utils";

export default async function EnrollmentPage({ searchParams }: { searchParams: Promise<FlashParams & { course?: string }> }) {
  const params = await searchParams;
  await requireRole("admin_manager");
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title, status, professor:profiles!courses_professor_id_fkey(full_name)")
    .in("status", ["published", "pending_approval", "draft"])
    .order("title");
  const courseId = params.course ?? courses?.find((c) => c.status === "published")?.id ?? courses?.[0]?.id;
  const [{ data: enrolled }, { data: students }] = await Promise.all([
    courseId
      ? supabase.from("enrollments").select("student_id, enrolled_at, student:profiles!enrollments_student_id_fkey(full_name, user_code, email)").eq("course_id", courseId)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("profiles").select("id, full_name, user_code").eq("role", "student").eq("status", "active").order("full_name"),
  ]);
  const enrolledIds = new Set((enrolled ?? []).map((e: any) => e.student_id));
  const available = (students ?? []).filter((s) => !enrolledIds.has(s.id));
  const back = `/manager/enrollment?course=${courseId ?? ""}`;
  const course = courses?.find((c) => c.id === courseId) as any;

  return (
    <>
      <PageHeader title="Course enrollment" subtitle="Enrol students in courses. Students see a course once it is published." />
      <Flash params={params} />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <Label label="Course" className="min-w-72">
          <Select name="course" defaultValue={courseId}>
            {courses?.map((c: any) => <option key={c.id} value={c.id}>{c.title} · {c.professor?.full_name}{c.status !== "published" ? ` (${c.status.replace("_", " ")})` : ""}</option>)}
          </Select>
        </Label>
        <SubmitButton variant="outline">Show</SubmitButton>
      </form>
      {!courseId ? (
        <Empty title="No courses yet">Courses appear here once professors create them.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardTitle description={`${enrolled?.length ?? 0} enrolled`}>{course?.title}</CardTitle>
            <Table head={["User ID", "Student", "Enrolled", ""]} empty={!enrolled?.length}>
              {enrolled?.map((e: any) => (
                <tr key={e.student_id}>
                  <Td className="font-mono text-xs">{e.student?.user_code ?? "—"}</Td>
                  <Td><p className="font-medium">{e.student?.full_name}</p><p className="text-xs text-muted-foreground">{e.student?.email}</p></Td>
                  <Td className="whitespace-nowrap">{formatDay(e.enrolled_at)}</Td>
                  <Td className="text-right">
                    <form action={unenrollStudent}>
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="student_id" value={e.student_id} />
                      <input type="hidden" name="back" value={back} />
                      <SubmitButton size="sm" variant="outline" confirm="Remove this student from the course?">Remove</SubmitButton>
                    </form>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card>
            <CardTitle description="Tick the students to enrol.">Add students</CardTitle>
            {!available.length ? (
              <Empty compact>Every active student is already enrolled.</Empty>
            ) : (
              <form action={enrollStudents} className="space-y-3">
                <input type="hidden" name="course_id" value={courseId} />
                <input type="hidden" name="back" value={back} />
                <div className="max-h-96 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {available.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                      <input type="checkbox" name="student_id" value={s.id} className="accent-primary" />
                      <span className="flex-1">{s.full_name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{s.user_code}</span>
                    </label>
                  ))}
                </div>
                <SubmitButton>Enrol selected</SubmitButton>
              </form>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
