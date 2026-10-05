import Link from "next/link";
import { Card, PageHeader, Table, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 50;

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<{ page?: string; table?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (params.table) query = query.eq("table_name", params.table);

  const [{ data: logs, count }, { data: actors }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const actorName = (id: string | null) => {
    if (!id) return "System";
    const a = actors?.find((p) => p.id === id);
    return a ? a.full_name || a.email : id.slice(0, 8);
  };
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const link = (p: number) => `/admin/audit-logs?${new URLSearchParams({ page: String(p), ...(params.table && { table: params.table }) })}`;

  return (
    <>
      <PageHeader title="Audit logs" subtitle={`${count ?? 0} recorded changes`} />
      <form className="mb-4 flex gap-2">
        <select name="table" defaultValue={params.table ?? ""} className="h-10 rounded-md border border-border bg-background px-3 text-sm" aria-label="Table">
          <option value="">All tables</option>
          {["profiles", "parent_students", "course_categories", "courses", "enrollments", "kpi_definitions", "alerts", "system_settings"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button className="h-10 rounded-md border border-border px-4 text-sm">Filter</button>
      </form>
      <Card>
        <Table head={["When", "Who", "Action", "Table", "Record", "Changes"]} empty={!logs?.length}>
          {logs?.map((l) => {
            const changed =
              l.action === "UPDATE" && l.old_data && l.new_data
                ? Object.keys(l.new_data).filter((k) => k !== "updated_at" && JSON.stringify(l.new_data[k]) !== JSON.stringify(l.old_data[k]))
                : [];
            return (
              <tr key={l.id}>
                <Td className="whitespace-nowrap">{formatDate(l.created_at)}</Td>
                <Td>{actorName(l.actor_id)}</Td>
                <Td>{l.action}</Td>
                <Td>{l.table_name}</Td>
                <Td className="font-mono text-xs">{String(l.record_id ?? "").slice(0, 20)}</Td>
                <Td className="text-xs">
                  {changed.length
                    ? changed.map((k) => (
                        <div key={k}>
                          <span className="font-medium">{k}</span>: {JSON.stringify(l.old_data[k])} → {JSON.stringify(l.new_data[k])}
                        </div>
                      ))
                    : "—"}
                </Td>
              </tr>
            );
          })}
        </Table>
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={link(page - 1)} className="text-primary hover:underline">← Newer</Link> : <span />}
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          {page < pages ? <Link href={link(page + 1)} className="text-primary hover:underline">Older →</Link> : <span />}
        </div>
      </Card>
    </>
  );
}
