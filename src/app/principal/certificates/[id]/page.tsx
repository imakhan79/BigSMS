import { notFound } from "next/navigation";
import { approveCertificateList, rejectCertificateList } from "@/app/principal/actions";
import { CertificateTrail, EntryFigures } from "@/components/CertificateList";
import { Alert, Badge, buttonClass, Card, CardTitle, Flash, type FlashParams, Label, PageHeader, Table, Td, Textarea, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { CERTIFICATE_ENTRY_SELECT, CERTIFICATE_LIST_SELECT, getCurrency, type CertificateEntryRow, type CertificateListRow } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";

export default async function PrincipalCertificateListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const [{ id }, flash] = await Promise.all([params, searchParams]);
  await requireRole("principal");
  const supabase = await createClient();
  const [{ data }, { data: entryData }, currency] = await Promise.all([
    supabase.from("certificate_lists").select(CERTIFICATE_LIST_SELECT).eq("id", id).neq("status", "draft").maybeSingle(),
    supabase.from("certificate_list_entries").select(CERTIFICATE_ENTRY_SELECT).eq("list_id", id).order("added_at"),
    getCurrency(supabase),
  ]);
  if (!data) notFound();
  const list = data as unknown as CertificateListRow;
  const entries = (entryData ?? []) as unknown as CertificateEntryRow[];
  const owing = entries.filter((e) => Number(e.outstanding_fees) > 0).length;

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href="/principal/certificates">← Certificate lists</TextLink>}
        title={list.title}
        subtitle={<>{list.list_no} · <span className="capitalize">{list.kind}</span> certificate · {list.course?.title ?? "Not tied to a course"}</>}
        action={<Badge value={list.status === "submitted" ? "pending_approval" : list.status}>{list.status === "submitted" ? "awaiting you" : list.status}</Badge>}
      />
      <Flash params={flash} />
      <div className="mb-6"><CertificateTrail list={list} /></div>
      {list.criteria && <Alert tone="info" title="Eligibility criteria" className="mb-6">{list.criteria}</Alert>}
      {list.review_note && list.status !== "submitted" && <Alert tone={list.status === "approved" ? "success" : "danger"} title="Your note" className="mb-6">{list.review_note}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardTitle description={`${entries.length} student${entries.length === 1 ? "" : "s"}${owing ? `, ${owing} with fees outstanding` : ""}`}>Students on the list</CardTitle>
          <Table head={["Student", "Final report", "Exam avg", "Completion", "Attendance", "Fees", "Note", "Certificate"]} empty={!entries.length}>
            {entries.map((e) => (
              <tr key={e.student_id}>
                <Td><p className="font-medium">{e.student?.full_name}</p><p className="font-mono text-xs text-muted-foreground">{e.student?.user_code}</p></Td>
                <EntryFigures entry={e} currency={currency} />
                <Td className="text-xs text-muted-foreground">{e.note || "—"}</Td>
                <Td className="font-mono text-xs">{e.certificate?.certificate_no ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        {list.status === "submitted" && (
          <Card>
            <CardTitle description="Approving issues a certificate to every student listed. Returning sends the list back to the Admin Manager.">Your decision</CardTitle>
            <form className="space-y-3">
              <input type="hidden" name="id" value={list.id} />
              <Label label="Note" hint="Required when returning the list."><Textarea name="review_note" className="min-h-20" /></Label>
              <div className="flex flex-wrap gap-2">
                <button formAction={approveCertificateList} className={buttonClass("success")}>Approve and issue</button>
                <button formAction={rejectCertificateList} className={buttonClass("danger")}>Return list</button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
