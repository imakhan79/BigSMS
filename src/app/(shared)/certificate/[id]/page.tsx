import { notFound } from "next/navigation";
import { BRAND, Crest } from "@/components/Brand";
import { Alert } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/utils";

/** A certificate as issued. Row Level Security decides who may open it. */
export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole();
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("certificates")
    .select("certificate_no, title, kind, description, status, issued_on, revoke_reason, student:profiles!certificates_student_id_fkey(full_name), issuer:profiles!certificates_issued_by_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const cert = c as any;

  return (
    <div className="mx-auto max-w-3xl">
      {cert.status === "revoked" && <Alert tone="danger" title="This certificate has been revoked" className="mb-4">{cert.revoke_reason}</Alert>}
      <div className="rounded-lg border-4 border-double border-gold bg-surface p-10 text-center shadow-xs">
        <Crest className="mx-auto h-24" />
        <p className="mt-3 text-sm uppercase tracking-[0.2em] text-muted-foreground">{BRAND.name}</p>
        <h1 className="mt-6 font-display text-4xl font-semibold capitalize text-primary">Certificate of {cert.kind}</h1>
        <p className="mt-6 text-sm text-muted-foreground">This is to certify that</p>
        <p className="mt-2 font-display text-3xl font-semibold">{cert.student?.full_name}</p>
        <p className="mt-4 text-sm text-muted-foreground">has been awarded this certificate for</p>
        <p className="mt-1 text-xl font-semibold">{cert.title}</p>
        {cert.description && <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">{cert.description}</p>}
        <div className="mt-10 flex flex-wrap justify-between gap-4 text-left text-sm">
          <div><p className="text-muted-foreground">Issued</p><p className="font-medium">{formatDay(cert.issued_on)}</p></div>
          <div><p className="text-muted-foreground">Approved by</p><p className="font-medium">{cert.issuer?.full_name ?? "—"}, Principal</p></div>
          <div><p className="text-muted-foreground">Certificate no.</p><p className="font-mono font-medium">{cert.certificate_no}</p></div>
        </div>
      </div>
    </div>
  );
}
