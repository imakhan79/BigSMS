import { enrollStudents, unenrollStudent } from "@/app/professor/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, CardTitle, Empty, Progress, Table, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { pct } from "@/lib/utils";

export async function StudentsTab({ courseId }: { courseId: string }) {
  const supabase = await createClient();
  const [{ data: progress }, { data: students }] = await Promise.all([
    supabase.rpc("course_student_progress", { p_course_id: courseId }),
    supabase.from("profiles").select("id, full_name, email").eq("role", "student").eq("status", "active").order("full_name"),
  ]);
  const enrolled = new Set<string>((progress ?? []).map((p: { student_id: string }) => p.student_id));
  const available = students?.filter((s) => !enrolled.has(s.id)) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardTitle>Student progress</CardTitle>
        {!progress?.length ? (
          <Empty>No students assigned yet.</Empty>
        ) : (
          <Table head={["Student", "Lecture completion", "Quiz avg", "Assignment avg", ""]}>
            {progress.map((p: any) => (
              <tr key={p.student_id}>
                <Td>
                  <p className="font-medium">{p.full_name}</p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                </Td>
                <Td className="min-w-40">
                  <div className="flex items-center gap-2"><Progress value={p.completion_rate} /><span className="text-xs">{pct(p.completion_rate)}</span></div>
                </Td>
                <Td>{pct(p.quiz_avg)}</Td>
                <Td>{pct(p.assignment_avg)}</Td>
                <Td className="text-right">
                  <form action={unenrollStudent}>
                    <input type="hidden" name="course_id" value={courseId} />
                    <input type="hidden" name="student_id" value={p.student_id} />
                    <SubmitButton size="sm" variant="ghost" confirm="Remove this student from the course?">Remove</SubmitButton>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card className="h-fit">
        <CardTitle>Assign students</CardTitle>
        {!available.length ? (
          <p className="text-sm text-muted-foreground">All active students are already assigned.</p>
        ) : (
          <form action={enrollStudents} className="space-y-3">
            <input type="hidden" name="course_id" value={courseId} />
            <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {available.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-secondary">
                  <input type="checkbox" name="student_id" value={s.id} />
                  <span>{s.full_name || s.email}</span>
                </label>
              ))}
            </div>
            <SubmitButton className="w-full">Assign selected</SubmitButton>
          </form>
        )}
      </Card>
    </div>
  );
}
