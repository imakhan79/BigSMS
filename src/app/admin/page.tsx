import Link from "next/link";
import { Badge, Card, CardTitle, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { CourseStat } from "@/lib/types";
import { formatDate, pct } from "@/lib/utils";

export default async function AdminDashboard() {
  const supabase = await createClient();
  const count = (table: string, filter?: (q: any) => any) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    return q.then((r: { count: number | null }) => r.count ?? 0);
  };

  const [students, professors, parents, pendingUsers, published, pendingCourses, openAlerts, stats, pendingList, alerts] = await Promise.all([
    count("profiles", (q) => q.eq("role", "student").eq("status", "active")),
    count("profiles", (q) => q.eq("role", "professor").eq("status", "active")),
    count("profiles", (q) => q.eq("role", "parent").eq("status", "active")),
    count("profiles", (q) => q.eq("status", "pending")),
    count("courses", (q) => q.eq("status", "published")),
    count("courses", (q) => q.eq("status", "pending_approval")),
    count("alerts", (q) => q.eq("status", "open")),
    supabase.rpc("course_stats").then((r) => (r.data ?? []) as CourseStat[]),
    supabase.from("courses").select("id, title, updated_at, profiles!courses_professor_id_fkey(full_name)").eq("status", "pending_approval").order("updated_at").limit(5),
    supabase.from("alerts").select("id, message, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(5),
  ]);

  const live = stats.filter((s) => s.status === "published");
  const avg = (key: keyof CourseStat) => (live.length ? live.reduce((t, s) => t + Number(s[key]), 0) / live.length : null);

  return (
    <>
      <PageHeader title="Admin dashboard" subtitle="System overview and items needing attention" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Active students" value={students} />
        <Stat label="Active professors" value={professors} />
        <Stat label="Active parents" value={parents} />
        <Stat label="Published courses" value={published} />
        <Link href="/admin/users?status=pending"><Stat label="Accounts to activate" value={pendingUsers} /></Link>
        <Link href="/admin/courses"><Stat label="Courses to approve" value={pendingCourses} /></Link>
        <Link href="/admin/alerts"><Stat label="Open KPI alerts" value={openAlerts} /></Link>
        <Stat label="Avg completion" value={pct(avg("completion_rate"))} hint="across published courses" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle action={<Link href="/admin/courses" className="text-sm text-primary hover:underline">Review all</Link>}>
            Awaiting approval
          </CardTitle>
          {!pendingList.data?.length ? (
            <Empty>No courses waiting for approval.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {pendingList.data.map((c: any) => (
                <li key={c.id} className="flex justify-between py-2 text-sm">
                  <span>{c.title} <span className="text-muted-foreground">· {c.profiles?.full_name}</span></span>
                  <span className="text-muted-foreground">{formatDate(c.updated_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle action={<Link href="/admin/alerts" className="text-sm text-primary hover:underline">Manage</Link>}>Open alerts</CardTitle>
          {!alerts.data?.length ? (
            <Empty>No open alerts.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {alerts.data.map((a) => (
                <li key={a.id} className="py-2 text-sm">{a.message}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardTitle action={<Link href="/admin/reports" className="text-sm text-primary hover:underline">Full report</Link>}>Course performance</CardTitle>
        <Table head={["Course", "Professor", "Status", "Students", "Completion", "Quiz avg", "Submissions"]} empty={!stats.length}>
          {stats.slice(0, 8).map((s) => (
            <tr key={s.course_id}>
              <Td className="font-medium">{s.title}</Td>
              <Td>{s.professor_name}</Td>
              <Td><Badge value={s.status} /></Td>
              <Td>{s.enrolled}</Td>
              <Td>{pct(s.completion_rate)}</Td>
              <Td>{pct(s.avg_quiz_score)}</Td>
              <Td>{pct(s.submission_rate)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
