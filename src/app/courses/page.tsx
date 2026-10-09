import Link from "next/link";
import { Plus } from "lucide-react";
import { CourseStageBadge } from "@/components/CourseManagement";
import { Card, CardTitle, Empty, Filters, Flash, type FlashParams, Input, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { COURSE_STAGES, filterStage, formatDuration, STAGE_LABEL } from "@/lib/courses";
import { getCurrency } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import type { Course } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/utils";

type Row = Course & { category: { name: string } | null; faculty: { full_name: string } | null; enrollments: { count: number }[] };

const SELECT =
  "*, category:course_categories(name), faculty:profiles!courses_professor_id_fkey(full_name), enrollments(count)";

export default async function CoursesPage({ searchParams }: { searchParams: Promise<FlashParams & { stage?: string; q?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole("principal", "admin_manager", "admin");
  const manages = profile.role === "principal" || profile.role === "admin_manager";
  const supabase = await createClient();

  let query = supabase.from("courses").select(SELECT).order("updated_at", { ascending: false });
  query = filterStage(query, params.stage);
  const q = params.q?.trim();
  if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, "")}%,code.ilike.%${q.replace(/[%,()]/g, "")}%`);

  const [{ data }, { data: readyData }, currency] = await Promise.all([
    query,
    supabase.from("courses").select(SELECT).not("ready_at", "is", null).order("ready_at"),
    getCurrency(supabase),
  ]);
  const courses = (data ?? []) as Row[];
  const ready = (readyData ?? []) as Row[];
  const href = (stage?: string) => `/courses${stage ? `?stage=${stage}` : ""}`;

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle={manages
          ? "Create, edit, publish and archive courses. Faculty can create and edit; only the Principal or Admin Manager publish or archive."
          : "All courses. Managed by the Principal, Admin Manager and Faculty."}
        action={manages && <LinkButton href="/courses/new"><Plus size={16} /> New course</LinkButton>}
      />
      <Flash params={params} />

      {manages && !!ready.length && (
        <Card className="mb-6 border-accent">
          <CardTitle description="Marked ready by Faculty">Waiting to be published ({ready.length})</CardTitle>
          <ul className="divide-y divide-border text-sm">
            {ready.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/courses/${c.id}`} className="font-medium hover:underline">
                  <span className="font-mono text-xs text-muted-foreground">{c.code}</span> {c.title}
                </Link>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  {c.faculty?.full_name} · {formatDate(c.ready_at)}
                  <CourseStageBadge course={{ ...c, ready_at: null }} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Filters
            items={[undefined, ...COURSE_STAGES, "ready"].map((s) => ({
              href: href(s),
              label: s ? (s === "ready" ? "Ready to publish" : STAGE_LABEL[s as keyof typeof STAGE_LABEL]) : "All",
              active: params.stage === s,
            }))}
          />
          <form className="flex gap-2">
            {params.stage && <input type="hidden" name="stage" value={params.stage} />}
            <Input name="q" defaultValue={q} placeholder="Search name or Course ID" className="w-60" aria-label="Search courses" />
          </form>
        </div>
        {!courses.length ? (
          <Empty title="No courses found">{manages ? "Create a course, or change the filter." : "Change the filter to see more."}</Empty>
        ) : (
          <Table head={["Course ID", "Course", "Faculty", "Duration", "Fee", "Students", "Stage", "Updated"]}>
            {courses.map((c) => (
              <tr key={c.id}>
                <Td className="whitespace-nowrap font-mono text-xs">{c.code}</Td>
                <Td className="font-medium">
                  <Link href={`/courses/${c.id}`} className="hover:underline">{c.title}</Link>
                  <p className="text-xs font-normal text-muted-foreground">{c.category?.name ?? "Uncategorised"}</p>
                </Td>
                <Td>{c.faculty?.full_name ?? "—"}</Td>
                <Td className="whitespace-nowrap">{formatDuration(c.duration_value, c.duration_unit)}</Td>
                <Td className="whitespace-nowrap">{c.fee == null ? "—" : formatMoney(c.fee, currency)}</Td>
                <Td>{c.enrollments?.[0]?.count ?? 0}</Td>
                <Td><CourseStageBadge course={c} /></Td>
                <Td className="whitespace-nowrap">{formatDate(c.updated_at)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
