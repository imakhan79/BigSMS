import Link from "next/link";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

/** Read-only view of KPI alerts. Admins acknowledge and resolve them. */
export default async function PrincipalAlertsPage() {
  const supabase = await createClient();
  const { data: alerts } = await supabase
    .from("alerts")
    .select("*, kpi_definitions(name), courses(id, title)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <>
      <PageHeader title="KPI alerts" subtitle="Courses that have crossed a KPI threshold" />
      <Card>
        <Table head={["Raised", "KPI", "Course", "Value", "Status"]} empty={!alerts?.length}>
          {alerts?.map((a: any) => (
            <tr key={a.id}>
              <Td className="whitespace-nowrap">{formatDate(a.created_at)}</Td>
              <Td>{a.kpi_definitions?.name}</Td>
              <Td><Link href={`/courses/${a.courses?.id}`} className="hover:underline">{a.courses?.title}</Link></Td>
              <Td>{Number(a.value).toFixed(1)}</Td>
              <Td><Badge value={a.status} /></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
