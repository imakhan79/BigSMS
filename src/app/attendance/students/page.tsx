import Link from "next/link";
import { CsvButton } from "@/components/CsvButton";
import { Alert, buttonClass, Card, CardTitle, PageHeader, Progress, Table, Td, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDay, pct } from "@/lib/utils";

interface CourseRow {
  course_id: string;
  title: string;
  professor_name: string;
  sessions: number;
  last_held: string | null;
  marked: number;
  rate: number | null;
}

interface StudentRow {
  student_id: string;
  full_name: string;
  user_code: string | null;
  batch_name: string | null;
  sessions: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
}

/**
 * Student attendance by course. The Principal, Admins and the Admin Manager see every course;
 * Faculty see only the courses (classes) assigned to them. Faculty enter attendance in the
 * course workspace.
 */
export default async function StudentAttendancePage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole("admin", "admin_manager", "principal", "professor");
  const faculty = profile.role === "professor";
  const supabase = await createClient();

  const [{ data }, { data: mine }] = await Promise.all([
    supabase.rpc("course_attendance"),
    faculty ? supabase.from("courses").select("id").eq("professor_id", profile.id) : Promise.resolve({ data: null }),
  ]);
  const own = new Set((mine ?? []).map((c) => c.id));
  const courses = ((data ?? []) as CourseRow[]).filter((c) => !faculty || own.has(c.course_id));
  const course = courses.find((c) => c.course_id === params.course);

  if (course) {
    const { data: students, error } = await supabase.rpc("course_attendance_students", { p_course_id: course.course_id });
    const rows = (students ?? []) as StudentRow[];
    return (
      <>
        <PageHeader
          eyebrow={<Link href="/attendance/students" className="transition-colors hover:text-foreground">Student attendance</Link>}
          title={course.title}
          subtitle={`Faculty: ${course.professor_name} · ${course.sessions} register${course.sessions === 1 ? "" : "s"}. Counts submitted registers; late counts as attended, excused is left out.`}
          action={
            <div className="flex flex-wrap gap-2">
              {faculty && <Link href={`/professor/courses/${course.course_id}?tab=attendance`} className={buttonClass("primary")}>Take attendance</Link>}
              <CsvButton
                filename={`attendance-${course.title.replace(/\W+/g, "-").toLowerCase()}.csv`}
                rows={rows.map((r) => ({
                  student: r.full_name, student_id: r.user_code, class: r.batch_name ?? "", registers: r.sessions,
                  present: r.present, late: r.late, absent: r.absent, excused: r.excused, rate: r.rate ?? "",
                }))}
              />
            </div>
          }
        />
        {error && <Alert tone="danger" className="mb-5">{error.message}</Alert>}
        <Card>
          <Table head={["Student", "Class", "Registers", "Present", "Late", "Absent", "Excused", "Attendance"]} empty={!rows.length}>
            {rows.map((r) => (
              <tr key={r.student_id}>
                <Td>
                  <p className="font-medium">{r.full_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{r.user_code}</p>
                </Td>
                <Td>{r.batch_name ?? "—"}</Td>
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

  return (
    <>
      <PageHeader
        title="Student attendance"
        subtitle={faculty
          ? "Attendance in the classes assigned to you. You can mark only students enrolled in your own classes."
          : "Attendance by course. Faculty take attendance for their own classes."}
      />
      <Card>
        <CardTitle description="Published courses. Open one to see each student's attendance.">Courses</CardTitle>
        <Table head={["Course", "Faculty", "Registers", "Last register", "Attendance", ""]} empty={!courses.length}>
          {courses.map((c) => (
            <tr key={c.course_id}>
              <Td className="font-medium">{c.title}</Td>
              <Td>{c.professor_name}</Td>
              <Td>{c.sessions}</Td>
              <Td>{formatDay(c.last_held)}</Td>
              <Td className="w-40">
                <p className="mb-1 font-medium">{pct(c.rate)}</p>
                {c.rate != null && <Progress value={c.rate} />}
              </Td>
              <Td className="text-right"><TextLink href={`/attendance/students?course=${c.course_id}`}>Students</TextLink></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
