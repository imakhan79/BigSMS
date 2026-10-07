import { StudentCell } from "@/app/professor/_components";
import { Card, CardTitle, Empty, Progress, Table, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { pct } from "@/lib/utils";

/** Students in this class: name, System ID and progress. Enrollment is handled by the Admin Manager. */
export async function StudentsTab({ courseId }: { courseId: string }) {
  const supabase = await createClient();
  const { data: progress } = await supabase.rpc("course_student_progress", { p_course_id: courseId });

  return (
    <Card>
      <CardTitle description="Students are enrolled by the Admin Manager.">Student progress</CardTitle>
      {!progress?.length ? (
        <Empty>No students are enrolled in this class yet.</Empty>
      ) : (
        <Table head={["Student", "Lecture completion", "Attendance", "Quiz avg", "Assignment avg"]}>
          {progress.map((p: any) => (
            <tr key={p.student_id}>
              <Td><StudentCell name={p.full_name} code={p.user_code} /></Td>
              <Td className="min-w-40">
                <div className="flex items-center gap-2"><Progress value={p.completion_rate} /><span className="text-xs">{pct(p.completion_rate)}</span></div>
              </Td>
              <Td>{pct(p.attendance_rate)}</Td>
              <Td>{pct(p.quiz_avg)}</Td>
              <Td>{pct(p.assignment_avg)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
