import { CertificateListsTable } from "@/components/CertificateList";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { CERTIFICATE_LIST_SELECT, type CertificateListRow } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";

export default async function PrincipalCertificatesPage() {
  await requireRole("principal");
  const supabase = await createClient();
  const { data } = await supabase.from("certificate_lists").select(CERTIFICATE_LIST_SELECT).neq("status", "draft").order("updated_at", { ascending: false });
  const lists = (data ?? []) as unknown as CertificateListRow[];
  const waiting = lists.filter((l) => l.status === "submitted");

  return (
    <>
      <PageHeader title="Certificate lists" subtitle="Prepared by Admin Manager → Approved by Principal. Approving a list issues a certificate to every student on it." />
      <Card className="mb-6">
        <CardTitle description={`${waiting.length} waiting for you`}>Awaiting your approval</CardTitle>
        <CertificateListsTable lists={waiting} hrefBase="/principal/certificates" />
      </Card>
      <Card>
        <CardTitle>Decided</CardTitle>
        <CertificateListsTable lists={lists.filter((l) => l.status !== "submitted")} hrefBase="/principal/certificates" />
      </Card>
    </>
  );
}
