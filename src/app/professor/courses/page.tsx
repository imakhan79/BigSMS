import Link from "next/link";
import { createCourse } from "@/app/professor/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Empty, Flash, Input, Label, PageHeader, Select, Textarea, type FlashParams } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export default async function ProfessorCourses({ searchParams }: { searchParams: Promise<FlashParams & { status?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole("professor");
  const supabase = await createClient();

  let query = supabase
    .from("courses")
    .select("id, title, description, status, review_note, updated_at, course_categories(name), enrollments(count)")
    .eq("professor_id", profile.id)
    .order("updated_at", { ascending: false });
  if (params.status) query = query.eq("status", params.status);
  const [{ data: courses }, { data: categories }] = await Promise.all([
    query,
    supabase.from("course_categories").select("id, name").order("name"),
  ]);

  return (
    <>
      <PageHeader title="My courses" subtitle="Create, edit, submit for approval and archive your courses" />
      <Flash params={params} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            {[undefined, "draft", "pending_approval", "published", "rejected", "archived"].map((s) => (
              <Link
                key={s ?? "all"}
                href={s ? `/professor/courses?status=${s}` : "/professor/courses"}
                className={cn("rounded-full border px-3 py-1 capitalize", params.status === s && "bg-primary text-primary-foreground")}
              >
                {s?.replace("_", " ") ?? "All"}
              </Link>
            ))}
          </div>
          {!courses?.length ? (
            <Empty>No courses yet. Create your first course.</Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {courses.map((c: any) => (
                <Link key={c.id} href={`/professor/courses/${c.id}`}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-primary">{c.title}</h3>
                      <Badge value={c.status} />
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{c.description || "No description"}</p>
                    {c.status === "rejected" && c.review_note && (
                      <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">Admin: {c.review_note}</p>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      {c.course_categories?.name ?? "Uncategorised"} · {c.enrollments?.[0]?.count ?? 0} students · {formatDate(c.updated_at)}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
        <Card className="h-fit">
          <CardTitle>New course</CardTitle>
          <form action={createCourse} className="space-y-3">
            <Label label="Title"><Input name="title" required /></Label>
            <Label label="Description"><Textarea name="description" /></Label>
            <Label label="Category">
              <Select name="category_id">
                <option value="">Uncategorised</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Label>
            <SubmitButton className="w-full">Create draft</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
