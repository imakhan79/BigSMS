import Link from "next/link";
import { Badge, Card, CardTitle, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { describeValue, RESULT_CHANGE_SELECT, RESULT_KIND_LABEL, type ResultChange } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/utils";

type Row = ResultChange & { student: { full_name: string; user_code: string | null } | null; requester: { full_name: string } | null };

export default async function PrincipalChangesPage() {
  await requireRole("principal");
  const supabase = await createClient();
  const { data } = await supabase.from("result_changes").select(RESULT_CHANGE_SELECT).neq("status", "withdrawn").order("requested_at", { ascending: false }).limit(200);
  const changes = (data ?? []) as unknown as Row[];
  const waiting = changes.filter((c) => c.status === "pending");

  const table = (rows: Row[]) => (
    <Table head={["Request", "Student", "Current → requested", "Requested by", "Status"]} empty={!rows.length}>
      {rows.map((c) => (
        <tr key={c.id}>
          <Td>
            <Link href={`/principal/changes/${c.id}`} className="font-medium hover:underline">{RESULT_KIND_LABEL[c.kind]}: {c.label}</Link>
            <p className="text-xs text-muted-foreground">{c.course?.title} · <span className="font-mono">{c.change_no}</span></p>
          </Td>
          <Td><p className="font-medium">{c.student?.full_name}</p><p className="font-mono text-xs text-muted-foreground">{c.student?.user_code}</p></Td>
          <Td className="text-xs">
            <span className="text-muted-foreground line-through">{describeValue(c.kind, c.old_value)}</span>
            <br />
            <span className="font-medium">{describeValue(c.kind, c.new_value)}</span>
          </Td>
          <Td className="text-xs">{c.requester?.full_name ?? "—"}<p className="text-muted-foreground">{timeAgo(c.requested_at)}</p></Td>
          <Td><Badge value={c.status === "pending" ? "pending_approval" : c.status}>{c.status === "pending" ? "awaiting you" : c.status}</Badge></Td>
        </tr>
      ))}
    </Table>
  );

  return (
    <>
      <PageHeader title="Result changes" subtitle="Faculty request changes to submitted attendance, marks, grades and final reports. A change takes effect only when you approve it." />
      <Card className="mb-6">
        <CardTitle description={`${waiting.length} waiting for you`}>Awaiting your approval</CardTitle>
        {table(waiting)}
      </Card>
      <Card>
        <CardTitle>Decided</CardTitle>
        {table(changes.filter((c) => c.status !== "pending"))}
      </Card>
    </>
  );
}
