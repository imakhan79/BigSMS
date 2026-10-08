import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Flash, type FlashParams, PageHeader, Tabs } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";
import { AssignmentsTab } from "./_components/AssignmentsTab";
import { AttendanceTab } from "./_components/AttendanceTab";
import { ExamsTab } from "./_components/ExamsTab";
import { FinalReportTab } from "./_components/FinalReportTab";
import { LecturesTab } from "./_components/LecturesTab";
import { OverviewTab } from "./_components/OverviewTab";
import { QuizzesTab } from "./_components/QuizzesTab";
import { StudentsTab } from "./_components/StudentsTab";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "lectures", label: "Lectures & materials" },
  { id: "attendance", label: "Attendance" },
  { id: "assignments", label: "Assignments" },
  { id: "quizzes", label: "Quizzes" },
  { id: "exams", label: "Exams & marks" },
  { id: "report", label: "Final report" },
  { id: "students", label: "Students & progress" },
] as const;

export default async function ProfessorCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FlashParams & { tab?: string; quiz?: string; edit?: string; session?: string; exam?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const profile = await requireRole("professor");
  const supabase = await createClient();
  const { data: course } = await supabase.from("courses").select("*").eq("id", id).eq("professor_id", profile.id).single();
  if (!course) notFound();

  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab : "overview";

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/professor/courses" className="transition-colors hover:text-foreground">My courses</Link>}
        title={course.title}
        subtitle="Course workspace"
        action={<Badge value={course.status} />}
      />
      <Flash params={sp} />
      <Tabs items={TABS.map((t) => ({ href: `/professor/courses/${id}?tab=${t.id}`, label: t.label, active: tab === t.id }))} />
      {tab === "overview" && <OverviewTab course={course as Course} />}
      {tab === "lectures" && <LecturesTab courseId={id} editId={sp.edit} />}
      {tab === "attendance" && <AttendanceTab courseId={id} sessionId={sp.session} />}
      {tab === "assignments" && <AssignmentsTab courseId={id} />}
      {tab === "quizzes" && <QuizzesTab courseId={id} quizId={sp.quiz} />}
      {tab === "exams" && <ExamsTab courseId={id} examId={sp.exam} />}
      {tab === "report" && <FinalReportTab courseId={id} />}
      {tab === "students" && <StudentsTab courseId={id} />}
    </>
  );
}
