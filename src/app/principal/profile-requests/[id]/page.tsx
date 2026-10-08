import { notFound } from "next/navigation";
import { approveProfileChange, rejectProfileChange } from "@/app/principal/actions";
import { ChangeList, ProfileRequestTrail } from "@/components/ProfileRequests";
import { Alert, Badge, buttonClass, Card, CardTitle, Flash, type FlashParams, Label, PageHeader, Textarea, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PROFILE_REQUEST_SELECT, PROFILE_STATUS_LABEL, type ProfileRequest } from "@/lib/profileRequests";
import { createClient } from "@/lib/supabase/server";

export default async function PrincipalProfileRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const [{ id }, flash] = await Promise.all([params, searchParams]);
  await requireRole("principal");
  const supabase = await createClient();
  const { data } = await supabase.from("profile_change_requests").select(PROFILE_REQUEST_SELECT).eq("id", id).not("forwarded_at", "is", null).maybeSingle();
  if (!data) notFound();
  const r = data as unknown as ProfileRequest;
  const waiting = r.status === "forwarded";

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href="/principal/profile-requests">← Profile change requests</TextLink>}
        title={r.student?.full_name ?? "Student"}
        subtitle={<>{r.request_no} · <span className="font-mono">{r.student?.user_code}</span></>}
        action={<Badge value={waiting ? "pending_approval" : r.status}>{waiting ? "awaiting you" : PROFILE_STATUS_LABEL[r.status]}</Badge>}
      />
      <Flash params={flash} />
      <div className="mb-6"><ProfileRequestTrail request={r} /></div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardTitle>Changes to apply</CardTitle>
          <ChangeList request={r} />
          {r.reason && <Alert tone="info" title="Student's reason" className="mt-4">{r.reason}</Alert>}
          {r.manager_note && <Alert tone="info" title="Admin Manager's note" className="mt-4">{r.manager_note}</Alert>}
          {r.review_note && !waiting && <Alert tone={r.status === "approved" ? "success" : "danger"} title="Your note" className="mt-4">{r.review_note}</Alert>}
        </Card>
        {waiting && (
          <Card>
            <CardTitle description="Approving updates the student's profile. Rejecting leaves it unchanged.">Your decision</CardTitle>
            <form className="space-y-3">
              <input type="hidden" name="id" value={r.id} />
              <Label label="Note" hint="Required when rejecting."><Textarea name="review_note" className="min-h-20" /></Label>
              <div className="flex flex-wrap gap-2">
                <button formAction={approveProfileChange} className={buttonClass("success")}>Approve</button>
                <button formAction={rejectProfileChange} className={buttonClass("danger")}>Reject</button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
