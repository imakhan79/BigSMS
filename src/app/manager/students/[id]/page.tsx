import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDocument, enrollStudents, issueInvoice, reviewDocument, saveStudentDetails, unenrollStudent, uploadDocument } from "@/app/manager/actions";
import { FeeModeFields, PersonFields } from "@/app/manager/_components";
import { INVOICE_SELECT, InvoiceTable, type InvoiceRow } from "@/app/manager/_fees";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Empty, Flash, type FlashParams, Input, Label, PageHeader, Select, Table, Tabs, Td, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getCurrency } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_TYPES, type Profile } from "@/lib/types";
import { formatDay, formatMoney, today } from "@/lib/utils";

const TABS = ["details", "documents", "fees", "courses", "certificates"] as const;

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FlashParams & { tab?: string }>;
}) {
  const [{ id }, flash] = await Promise.all([params, searchParams]);
  const tab = (TABS as readonly string[]).includes(flash.tab ?? "") ? flash.tab! : "details";
  await requireRole("admin_manager");
  const supabase = await createClient();

  const { data: student } = await supabase.from("profiles").select("*").eq("id", id).eq("role", "student").maybeSingle();
  if (!student) notFound();
  const s = student as Profile;
  const base = `/manager/students/${id}`;

  const [{ data: record }, { data: docs }, { data: invoices }, { data: enrollments }, { data: courses }, { data: certs }, { data: parents }, currency] = await Promise.all([
    supabase.from("student_records").select("*").eq("student_id", id).maybeSingle(),
    supabase.from("student_documents").select("*").eq("student_id", id).order("created_at", { ascending: false }),
    supabase.from("invoices").select(INVOICE_SELECT).eq("student_id", id).order("created_at", { ascending: false }),
    supabase.from("enrollments").select("course_id, enrolled_at, course:courses(title, status)").eq("student_id", id),
    supabase.from("courses").select("id, title").eq("status", "published").order("title"),
    supabase.from("certificates").select("id, certificate_no, title, kind, status, issued_on").eq("student_id", id).order("issued_on", { ascending: false }),
    supabase.from("parent_students").select("parent:profiles!parent_students_parent_id_fkey(full_name, email, phone)").eq("student_id", id),
    getCurrency(supabase),
  ]);
  const invoiceRows = (invoices ?? []) as unknown as InvoiceRow[];
  const balance = invoiceRows.filter((i) => i.status === "unpaid" || i.status === "partial").reduce((t, i) => t + Number(i.amount) - Number(i.amount_paid), 0);
  const enrolledIds = new Set((enrollments ?? []).map((e) => e.course_id));
  const signed = new Map<string, string>();
  if (tab === "documents" && docs?.length) {
    const { data } = await supabase.storage.from("student-documents").createSignedUrls(docs.map((d) => d.file_path), 60 * 10);
    data?.forEach((d) => d.path && d.signedUrl && signed.set(d.path, d.signedUrl));
  }

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href="/manager/students">← Students</TextLink>}
        title={s.full_name || s.email}
        subtitle={<>{s.user_code ?? "No ID yet"} · {s.email}{balance > 0 && <> · <span className="text-warning">{formatMoney(balance, currency)} outstanding</span></>}</>}
        action={<div className="flex items-center gap-2"><TextLink href={`/manager/students/${s.id}/id-card`}>ID card</TextLink><Badge value={s.status} /></div>}
      />
      <Flash params={flash} />
      <Tabs
        items={TABS.map((t) => ({
          href: `${base}?tab=${t}`,
          label: t[0].toUpperCase() + t.slice(1),
          active: tab === t,
          count: t === "documents" ? docs?.length : t === "fees" ? invoiceRows.length : t === "courses" ? enrollments?.length : t === "certificates" ? certs?.length : undefined,
        }))}
      />

      {tab === "details" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Card>
            <CardTitle>Student information</CardTitle>
            <form action={saveStudentDetails} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input type="hidden" name="id" value={s.id} />
              <Label label="Full name"><Input name="full_name" defaultValue={s.full_name} required /></Label>
              <Label label="Phone"><Input name="phone" defaultValue={s.phone} /></Label>
              <Label label="Class / section"><Input name="department" defaultValue={s.department} /></Label>
              <PersonFields values={record ?? {}} />
              <FeeModeFields values={record ?? {}} />
              <Label label="Admitted on"><Input name="admitted_on" type="date" defaultValue={record?.admitted_on ?? ""} /></Label>
              {s.status !== "offboarded" && (
                <Label label="Account status" hint="Offboarding is done by an Admin.">
                  <Select name="status" defaultValue={s.status}>
                    {["pending", "active", "inactive"].map((st) => <option key={st} value={st} className="capitalize">{st}</option>)}
                  </Select>
                </Label>
              )}
              <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>Save details</SubmitButton></div>
            </form>
          </Card>
          <Card>
            <CardTitle>Parents / guardians with accounts</CardTitle>
            {!parents?.length ? (
              <Empty compact>No parent account linked. An Admin links parent accounts.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {parents.map((p: any, i) => (
                  <li key={i}><p className="font-medium">{p.parent?.full_name}</p><p className="text-muted-foreground">{p.parent?.email} {p.parent?.phone && `· ${p.parent.phone}`}</p></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <>
          <Card className="mb-6">
            <CardTitle description="PDF, JPG, PNG or WebP, up to 10 MB.">Upload a document</CardTitle>
            <form action={uploadDocument} className="grid gap-3 sm:grid-cols-[200px_1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="student_id" value={s.id} />
              <Label label="Type">
                <Select name="doc_type">{Object.entries(DOCUMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              </Label>
              <Label label="Title (optional)"><Input name="title" /></Label>
              <Label label="File"><Input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="py-1.5" /></Label>
              <SubmitButton>Upload</SubmitButton>
            </form>
          </Card>
          <Card>
            <Table head={["Document", "Type", "Uploaded", "Status", "Verify"]} empty={!docs?.length}>
              {docs?.map((d) => (
                <tr key={d.id} className="align-top">
                  <Td>
                    {signed.get(d.file_path) ? <a href={signed.get(d.file_path)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{d.title}</a> : d.title}
                    <p className="text-xs text-muted-foreground">{d.file_name}</p>
                    {d.note && <p className="text-xs text-muted-foreground">Note: {d.note}</p>}
                  </Td>
                  <Td>{DOCUMENT_TYPES[d.doc_type] ?? d.doc_type}</Td>
                  <Td className="whitespace-nowrap">{formatDay(d.created_at)}</Td>
                  <Td><Badge value={d.status} /></Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <form action={reviewDocument} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="student_id" value={s.id} />
                        <Select name="status" defaultValue={d.status} className="h-8 w-28 text-xs" aria-label="Status">
                          <option value="pending">Pending</option>
                          <option value="verified">Verified</option>
                          <option value="rejected">Rejected</option>
                        </Select>
                        <Input name="note" defaultValue={d.note} placeholder="Note" className="h-8 w-36 text-xs" aria-label="Note" />
                        <SubmitButton size="sm" variant="outline">Save</SubmitButton>
                      </form>
                      <form action={deleteDocument}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="student_id" value={s.id} />
                        <SubmitButton size="sm" variant="ghost" confirm="Delete this document and its file?">Delete</SubmitButton>
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}

      {tab === "fees" && (
        <>
          <Card className="mb-6">
            <CardTitle>Issue an invoice</CardTitle>
            <form action={issueInvoice} className="grid gap-3 sm:grid-cols-[1fr_160px_170px_auto] sm:items-end">
              <input type="hidden" name="student_id" value={s.id} />
              <input type="hidden" name="back" value={`${base}?tab=fees`} />
              <Label label="Title"><Input name="title" required placeholder="e.g. Tuition fee, Term 1" /></Label>
              <Label label={`Amount (${currency})`}><Input name="amount" type="number" step="0.01" min="0.01" required /></Label>
              <Label label="Due on"><Input name="due_on" type="date" defaultValue={today()} required /></Label>
              <SubmitButton>Issue</SubmitButton>
            </form>
          </Card>
          <Card><InvoiceTable invoices={invoiceRows} currency={currency} back={`${base}?tab=fees`} showStudent={false} /></Card>
        </>
      )}

      {tab === "courses" && (
        <Card>
          <CardTitle>Enrolled courses</CardTitle>
          <form action={enrollStudents} className="mb-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="student_id" value={s.id} />
            <input type="hidden" name="back" value={`${base}?tab=courses`} />
            <Label label="Enrol in" className="min-w-64">
              <Select name="course_id" required>
                {courses?.filter((c) => !enrolledIds.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Label>
            <SubmitButton>Enrol</SubmitButton>
          </form>
          <Table head={["Course", "Status", "Enrolled", ""]} empty={!enrollments?.length}>
            {enrollments?.map((e: any) => (
              <tr key={e.course_id}>
                <Td className="font-medium">{e.course?.title}</Td>
                <Td><Badge value={e.course?.status ?? "—"} /></Td>
                <Td className="whitespace-nowrap">{formatDay(e.enrolled_at)}</Td>
                <Td className="text-right">
                  <form action={unenrollStudent}>
                    <input type="hidden" name="course_id" value={e.course_id} />
                    <input type="hidden" name="student_id" value={s.id} />
                    <input type="hidden" name="back" value={`${base}?tab=courses`} />
                    <SubmitButton size="sm" variant="outline" confirm="Remove the student from this course?">Remove</SubmitButton>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {tab === "certificates" && (
        <Card>
          <CardTitle description="Certificates are issued when the Principal approves a list you prepare." action={<TextLink href="/manager/certificates">Certificate lists</TextLink>}>
            Issued certificates
          </CardTitle>
          <Table head={["Certificate", "Type", "Issued", "Status"]} empty={!certs?.length}>
            {certs?.map((c) => (
              <tr key={c.id}>
                <Td><Link href={`/certificate/${c.id}`} className="font-medium hover:underline">{c.title}</Link><p className="font-mono text-xs text-muted-foreground">{c.certificate_no}</p></Td>
                <Td className="capitalize">{c.kind}</Td>
                <Td className="whitespace-nowrap">{formatDay(c.issued_on)}</Td>
                <Td><Badge value={c.status} /></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
