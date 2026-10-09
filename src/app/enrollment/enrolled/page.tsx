import { unenrollStudent } from "@/app/enrollment/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, Empty, Flash, type FlashParams, Label, PageHeader, Select, Table, Td, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/utils";

/** Approved enrollments for one course, with their batch. */
export default async function EnrolledPage({ searchParams }: { searchParams: Promise<FlashParams & { course?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole("admin", "admin_manager", "principal");
  const office = profile.role !== "principal";
  const supabase = await createClient();
  const { data: courses } = await supabase.from("courses").select("id, code, title, status").neq("status", "archived").order("title");
  const courseId = params.course ?? courses?.find((c) => c.status === "published")?.id ?? courses?.[0]?.id;
  const { data: enrolled } = courseId
    ? await supabase
        .from("enrollments")
        .select("student_id, enrolled_at, batch:course_batches(name), student:profiles!enrollments_student_id_fkey(full_name, user_code), approver:profiles!enrollments_approved_by_fkey(full_name)")
        .eq("course_id", courseId)
        .order("enrolled_at")
    : { data: [] as any[] };
  const back = `/enrollment/enrolled?course=${courseId ?? ""}`;

  return (
    <>
      <PageHeader eyebrow={<TextLink href="/enrollment">← Student enrollment</TextLink>} title="Enrolled students" subtitle="Enrollments approved by the Principal." />
      <Flash params={params} />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <Label label="Course" className="min-w-72">
          <Select name="course" defaultValue={courseId}>
            {courses?.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}{c.status !== "published" ? ` (${c.status})` : ""}</option>)}
          </Select>
        </Label>
        <SubmitButton variant="outline">Show</SubmitButton>
      </form>
      {!courseId ? (
        <Empty title="No courses yet" />
      ) : (
        <Card>
          <Table head={["User ID", "Student", "Batch", "Enrolled", "Approved by", ""]} empty={!enrolled?.length}>
            {enrolled?.map((e: any) => (
              <tr key={e.student_id}>
                <Td className="font-mono text-xs">{e.student?.user_code ?? "—"}</Td>
                <Td className="font-medium">{e.student?.full_name}</Td>
                <Td>{e.batch?.name ?? "—"}</Td>
                <Td className="whitespace-nowrap">{formatDay(e.enrolled_at)}</Td>
                <Td>{e.approver?.full_name ?? "—"}</Td>
                <Td className="text-right">
                  {office && (
                    <form action={unenrollStudent}>
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="student_id" value={e.student_id} />
                      <input type="hidden" name="back" value={back} />
                      <SubmitButton size="sm" variant="outline" confirm="Remove this student from the course?">Remove</SubmitButton>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
