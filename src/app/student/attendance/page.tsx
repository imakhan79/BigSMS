import { Card, PageHeader, Progress, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pct } from "@/lib/utils";

interface Row {
  course_id: string;
  title: string;
  sessions: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
}

/** The student's own attendance per course, from submitted registers. */
export default async function StudentAttendancePage() {
  const profile = await requireRole("student");
  const supabase = await createClient();
  const { data } = await supabase.rpc("student_attendance", { p_student_id: profile.id });
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader title="My attendance" subtitle="Your attendance in each course, once your Faculty submit the register. Late counts as attended; excused is left out." />
      <Card>
        <Table head={["Course", "Classes", "Present", "Late", "Absent", "Excused", "Attendance"]} empty={!rows.length}>
          {rows.map((r) => (
            <tr key={r.course_id}>
              <Td className="font-medium">{r.title}</Td>
              <Td>{r.sessions}</Td>
              <Td>{r.present}</Td>
              <Td>{r.late}</Td>
              <Td className={r.absent ? "font-medium text-danger" : undefined}>{r.absent}</Td>
              <Td>{r.excused}</Td>
              <Td className="w-40">
                <p className="mb-1 font-medium">{pct(r.rate)}</p>
                {r.rate != null && <Progress value={r.rate} />}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
