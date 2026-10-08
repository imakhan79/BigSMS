import { notFound } from "next/navigation";
import {
  addListStudents,
  deleteCertificateList,
  removeListStudent,
  submitCertificateList,
  updateCertificateList,
  withdrawCertificateList,
} from "@/app/manager/actions";
import { CertificateTrail, EntryFigures } from "@/components/CertificateList";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, Card, CardTitle, Empty, Flash, type FlashParams, Input, Label, PageHeader, Select, Table, Td, Textarea, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { CERTIFICATE_ENTRY_SELECT, CERTIFICATE_LIST_SELECT, getCurrency, type CertificateEntryRow, type CertificateListRow } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import { CERTIFICATE_KINDS } from "@/lib/types";
import { formatMoney, pct } from "@/lib/utils";

interface Candidate {
  student_id: string;
  full_name: string;
  user_code: string | null;
  completion_rate: number | null;
  quiz_avg: number | null;
  assignment_avg: number | null;
  attendance_rate: number | null;
  outstanding_fees: number;
  has_certificate: boolean;
}

export default async function CertificateListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const [{ id }, flash] = await Promise.all([params, searchParams]);
  await requireRole("admin_manager");
  const supabase = await createClient();
  const { data } = await supabase.from("certificate_lists").select(CERTIFICATE_LIST_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const list = data as unknown as CertificateListRow;
  const editable = list.status === "draft" || list.status === "rejected";

  const [{ data: entryData }, currency, candidates, { data: students }] = await Promise.all([
    supabase.from("certificate_list_entries").select(CERTIFICATE_ENTRY_SELECT).eq("list_id", id).order("added_at"),
    getCurrency(supabase),
    editable && list.course_id ? supabase.rpc("certificate_candidates", { p_course_id: list.course_id }).then((r) => (r.data ?? []) as Candidate[]) : Promise.resolve([] as Candidate[]),
    editable && !list.course_id ? supabase.from("profiles").select("id, full_name, user_code").eq("role", "student").eq("status", "active").order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const entries = (entryData ?? []) as unknown as CertificateEntryRow[];
  const onList = new Set(entries.map((e) => e.student_id));
  const addable = candidates.filter((c) => !onList.has(c.student_id) && !c.has_certificate);

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href="/manager/certificates">← Certificate lists</TextLink>}
        title={list.title}
        subtitle={<>{list.list_no} · <span className="capitalize">{list.kind}</span> certificate · {list.course?.title ?? "Not tied to a course"}</>}
        action={<Badge value={list.status === "submitted" ? "pending_approval" : list.status}>{list.status === "submitted" ? "awaiting principal" : list.status}</Badge>}
      />
      <Flash params={flash} />
      <div className="mb-6"><CertificateTrail list={list} /></div>
      {list.status === "rejected" && (
        <Alert tone="danger" title="Returned by the Principal" className="mb-6">{list.review_note} Make the changes and submit the list again.</Alert>
      )}
      {list.status === "approved" && (
        <Alert tone="success" title="Approved. Certificates have been issued." className="mb-6">{list.review_note}</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardTitle description={`${entries.length} student${entries.length === 1 ? "" : "s"}. Figures are recalculated when the list is submitted.`}>Eligible students</CardTitle>
            <Table head={["Student", "Completion", "Attendance", "Fees", "Note", editable ? "" : "Certificate"]} empty={!entries.length}>
              {entries.map((e) => (
                <tr key={e.student_id}>
                  <Td><p className="font-medium">{e.student?.full_name}</p><p className="font-mono text-xs text-muted-foreground">{e.student?.user_code}</p></Td>
                  <EntryFigures entry={e} currency={currency} />
                  <Td className="text-xs text-muted-foreground">{e.note || "—"}</Td>
                  <Td className="text-right">
                    {editable ? (
                      <form action={removeListStudent}>
                        <input type="hidden" name="list_id" value={list.id} />
                        <input type="hidden" name="student_id" value={e.student_id} />
                        <SubmitButton size="sm" variant="ghost">Remove</SubmitButton>
                      </form>
                    ) : e.certificate ? (
                      <span className="font-mono text-xs">{e.certificate.certificate_no}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>

          {editable && list.course_id && (
            <Card>
              <CardTitle description="Students enrolled in the course who do not already hold this certificate.">Add from the course</CardTitle>
              {!addable.length ? (
                <Empty compact>No more students to add.</Empty>
              ) : (
                <form action={addListStudents} className="space-y-3">
                  <input type="hidden" name="list_id" value={list.id} />
                  <Table head={["", "Student", "Completion", "Quiz avg", "Assignments", "Attendance", "Fees due"]}>
                    {addable.map((c) => (
                      <tr key={c.student_id}>
                        <Td><input type="checkbox" name="student_id" value={c.student_id} aria-label={`Add ${c.full_name}`} className="accent-primary" /></Td>
                        <Td><p className="font-medium">{c.full_name}</p><p className="font-mono text-xs text-muted-foreground">{c.user_code}</p></Td>
                        <Td>{pct(c.completion_rate)}</Td>
                        <Td>{pct(c.quiz_avg)}</Td>
                        <Td>{pct(c.assignment_avg)}</Td>
                        <Td>{pct(c.attendance_rate)}</Td>
                        <Td className={Number(c.outstanding_fees) > 0 ? "font-medium text-warning" : ""}>{Number(c.outstanding_fees) > 0 ? formatMoney(c.outstanding_fees, currency) : "Cleared"}</Td>
                      </tr>
                    ))}
                  </Table>
                  <Label label="Note for the selected students (optional)"><Input name="note" /></Label>
                  <SubmitButton>Add selected</SubmitButton>
                </form>
              )}
            </Card>
          )}

          {editable && !list.course_id && (
            <Card>
              <CardTitle>Add a student</CardTitle>
              <form action={addListStudents} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <input type="hidden" name="list_id" value={list.id} />
                <Label label="Student">
                  <Select name="student_id" required>
                    {(students as any[] | null)?.filter((s) => !onList.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.user_code ? ` (${s.user_code})` : ""}</option>)}
                  </Select>
                </Label>
                <Label label="Note (optional)"><Input name="note" /></Label>
                <SubmitButton>Add</SubmitButton>
              </form>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {editable && (
            <Card>
              <CardTitle description="The Principal is notified and approves or returns the list.">Submit for approval</CardTitle>
              <form action={submitCertificateList}>
                <input type="hidden" name="id" value={list.id} />
                <SubmitButton variant="accent">{list.status === "rejected" ? "Resubmit to Principal" : "Submit to Principal"}</SubmitButton>
              </form>
            </Card>
          )}
          {list.status === "submitted" && (
            <Card>
              <CardTitle description="Take the list back to make changes before the Principal decides.">Waiting for the Principal</CardTitle>
              <form action={withdrawCertificateList}>
                <input type="hidden" name="id" value={list.id} />
                <SubmitButton variant="outline">Withdraw</SubmitButton>
              </form>
            </Card>
          )}
          <Card>
            <CardTitle>List details</CardTitle>
            <form action={updateCertificateList} className="space-y-3">
              <fieldset disabled={!editable} className="space-y-3">
                <input type="hidden" name="id" value={list.id} />
                <Label label="Title"><Input name="title" defaultValue={list.title} required /></Label>
                <Label label="Certificate type">
                  <Select name="kind" defaultValue={list.kind}>{CERTIFICATE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</Select>
                </Label>
                <Label label="Eligibility criteria"><Textarea name="criteria" defaultValue={list.criteria} className="min-h-20" /></Label>
                {editable && <SubmitButton variant="outline">Save</SubmitButton>}
              </fieldset>
            </form>
            {editable && (
              <form action={deleteCertificateList} className="mt-4 border-t border-border pt-4">
                <input type="hidden" name="id" value={list.id} />
                <SubmitButton variant="ghost" confirm="Delete this list?">Delete list</SubmitButton>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
