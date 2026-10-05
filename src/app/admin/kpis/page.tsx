import Link from "next/link";
import { deleteKpi, saveKpi } from "@/app/admin/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Flash, Input, Label, PageHeader, Select, Table, Td, type FlashParams } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const METRICS: Record<string, string> = {
  completion_rate: "Lecture completion rate (%)",
  avg_quiz_score: "Average quiz score (%)",
  submission_rate: "Assignment submission rate (%)",
  enrolled_students: "Enrolled students (count)",
};

export default async function KpisPage({ searchParams }: { searchParams: Promise<FlashParams & { edit?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: kpis } = await supabase.from("kpi_definitions").select("*").order("created_at");
  const editing = kpis?.find((k) => k.id === params.edit);

  return (
    <>
      <PageHeader
        title="KPI configuration"
        subtitle="Thresholds checked against every published course. Breaches raise alerts and notify the professor."
      />
      <Flash params={params} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <Table head={["Name", "Metric", "Rule", "Enabled", ""]} empty={!kpis?.length}>
            {kpis?.map((k) => (
              <tr key={k.id}>
                <Td className="font-medium">{k.name}</Td>
                <Td>{METRICS[k.metric]}</Td>
                <Td>{k.comparison} {k.threshold}</Td>
                <Td><Badge value={k.enabled ? "active" : "inactive"}>{k.enabled ? "On" : "Off"}</Badge></Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={`/admin/kpis?edit=${k.id}`} className="text-sm text-primary hover:underline">Edit</Link>
                    <form action={deleteKpi}>
                      <input type="hidden" name="id" value={k.id} />
                      <SubmitButton size="sm" variant="ghost" confirm="Delete this KPI and its alerts?">Delete</SubmitButton>
                    </form>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card className="h-fit">
          <CardTitle action={editing && <Link href="/admin/kpis" className="text-sm text-primary hover:underline">Cancel</Link>}>
            {editing ? "Edit KPI" : "New KPI"}
          </CardTitle>
          <form action={saveKpi} className="space-y-3" key={editing?.id ?? "new"}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Label label="Name">
              <Input name="name" defaultValue={editing?.name} required />
            </Label>
            <Label label="Metric">
              <Select name="metric" defaultValue={editing?.metric ?? "completion_rate"}>
                {Object.entries(METRICS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Label label="Alert when">
                <Select name="comparison" defaultValue={editing?.comparison ?? "below"}>
                  <option value="below">Below</option>
                  <option value="above">Above</option>
                </Select>
              </Label>
              <Label label="Threshold">
                <Input name="threshold" type="number" step="any" defaultValue={editing?.threshold} required />
              </Label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={editing?.enabled ?? true} /> Enabled
            </label>
            <SubmitButton className="w-full">Save KPI</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
