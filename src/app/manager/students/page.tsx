import Link from "next/link";
import { createStudent } from "@/app/manager/actions";
import { CsvButton } from "@/components/CsvButton";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, Filters, Flash, type FlashParams, Input, Label, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { formatDay } from "@/lib/utils";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<FlashParams & { status?: string; q?: string }> }) {
  const params = await searchParams;
  await requireRole("admin_manager");
  const supabase = await createClient();
  let query = supabase.from("profiles").select("*").eq("role", "student").order("full_name");
  if (params.status) query = query.eq("status", params.status);
  const q = (params.q ?? "").replace(/[,()%*]/g, "").trim();
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,user_code.ilike.%${q}%`);
  const { data } = await query;
  const students = (data ?? []) as Profile[];

  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Student information, documents, fees, courses and certificates"
        action={<CsvButton filename="students.csv" rows={students.map((s) => ({ id: s.user_code, name: s.full_name, email: s.email, phone: s.phone, programme: s.department, status: s.status }))} />}
      />
      <Flash params={params} />
      <Card className="mb-6">
        <details>
          <summary className="cursor-pointer select-none text-[15px] font-semibold">Add a student directly</summary>
          <p className="mt-2 text-sm text-muted-foreground">For admissions use Applications. The account is active straight away with a temporary password.</p>
          <form action={createStudent} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Label label="Full name"><Input name="full_name" required /></Label>
            <Label label="Email"><Input name="email" type="email" required /></Label>
            <Label label="Temporary password"><Input name="password" minLength={8} autoComplete="off" required /></Label>
            <Label label="Phone"><Input name="phone" type="tel" /></Label>
            <Label label="Programme / class"><Input name="department" /></Label>
            <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>Create student</SubmitButton></div>
          </form>
        </details>
      </Card>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <form>
          {params.status && <input type="hidden" name="status" value={params.status} />}
          <Input name="q" defaultValue={params.q} placeholder="Search name, email or ID" className="w-64" aria-label="Search students" />
        </form>
        <Filters
          label="Status"
          items={[undefined, "active", "pending", "inactive", "offboarded"].map((s) => ({ href: s ? `/manager/students?status=${s}` : "/manager/students", label: s ?? "Any", active: params.status === s }))}
        />
      </div>
      <Card>
        <Table head={["User ID", "Name", "Email", "Phone", "Programme", "Status", "Joined"]} empty={!students.length}>
          {students.map((s) => (
            <tr key={s.id}>
              <Td className="whitespace-nowrap font-mono text-xs">{s.user_code ?? "—"}</Td>
              <Td className="font-medium"><Link href={`/manager/students/${s.id}`} className="hover:underline">{s.full_name || "—"}</Link></Td>
              <Td>{s.email}</Td>
              <Td>{s.phone || "—"}</Td>
              <Td>{s.department || "—"}</Td>
              <Td><Badge value={s.status} /></Td>
              <Td className="whitespace-nowrap">{formatDay(s.created_at)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
