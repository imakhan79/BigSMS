import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** The parent's linked children. Each opens to what that child sees as a student. */
export default async function ParentHome() {
  const profile = await requireRole("parent");
  const supabase = await createClient();
  const { data: links } = await supabase
    .from("parent_students")
    .select("student:profiles!parent_students_student_id_fkey(id, full_name, user_code, status)")
    .eq("parent_id", profile.id);
  const children = (links ?? [])
    .map((l) => l.student as unknown as { id: string; full_name: string; user_code: string | null; status: string } | null)
    .filter((c): c is NonNullable<typeof c> => !!c && c.status === "active");

  return (
    <>
      <PageHeader title={`Welcome, ${profile.full_name || "Parent"}`} subtitle="You see what your children see in their student portal. Contact the institute to link another child." />
      {!children.length ? (
        <Empty icon={<GraduationCap size={18} />} title="No children linked">The institute links your account to your children.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((c) => (
            <Link key={c.id} href={`/parent/children/${c.id}`} className="group block">
              <Card className="transition-colors group-hover:border-foreground/20 group-hover:bg-secondary/40">
                <p className="font-semibold text-primary">{c.full_name}</p>
                <p className="font-mono text-xs text-muted-foreground">{c.user_code}</p>
                <p className="mt-3 text-sm text-primary">Courses, timetable, attendance, assignments, exams, fees →</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
