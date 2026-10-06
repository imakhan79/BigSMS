import Link from "next/link";
import { recordApplication } from "@/app/manager/actions";
import { PersonFields } from "@/app/manager/_components";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, Filters, Flash, type FlashParams, Input, Label, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

const STATUSES = ["open", "submitted", "under_review", "accepted", "rejected"] as const;

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<FlashParams & { status?: string }> }) {
  const params = await searchParams;
  await requireRole("admin_manager");
  const supabase = await createClient();
  const status = params.status ?? "open";
  let query = supabase.from("student_applications").select("id, application_no, full_name, email, program, source, status, created_at").order("created_at", { ascending: false });
  query = status === "open" ? query.in("status", ["submitted", "under_review"]) : status === "all" ? query : query.eq("status", status);
  const { data: apps } = await query;

  return (
    <>
      <PageHeader title="Student applications" subtitle="Online applications arrive here; record walk-in applications below. Accepting one creates the student account." />
      <Flash params={params} />
      <Card className="mb-6">
        <details>
          <summary className="cursor-pointer select-none text-[15px] font-semibold">Record a walk-in application</summary>
          <form action={recordApplication} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Label label="Applicant full name"><Input name="full_name" required /></Label>
            <Label label="Email"><Input name="email" type="email" required /></Label>
            <Label label="Phone"><Input name="phone" type="tel" /></Label>
            <PersonFields withStatement />
            <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>Record application</SubmitButton></div>
          </form>
        </details>
      </Card>
      <div className="mb-4">
        <Filters label="Status" items={[...STATUSES, "all"].map((s) => ({ href: `/manager/applications?status=${s}`, label: s.replace("_", " "), active: status === s }))} />
      </div>
      <Card>
        <Table head={["Application", "Applicant", "Programme", "Source", "Status", "Received"]} empty={!apps?.length}>
          {apps?.map((a) => (
            <tr key={a.id}>
              <Td className="whitespace-nowrap font-mono text-xs"><Link href={`/manager/applications/${a.id}`} className="hover:underline">{a.application_no}</Link></Td>
              <Td><Link href={`/manager/applications/${a.id}`} className="font-medium hover:underline">{a.full_name}</Link><p className="text-xs text-muted-foreground">{a.email}</p></Td>
              <Td>{a.program || "—"}</Td>
              <Td className="capitalize">{a.source}</Td>
              <Td><Badge value={a.status} /></Td>
              <Td className="whitespace-nowrap">{formatDate(a.created_at)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
