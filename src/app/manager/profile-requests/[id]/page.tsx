import { notFound } from "next/navigation";
import { forwardProfileChange, returnProfileChange } from "@/app/manager/actions";
import { ChangeList, ProfileRequestTrail } from "@/components/ProfileRequests";
import { Alert, Badge, buttonClass, Card, CardTitle, Flash, type FlashParams, Input, Label, PageHeader, Select, Textarea, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PROFILE_FIELDS, PROFILE_REQUEST_SELECT, PROFILE_STATUS_LABEL, type ProfileRequest } from "@/lib/profileRequests";
import { createClient } from "@/lib/supabase/server";

export default async function ManagerProfileRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const [{ id }, flash] = await Promise.all([params, searchParams]);
  await requireRole("admin_manager");
  const supabase = await createClient();
  const { data } = await supabase.from("profile_change_requests").select(PROFILE_REQUEST_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as unknown as ProfileRequest;
  const fields = PROFILE_FIELDS.filter((f) => f.key in r.changes);

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href="/manager/profile-requests">← Profile change requests</TextLink>}
        title={r.student?.full_name ?? "Student"}
        subtitle={<>{r.request_no} · <TextLink href={`/manager/students/${r.student_id}`}>{r.student?.user_code ?? "Student record"}</TextLink></>}
        action={<Badge value={r.status === "submitted" || r.status === "forwarded" ? "pending" : r.status}>{PROFILE_STATUS_LABEL[r.status]}</Badge>}
      />
      <Flash params={flash} />
      <div className="mb-6"><ProfileRequestTrail request={r} /></div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardTitle>Requested changes</CardTitle>
          <ChangeList request={r} />
          {r.reason && <Alert tone="info" title="Student's reason" className="mt-4">{r.reason}</Alert>}
          {r.manager_note && <Alert tone="info" title="Your note" className="mt-4">{r.manager_note}</Alert>}
          {r.review_note && <Alert tone={r.status === "approved" ? "success" : "danger"} title="Principal's note" className="mt-4">{r.review_note}</Alert>}
        </Card>

        {r.status === "submitted" && (
          <Card>
            <CardTitle description="Correct the values if needed. Nothing changes until the Principal approves.">Your review</CardTitle>
            <form className="space-y-3">
              <input type="hidden" name="id" value={r.id} />
              {fields.map((f) => (
                <Label key={f.key} label={f.label}>
                  {f.type === "gender" ? (
                    <Select name={f.key} defaultValue={r.changes[f.key]}>
                      <option value="">Not specified</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </Select>
                  ) : (
                    <Input name={f.key} type={f.type === "date" || f.type === "tel" ? f.type : "text"} defaultValue={r.changes[f.key]} />
                  )}
                </Label>
              ))}
              <Label label="Note" hint="Required when returning the request to the student."><Textarea name="manager_note" className="min-h-16" /></Label>
              <div className="flex flex-wrap gap-2">
                <button formAction={forwardProfileChange} className={buttonClass("primary")}>Forward to Principal</button>
                <button formAction={returnProfileChange} className={buttonClass("danger")}>Return to student</button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
