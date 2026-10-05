import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ParentDashboard() {
  const profile = await requireRole("parent");
  const supabase = await createClient();
  const { data: links } = await supabase
    .from("parent_students")
    .select("student:profiles!parent_students_student_id_fkey(id, full_name, email)")
    .eq("parent_id", profile.id);
  const children = (links ?? []).map((l: any) => l.student).filter(Boolean);

  return (
    <>
      <PageHeader title="My children" subtitle="Courses, progress and grades your children can see" />
      {!children.length ? (
        <Empty>No students are linked to your account yet. Ask the school administrator to link your child.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((c: any) => (
            <Link key={c.id} href={`/parent/children/${c.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <h3 className="font-semibold text-primary">{c.full_name || c.email}</h3>
                <p className="text-sm text-muted-foreground">{c.email}</p>
                <p className="mt-3 text-sm text-primary">View progress →</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
