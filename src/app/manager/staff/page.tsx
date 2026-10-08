import { CsvButton } from "@/components/CsvButton";
import { Badge, Card, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/utils";

/** Staff details (read-only). */
export default async function StaffPage() {
  await requireRole("admin_manager");
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, user_code, full_name, email, phone, department, status, onboarded_at")
    .eq("role", "staff")
    .order("full_name");

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Staff details (read-only). Accounts are managed by an Admin."
        action={<CsvButton filename="staff.csv" rows={(staff ?? []).map((f) => ({ id: f.user_code, name: f.full_name, email: f.email, phone: f.phone, department: f.department, status: f.status }))} />}
      />
      <Card>
        <Table head={["User ID", "Name", "Department", "Email", "Phone", "Status", "Onboarded"]} empty={!staff?.length}>
          {staff?.map((f) => (
            <tr key={f.id}>
              <Td className="whitespace-nowrap font-mono text-xs">{f.user_code ?? "—"}</Td>
              <Td className="font-medium">{f.full_name || "—"}</Td>
              <Td>{f.department || "—"}</Td>
              <Td>{f.email}</Td>
              <Td>{f.phone || "—"}</Td>
              <Td><Badge value={f.status} /></Td>
              <Td className="whitespace-nowrap">{formatDay(f.onboarded_at)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
