import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Flash, PageHeader, type FlashParams } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AssignmentsTab } from "./_components/AssignmentsTab";
import { LecturesTab } from "./_components/LecturesTab";
import { OverviewTab } from "./_components/OverviewTab";
import { QuizzesTab } from "./_components/QuizzesTab";
import { StudentsTab } from "./_components/StudentsTab";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "lectures", label: "Lectures & materials" },
  { id: "assignments", label: "Assignments" },
  { id: "quizzes", label: "Quizzes" },
  { id: "students", label: "Students & progress" },
] as const;

export default async function ProfessorCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FlashParams & { tab?: string; quiz?: string; edit?: string }>;
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
        title={course.title}
        subtitle="Course workspace"
        action={<Link href="/professor/courses" className="text-sm text-primary hover:underline">← My courses</Link>}
      />
      <div className="mb-4 flex items-center gap-2"><Badge value={course.status} /></div>
      <Flash params={sp} />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/professor/courses/${id}?tab=${t.id}`}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium",
              tab === t.id ? "border-accent text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "overview" && <OverviewTab course={course as Course} />}
      {tab === "lectures" && <LecturesTab courseId={id} editId={sp.edit} />}
      {tab === "assignments" && <AssignmentsTab courseId={id} />}
      {tab === "quizzes" && <QuizzesTab courseId={id} quizId={sp.quiz} />}
      {tab === "students" && <StudentsTab courseId={id} />}
    </>
  );
}
