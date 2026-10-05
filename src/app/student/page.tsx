import { ProgressCards } from "@/components/ProgressCards";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { StudentProgress } from "@/lib/types";

export default async function StudentDashboard() {
  const profile = await requireRole("student");
  const supabase = await createClient();
  const { data } = await supabase.rpc("student_progress", { p_student_id: profile.id });

  return (
    <>
      <PageHeader title={`Hi, ${profile.full_name || "Student"}`} subtitle="Your assigned courses" />
      <ProgressCards rows={(data ?? []) as StudentProgress[]} hrefBase="/student/courses" />
    </>
  );
}
