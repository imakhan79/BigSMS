import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressCards } from "@/components/ProgressCards";
import { EVENT_SELECT, MonthCalendar, monthParam, SLOT_SELECT, WeekTimetable, type CalendarEvent, type Slot } from "@/components/Timetable";
import { Alert, Badge, Card, Empty, PageHeader, Progress, Table, Tabs, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { EXAM_KINDS, gradeFor, SUBMISSION_STATUS_LABEL } from "@/lib/faculty";
import { getCurrency } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import type { StudentProgress } from "@/lib/types";
import { formatDate, formatDay, formatMoney, pct } from "@/lib/utils";

const TABS = [
  { id: "courses", label: "Courses" },
  { id: "timetable", label: "Timetable" },
  { id: "attendance", label: "Attendance" },
  { id: "assignments", label: "Assignments" },
  { id: "exams", label: "Exams" },
  { id: "fees", label: "Fees" },
  { id: "certificates", label: "Certificates" },
] as const;

interface Enrollment { course_id: string; batch_id: string | null }

/** Who an assignment or exam is for, checked against the child's enrollments. */
function forChild(item: { course_id: string; audience: string; batch_id: string | null; listed: string[] }, childId: string, enrolled: Enrollment[]) {
  const e = enrolled.find((x) => x.course_id === item.course_id);
  if (!e) return false;
  if (item.audience === "batch") return e.batch_id === item.batch_id;
  if (item.audience === "students") return item.listed.includes(childId);
  return true;
}

/**
 * One child, as they see themselves in the student portal: read-only. Row level security gives a
 * parent only their own children's student-visible records; this page narrows them to this child.
 */
export default async function ParentChildPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; view?: string; month?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireRole("parent");
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : "courses";
  const supabase = await createClient();

  const [{ data: child }, { data: enrollmentRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, user_code").eq("id", id).eq("role", "student").maybeSingle(),
    supabase.from("enrollments").select("course_id, batch_id").eq("student_id", id),
  ]);
  if (!child) notFound();
  const enrolled = (enrollmentRows ?? []) as Enrollment[];
  const courseIds = enrolled.map((e) => e.course_id);
  const base = `/parent/children/${id}`;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/parent" className="transition-colors hover:text-foreground">My children</Link>}
        title={child.full_name}
        subtitle={<><span className="font-mono">{child.user_code}</span> · What {child.full_name.split(" ")[0]} sees in the student portal</>}
      />
      <Tabs items={TABS.map((t) => ({ href: `${base}?tab=${t.id}`, label: t.label, active: tab === t.id }))} />

      {tab === "courses" && <Courses childId={id} />}
      {tab === "timetable" && <Timetable childId={id} enrolled={enrolled} base={base} view={sp.view} month={sp.month} />}
      {tab === "attendance" && <Attendance childId={id} />}
      {tab === "assignments" && <Assignments childId={id} enrolled={enrolled} courseIds={courseIds} />}
      {tab === "exams" && <Exams childId={id} enrolled={enrolled} courseIds={courseIds} />}
      {tab === "fees" && <Fees childId={id} />}
      {tab === "certificates" && <Certificates childId={id} />}
    </>
  );
}

async function Courses({ childId }: { childId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("student_progress", { p_student_id: childId });
  return <ProgressCards rows={(data ?? []) as StudentProgress[]} />;
}

async function Timetable({ childId, enrolled, base, view, month: monthRaw }: { childId: string; enrolled: Enrollment[]; base: string; view?: string; month?: string }) {
  const supabase = await createClient();
  const month = monthParam(monthRaw);
  const [{ data: slots }, { data: events }, { data: exams }] = await Promise.all([
    supabase.from("timetable_slots").select(SLOT_SELECT).eq("state", "live"),
    supabase.from("calendar_events").select(`${EVENT_SELECT}, course_id`).eq("state", "live"),
    supabase.from("exams").select("id, title, held_on, course_id, audience, batch_id, course:courses(title), exam_students(student_id)"),
  ]);
  const mine = ((slots ?? []) as unknown as Slot[]).filter((s) =>
    enrolled.some((e) => e.course_id === s.course?.id && (!s.batch_id || s.batch_id === e.batch_id)),
  );
  const myEvents = ((events ?? []) as unknown as (CalendarEvent & { course_id: string | null })[]).filter(
    (e) => !e.course_id || enrolled.some((x) => x.course_id === e.course_id),
  );
  const myExams = ((exams ?? []) as any[]).filter((x) =>
    forChild({ course_id: x.course_id, audience: x.audience, batch_id: x.batch_id, listed: x.exam_students.map((s: any) => s.student_id) }, childId, enrolled),
  );
  const calendar = view === "calendar";
  return (
    <>
      <Tabs items={[
        { href: `${base}?tab=timetable`, label: "Weekly schedule", active: !calendar },
        { href: `${base}?tab=timetable&view=calendar&month=${month}`, label: "Calendar", active: calendar },
      ]} />
      {calendar ? (
        <MonthCalendar month={month} href={(m) => `${base}?tab=timetable&view=calendar&month=${m}`} slots={mine} events={myEvents} exams={myExams} />
      ) : (
        <WeekTimetable slots={mine} empty="Classes appear here once the timetable is published." />
      )}
    </>
  );
}

async function Attendance({ childId }: { childId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("child_attendance", { p_student_id: childId });
  const rows = (data ?? []) as { course_id: string; title: string; sessions: number; present: number; late: number; absent: number; excused: number; rate: number | null }[];
  return (
    <Card>
      <p className="mb-3 text-sm text-muted-foreground">From registers Faculty have submitted. Late counts as attended; excused is left out.</p>
      <Table head={["Course", "Classes", "Present", "Late", "Absent", "Excused", "Attendance"]} empty={!rows.length}>
        {rows.map((r) => (
          <tr key={r.course_id}>
            <Td className="font-medium">{r.title}</Td>
            <Td>{r.sessions}</Td>
            <Td>{r.present}</Td>
            <Td>{r.late}</Td>
            <Td className={Number(r.absent) ? "font-medium text-danger" : undefined}>{r.absent}</Td>
            <Td>{r.excused}</Td>
            <Td className="w-40"><p className="mb-1 font-medium">{pct(r.rate)}</p>{r.rate != null && <Progress value={Number(r.rate)} />}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

async function Assignments({ childId, enrolled, courseIds }: { childId: string; enrolled: Enrollment[]; courseIds: string[] }) {
  const supabase = await createClient();
  const { data } = courseIds.length
    ? await supabase
        .from("assignments")
        .select("id, course_id, title, instructions, due_at, max_score, audience, batch_id, course:courses(title), assignment_students(student_id), submissions(student_id, status, score, feedback, submitted_at, late)")
        .in("course_id", courseIds)
        .eq("submissions.student_id", childId)
        .order("due_at")
    : { data: [] };
  const rows = ((data ?? []) as any[]).filter((a) =>
    forChild({ course_id: a.course_id, audience: a.audience, batch_id: a.batch_id, listed: a.assignment_students.map((s: any) => s.student_id) }, childId, enrolled),
  );
  if (!rows.length) return <Empty>No assignments yet.</Empty>;
  return (
    <div className="space-y-4">
      {rows.map((a) => {
        const sub = a.submissions?.[0];
        const pastDue = !!a.due_at && new Date(a.due_at) < new Date();
        return (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{a.title}</h3>
                <p className="text-xs text-muted-foreground">{a.course?.title} · Due {formatDate(a.due_at)} · out of {a.max_score}</p>
              </div>
              <span className="flex flex-wrap items-center gap-2">
                {sub?.late && <Badge value="late">Late submission</Badge>}
                {sub ? <Badge value={sub.status}>{SUBMISSION_STATUS_LABEL[sub.status] ?? sub.status}</Badge>
                  : <Badge value={pastDue ? "overdue" : "pending"}>{pastDue ? "Overdue" : "Not submitted"}</Badge>}
              </span>
            </div>
            {sub?.status === "graded" && (
              <div className="mt-3 rounded-md bg-secondary p-3 text-sm">
                <p className="font-semibold text-primary">Score: {sub.score}/{a.max_score}</p>
                {sub.feedback && <p className="mt-1">Feedback: {sub.feedback}</p>}
              </div>
            )}
            {sub && sub.status !== "graded" && sub.status !== "missing" && sub.status !== "excused" && (
              <p className="mt-2 text-xs text-muted-foreground">Handed in {formatDate(sub.submitted_at)}.</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

async function Exams({ childId, enrolled, courseIds }: { childId: string; enrolled: Enrollment[]; courseIds: string[] }) {
  const supabase = await createClient();
  const { data } = courseIds.length
    ? await supabase
        .from("exams")
        .select("id, course_id, title, kind, held_on, max_marks, mode, starts_at, duration_minutes, results_status, audience, batch_id, course:courses(title), exam_students(student_id), exam_results(student_id, marks, absent, remarks)")
        .in("course_id", courseIds)
        .eq("exam_results.student_id", childId)
        .order("held_on", { ascending: false })
    : { data: [] };
  const rows = ((data ?? []) as any[]).filter((x) =>
    forChild({ course_id: x.course_id, audience: x.audience, batch_id: x.batch_id, listed: x.exam_students.map((s: any) => s.student_id) }, childId, enrolled),
  );
  if (!rows.length) return <Empty>No exams yet.</Empty>;
  return (
    <div className="space-y-4">
      {rows.map((e) => {
        const result = e.results_status === "approved" ? e.exam_results[0] : undefined;
        const percent = result && !result.absent && result.marks != null ? (Number(result.marks) / Number(e.max_marks)) * 100 : null;
        return (
          <Card key={e.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{e.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {e.course?.title} · {EXAM_KINDS[e.kind] ?? e.kind} · out of {Number(e.max_marks)} ·{" "}
                  {e.mode === "online" ? `Online, ${formatDate(e.starts_at)} (${e.duration_minutes} min)` : `In class, ${formatDay(e.held_on)}`}
                </p>
              </div>
              {result ? <Badge value="published">Result published</Badge> : <Badge value="pending">Awaiting result</Badge>}
            </div>
            {result && (
              <div className="mt-3 rounded-md bg-secondary p-3 text-sm">
                {result.absent ? <p className="font-semibold text-danger">Absent</p> : (
                  <p className="font-semibold text-primary">Marks: {Number(result.marks)} / {Number(e.max_marks)} · {pct(percent)} · Grade {gradeFor(percent) || "—"}</p>
                )}
                {result.remarks && <p className="mt-1">Remarks: {result.remarks}</p>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

async function Fees({ childId }: { childId: string }) {
  const supabase = await createClient();
  const [{ data }, currency] = await Promise.all([
    supabase.from("invoices").select("id, invoice_no, title, amount, amount_paid, due_on, status").eq("student_id", childId).neq("status", "cancelled").order("due_on", { ascending: false }),
    getCurrency(supabase),
  ]);
  const rows = data ?? [];
  const outstanding = rows.reduce((t, r) => t + Number(r.amount) - Number(r.amount_paid), 0);
  return (
    <Card>
      {outstanding > 0 && <Alert tone="warning" className="mb-4">Outstanding: {formatMoney(outstanding, currency)}</Alert>}
      <Table head={["Invoice", "Due", "Amount", "Paid", "Status"]} empty={!rows.length}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td><p className="font-medium">{r.title}</p><p className="font-mono text-xs text-muted-foreground">{r.invoice_no}</p></Td>
            <Td>{formatDay(r.due_on)}</Td>
            <Td>{formatMoney(r.amount, currency)}</Td>
            <Td>{formatMoney(r.amount_paid, currency)}</Td>
            <Td><Badge value={r.status} /></Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

async function Certificates({ childId }: { childId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("certificates").select("id, certificate_no, title, kind, status, issued_on").eq("student_id", childId).order("issued_on", { ascending: false });
  const rows = data ?? [];
  return (
    <Card>
      <Table head={["Certificate", "Type", "Issued", "Status"]} empty={!rows.length}>
        {rows.map((c) => (
          <tr key={c.id}>
            <Td><Link href={`/certificate/${c.id}`} className="font-medium hover:underline">{c.title}</Link><p className="font-mono text-xs text-muted-foreground">{c.certificate_no}</p></Td>
            <Td className="capitalize">{c.kind}</Td>
            <Td>{formatDay(c.issued_on)}</Td>
            <Td><Badge value={c.status} /></Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
