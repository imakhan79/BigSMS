import { CsvButton } from "@/components/CsvButton";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/utils";

/** Faculty details (read-only). */
export default async function FacultyPage() {
  await requireRole("admin_manager");
  const supabase = await createClient();
  const [{ data: faculty }, { data: courses }] = await Promise.all([
    supabase.from("profiles").select("id, user_code, full_name, email, phone, department, status, onboarded_at").eq("role", "professor").order("full_name"),
    supabase.from("courses").select("professor_id, status"),
  ]);
  const count = (id: string) => (courses ?? []).filter((c) => c.professor_id === id && c.status === "published").length;

  return (
    <>
      <PageHeader
        title="Faculty"
        subtitle="Faculty details (read-only). Accounts are managed by an Admin."
        action={<CsvButton filename="faculty.csv" rows={(faculty ?? []).map((f) => ({ id: f.user_code, name: f.full_name, email: f.email, phone: f.phone, department: f.department, status: f.status }))} />}
      />
      <Card>
        <Table head={["User ID", "Name", "Department", "Email", "Phone", "Published courses", "Status", "Onboarded"]} empty={!faculty?.length}>
          {faculty?.map((f) => (
            <tr key={f.id}>
              <Td className="whitespace-nowrap font-mono text-xs">{f.user_code ?? "—"}</Td>
              <Td className="font-medium">{f.full_name || "—"}</Td>
              <Td>{f.department || "—"}</Td>
              <Td>{f.email}</Td>
              <Td>{f.phone || "—"}</Td>
              <Td>{count(f.id)}</Td>
              <Td><Badge value={f.status} /></Td>
              <Td className="whitespace-nowrap">{formatDay(f.onboarded_at)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
