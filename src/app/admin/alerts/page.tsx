import Link from "next/link";
import { evaluateKpis, updateAlert } from "@/app/admin/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, Flash, PageHeader, Table, Td, type FlashParams } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<FlashParams & { status?: string }> }) {
  const params = await searchParams;
  const status = params.status ?? "open";
  const supabase = await createClient();
  let query = supabase
    .from("alerts")
    .select("*, kpi_definitions(name), courses(id, title)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") query = query.eq("status", status);
  const { data: alerts } = await query;

  return (
    <>
      <PageHeader
        title="Alert management"
        subtitle="KPI breaches across published courses"
        action={
          <form action={evaluateKpis}>
            <SubmitButton variant="accent">Run KPI check now</SubmitButton>
          </form>
        }
      />
      <Flash params={params} />
      <div className="mb-4 flex gap-2 text-sm">
        {["open", "acknowledged", "resolved", "all"].map((s) => (
          <Link key={s} href={`/admin/alerts?status=${s}`} className={cn("rounded-full border px-3 py-1 capitalize", status === s && "bg-primary text-primary-foreground")}>
            {s}
          </Link>
        ))}
      </div>
      <Card>
        <Table head={["Raised", "KPI", "Course", "Value", "Status", ""]} empty={!alerts?.length}>
          {alerts?.map((a: any) => (
            <tr key={a.id}>
              <Td className="whitespace-nowrap">{formatDate(a.created_at)}</Td>
              <Td>{a.kpi_definitions?.name}</Td>
              <Td><Link href={`/admin/courses/${a.courses?.id}`} className="hover:underline">{a.courses?.title}</Link></Td>
              <Td>{Number(a.value).toFixed(1)}</Td>
              <Td><Badge value={a.status} /></Td>
              <Td>
                <div className="flex justify-end gap-2">
                  {a.status === "open" && (
                    <form action={updateAlert}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value="acknowledged" />
                      <SubmitButton size="sm" variant="outline">Acknowledge</SubmitButton>
                    </form>
                  )}
                  {a.status !== "resolved" && (
                    <form action={updateAlert}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value="resolved" />
                      <SubmitButton size="sm">Resolve</SubmitButton>
                    </form>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
