import { BarList, TrendChart } from "@/components/Charts";
import { CsvButton } from "@/components/CsvButton";
import { Card, CardTitle, Filters, Input, Label, PageHeader, Stat, Table, Tabs, Td, buttonClass } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pct } from "@/lib/utils";

interface Monthly {
  month: string;
  attendance_rate: number | null;
  attendance_marked: number;
  exam_average: number | null;
  exam_results: number;
  assignment_average: number | null;
  assignments_graded: number;
  on_time_rate: number | null;
  work_handed_in: number;
  lectures_completed: number;
  new_enrollments: number;
}

interface Current {
  courses: number;
  students: number;
  faculty: number;
  attendance_rate: number | null;
  exam_average: number | null;
  exam_pass_rate: number | null;
  assignment_average: number | null;
  on_time_rate: number | null;
  completion_rate: number | null;
  pending_grading: number;
}

interface CourseRow {
  course_id: string;
  title: string;
  code: string;
  faculty_name: string | null;
  students: number;
  attendance_rate: number | null;
  exam_average: number | null;
  exam_pass_rate: number | null;
  assignment_average: number | null;
  on_time_rate: number | null;
  completion_rate: number | null;
}

interface AttendanceRow {
  student_id: string;
  full_name: string;
  user_code: string | null;
  course_id: string;
  course_title: string;
  class_name: string | null;
  sessions: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
}

/** Attendance below this is flagged. */
const AT_RISK = 75;
const RANGES = { "3": "3 months", "6": "6 months", "12": "12 months", "24": "24 months" } as const;
const COURSE_METRICS = {
  attendance_rate: "Attendance",
  exam_average: "Exam average",
  exam_pass_rate: "Exam pass rate",
  assignment_average: "Assignment average",
  on_time_rate: "On-time submissions",
  completion_rate: "Lecture completion",
} as const;
type CourseMetric = keyof typeof COURSE_METRICS;

const monthLabel = (m: string) => new Date(`${m.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const num = (v: number | string | null) => (v == null ? null : Number(v));

/**
 * Analytics (BRD 14). The database scopes every figure: the Principal and admins see the whole
 * institute, Faculty their own courses and students, and students only themselves.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; months?: string; metric?: string; from?: string; to?: string; course?: string; risk?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireRole("admin", "principal", "professor", "student");
  const tab = params.tab === "courses" || params.tab === "attendance" ? params.tab : "institute";
  const months = params.months && params.months in RANGES ? params.months : "12";
  const metric: CourseMetric = params.metric && params.metric in COURSE_METRICS ? (params.metric as CourseMetric) : "attendance_rate";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? "") ? params.from! : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? "") ? params.to! : "";
  const student = profile.role === "student";
  const faculty = profile.role === "professor";
  const scope = student ? "Your own results" : faculty ? "Your courses and their students" : "The whole institute";
  const supabase = await createClient();

  const tabs = (
    <Tabs
      items={[
        { href: "/analytics", label: student ? "My performance" : "Institute performance", active: tab === "institute" },
        { href: "/analytics?tab=courses", label: "Course performance", active: tab === "courses" },
        { href: "/analytics?tab=attendance", label: student ? "My attendance" : "Student attendance", active: tab === "attendance" },
      ]}
    />
  );
  const header = <PageHeader title="Analytics" subtitle={`${scope}. Only submitted attendance, published exam results and saved grades are counted.`} />;

  if (tab === "institute") {
    const [{ data: cur }, { data: mon }] = await Promise.all([
      supabase.rpc("analytics_current"),
      supabase.rpc("analytics_monthly", { p_months: Number(months) }),
    ]);
    const c = ((cur ?? [])[0] ?? null) as Current | null;
    const series = (mon ?? []) as Monthly[];
    const thisMonth = series[series.length - 1];
    const lastMonth = series[series.length - 2];
    const delta = (key: keyof Monthly) => {
      const a = num(thisMonth?.[key] as number | null);
      const b = num(lastMonth?.[key] as number | null);
      return a == null || b == null ? undefined : `${a - b >= 0 ? "+" : ""}${(a - b).toFixed(1)} pts vs last month`;
    };
    const trend = (key: keyof Monthly, count: keyof Monthly) =>
      series.map((m) => ({ label: monthLabel(m.month), value: num(m[key] as number | null), count: Number(m[count]) }));

    return (
      <>
        {header}
        {tabs}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Current performance</h2>
        <div className="mb-3 grid grid-cols-2 gap-4 md:grid-cols-4">
          {!student && <Stat label="Courses" value={c?.courses ?? 0} hint={faculty ? "assigned to you" : "active"} />}
          {!student && <Stat label="Students" value={c?.students ?? 0} hint="enrolled" />}
          {!student && !faculty && <Stat label="Faculty" value={c?.faculty ?? 0} hint="teaching" />}
          <Stat label="Attendance" value={pct(num(c?.attendance_rate ?? null))} hint={delta("attendance_rate") ?? "all submitted registers"} />
          <Stat label="Exam average" value={pct(num(c?.exam_average ?? null))} hint={`pass rate ${pct(num(c?.exam_pass_rate ?? null))}`} />
          <Stat label="Assignment average" value={pct(num(c?.assignment_average ?? null))} hint={delta("assignment_average") ?? "graded work"} />
          <Stat label="On-time submissions" value={pct(num(c?.on_time_rate ?? null))} hint="handed in by the due date" />
          <Stat label="Lecture completion" value={pct(num(c?.completion_rate ?? null))} />
          {!student && <Stat label="Awaiting grading" value={c?.pending_grading ?? 0} hint="submissions" />}
        </div>

        <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historic performance</h2>
          <Filters items={Object.entries(RANGES).map(([k, v]) => ({ href: `/analytics?months=${k}`, label: v, active: months === k }))} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardTitle description="Present or late, out of sessions marked (excused left out)">Attendance rate by month</CardTitle><TrendChart points={trend("attendance_rate", "attendance_marked")} countLabel="marks" /></Card>
          <Card><CardTitle description="Average percentage in published exam results">Exam average by month</CardTitle><TrendChart points={trend("exam_average", "exam_results")} countLabel="results" /></Card>
          <Card><CardTitle description="Average score of work graded that month">Assignment average by month</CardTitle><TrendChart points={trend("assignment_average", "assignments_graded")} countLabel="graded" /></Card>
          <Card><CardTitle description="Share of work handed in by the due date">On-time submissions by month</CardTitle><TrendChart points={trend("on_time_rate", "work_handed_in")} countLabel="handed in" /></Card>
        </div>
        <Card className="mt-6">
          <CardTitle action={
            <CsvButton filename={`analytics-monthly-${months}m.csv`} rows={series.map((m) => ({
              month: m.month.slice(0, 7), attendance_rate: m.attendance_rate ?? "", exam_average: m.exam_average ?? "", assignment_average: m.assignment_average ?? "",
              on_time_rate: m.on_time_rate ?? "", lectures_completed: m.lectures_completed, new_enrollments: m.new_enrollments,
            }))} />
          }>
            By month
          </CardTitle>
          <Table head={["Month", "Attendance", "Exam avg", "Assignment avg", "On time", "Lectures completed", "New enrolments"]}>
            {[...series].reverse().map((m) => (
              <tr key={m.month}>
                <Td className="font-medium">{monthLabel(m.month)}</Td>
                <Td>{pct(num(m.attendance_rate))}</Td>
                <Td>{pct(num(m.exam_average))}</Td>
                <Td>{pct(num(m.assignment_average))}</Td>
                <Td>{pct(num(m.on_time_rate))}</Td>
                <Td>{m.lectures_completed}</Td>
                <Td>{m.new_enrollments}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </>
    );
  }

  if (tab === "courses") {
    const { data } = await supabase.rpc("analytics_course_performance");
    const rows = (data ?? []) as CourseRow[];
    const sorted = [...rows].sort((a, b) => (num(b[metric]) ?? -1) - (num(a[metric]) ?? -1));
    return (
      <>
        {header}
        {tabs}
        <Card className="mb-6">
          <CardTitle description={student ? "Your result in each of your courses" : "Ranked, highest first"}>
            {COURSE_METRICS[metric]} by course
          </CardTitle>
          <div className="mb-4">
            <Filters items={Object.entries(COURSE_METRICS).map(([k, v]) => ({ href: `/analytics?tab=courses&metric=${k}`, label: v, active: metric === k }))} />
          </div>
          <BarList items={sorted.map((r) => ({ label: r.title, value: num(r[metric]), note: r.faculty_name ?? undefined }))} alertBelow={metric === "attendance_rate" ? AT_RISK : undefined} />
        </Card>
        <Card>
          <CardTitle action={
            <CsvButton filename="course-performance.csv" rows={rows.map((r) => ({
              course: r.title, code: r.code, faculty: r.faculty_name, students: r.students, attendance: r.attendance_rate ?? "", exam_average: r.exam_average ?? "",
              exam_pass_rate: r.exam_pass_rate ?? "", assignment_average: r.assignment_average ?? "", on_time: r.on_time_rate ?? "", completion: r.completion_rate ?? "",
            }))} />
          }>
            Course performance
          </CardTitle>
          <Table head={["Course", "Faculty", ...(student ? [] : ["Students"]), "Attendance", "Exam avg", "Pass rate", "Assignment avg", "On time", "Completion"]} empty={!rows.length}>
            {rows.map((r) => (
              <tr key={r.course_id}>
                <Td><p className="font-medium">{r.title}</p><p className="font-mono text-xs text-muted-foreground">{r.code}</p></Td>
                <Td>{r.faculty_name ?? "—"}</Td>
                {!student && <Td>{r.students}</Td>}
                <Td className={num(r.attendance_rate) != null && num(r.attendance_rate)! < AT_RISK ? "font-medium text-danger" : undefined}>{pct(num(r.attendance_rate))}</Td>
                <Td>{pct(num(r.exam_average))}</Td>
                <Td>{pct(num(r.exam_pass_rate))}</Td>
                <Td>{pct(num(r.assignment_average))}</Td>
                <Td>{pct(num(r.on_time_rate))}</Td>
                <Td>{pct(num(r.completion_rate))}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </>
    );
  }

  // Student attendance
  const { data } = await supabase.rpc("analytics_attendance", { p_from: from || null, p_to: to || null });
  const all = (data ?? []) as AttendanceRow[];
  const courses = [...new Map(all.map((r) => [r.course_id, r.course_title])).entries()];
  const course = courses.some(([id]) => id === params.course) ? params.course! : "";
  const riskOnly = params.risk === "1";
  const inCourse = course ? all.filter((r) => r.course_id === course) : all;
  const rows = riskOnly ? inCourse.filter((r) => num(r.rate) != null && num(r.rate)! < AT_RISK) : inCourse;
  const byCourse = courses.map(([id, title]) => {
    const r = all.filter((x) => x.course_id === id);
    const counted = r.reduce((t, x) => t + Number(x.sessions) - Number(x.excused), 0);
    const attended = r.reduce((t, x) => t + Number(x.present) + Number(x.late), 0);
    return { label: title, value: counted ? (100 * attended) / counted : null, note: `${r.length} student${r.length === 1 ? "" : "s"}` };
  });
  const atRisk = all.filter((r) => num(r.rate) != null && num(r.rate)! < AT_RISK);
  const totalAbsent = all.reduce((t, r) => t + Number(r.absent), 0);
  const counted = all.reduce((t, r) => t + Number(r.sessions) - Number(r.excused), 0);
  const overall = counted ? (100 * all.reduce((t, r) => t + Number(r.present) + Number(r.late), 0)) / counted : null;
  const qs = (extra: Record<string, string>) =>
    `/analytics?${new URLSearchParams({ tab: "attendance", ...(from ? { from } : {}), ...(to ? { to } : {}), ...(course ? { course } : {}), ...(riskOnly ? { risk: "1" } : {}), ...extra }).toString()}`;

  return (
    <>
      {header}
      {tabs}
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="attendance" />
        <Label label="From"><Input name="from" type="date" defaultValue={from} /></Label>
        <Label label="To"><Input name="to" type="date" defaultValue={to} /></Label>
        {course && <input type="hidden" name="course" value={course} />}
        <button className={buttonClass("outline")}>Apply</button>
      </form>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Attendance" value={pct(overall)} hint={from || to ? "in the chosen dates" : "all submitted registers"} />
        <Stat label="Absences" value={totalAbsent} />
        {!student && <Stat label={`Below ${AT_RISK}%`} value={atRisk.length} hint="student-course pairs" />}
        {!student && <Stat label="Students" value={new Set(all.map((r) => r.student_id)).size} />}
      </div>
      <Card className="mb-6">
        <CardTitle description={`Present or late, out of sessions marked. Below ${AT_RISK}% is flagged.`}>Attendance by course</CardTitle>
        <BarList items={byCourse} alertBelow={AT_RISK} />
      </Card>
      <Card>
        <CardTitle action={
          <CsvButton filename="student-attendance.csv" rows={rows.map((r) => ({
            student: r.full_name, student_id: r.user_code, course: r.course_title, class: r.class_name ?? "", sessions: r.sessions,
            present: r.present, late: r.late, absent: r.absent, excused: r.excused, rate: r.rate ?? "",
          }))} />
        }>
          {student ? "My attendance by course" : "Students"}
        </CardTitle>
        {!student && (
          <div className="mb-4 flex flex-wrap gap-3">
            <Filters label="Course" items={[{ href: qs({ course: "" }), label: "All", active: !course }, ...courses.map(([id, title]) => ({ href: qs({ course: id }), label: title, active: course === id }))]} />
            <Filters items={[{ href: qs({ risk: "" }), label: "Everyone", active: !riskOnly }, { href: qs({ risk: "1" }), label: `Below ${AT_RISK}%`, active: riskOnly }]} />
          </div>
        )}
        <Table head={[...(student ? [] : ["Student"]), "Course", "Class", "Sessions", "Present", "Late", "Absent", "Excused", "Attendance"]} empty={!rows.length}>
          {rows.map((r) => {
            const low = num(r.rate) != null && num(r.rate)! < AT_RISK;
            return (
              <tr key={`${r.student_id}-${r.course_id}`}>
                {!student && <Td><p className="font-medium">{r.full_name}</p><p className="font-mono text-xs text-muted-foreground">{r.user_code}</p></Td>}
                <Td>{r.course_title}</Td>
                <Td>{r.class_name ?? "—"}</Td>
                <Td>{r.sessions}</Td>
                <Td>{r.present}</Td>
                <Td>{r.late}</Td>
                <Td className={Number(r.absent) ? "font-medium text-danger" : undefined}>{r.absent}</Td>
                <Td>{r.excused}</Td>
                <Td className={low ? "font-semibold text-danger" : "font-medium"}>{pct(num(r.rate))}{low && " · low"}</Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
