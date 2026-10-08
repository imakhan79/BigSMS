import { notFound } from "next/navigation";
import { acceptApplication, markUnderReview, rejectApplication, updateApplication } from "@/app/manager/actions";
import { FeeModeFields, PersonFields } from "@/app/manager/_components";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, Card, CardTitle, Flash, type FlashParams, Input, Label, PageHeader, Textarea, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const [{ id }, flash] = await Promise.all([params, searchParams]);
  await requireRole("admin_manager");
  const supabase = await createClient();
  const { data: app } = await supabase
    .from("student_applications")
    .select("*, reviewer:profiles!student_applications_reviewed_by_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!app) notFound();
  const open = app.status === "submitted" || app.status === "under_review";

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href="/manager/applications">← Applications</TextLink>}
        title={app.full_name}
        subtitle={<>{app.application_no} · {app.source === "online" ? "Online" : "Walk-in"} · received {formatDate(app.created_at)}</>}
        action={<Badge value={app.status} />}
      />
      <Flash params={flash} />
      {!open && (
        <Alert tone={app.status === "accepted" ? "success" : "danger"} title={`${app.status === "accepted" ? "Accepted" : "Rejected"} by ${app.reviewer?.full_name ?? "—"} on ${formatDate(app.reviewed_at)}`} className="mb-6">
          {app.decision_note}
          {app.student_id && <> <TextLink href={`/manager/students/${app.student_id}`}>Open student record</TextLink></>}
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardTitle>Application details</CardTitle>
          <form action={updateApplication}>
            <fieldset disabled={!open} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input type="hidden" name="id" value={app.id} />
              <Label label="Full name"><Input name="full_name" defaultValue={app.full_name} required /></Label>
              <Label label="Email"><Input name="email" type="email" defaultValue={app.email} required /></Label>
              <Label label="Phone"><Input name="phone" defaultValue={app.phone} /></Label>
              <PersonFields values={app} withStatement />
              <FeeModeFields values={app} />
              {open && <div className="sm:col-span-2 lg:col-span-3"><SubmitButton variant="outline">Save changes</SubmitButton></div>}
            </fieldset>
          </form>
        </Card>
        {open && (
          <div className="space-y-6">
            {app.status === "submitted" && (
              <Card>
                <CardTitle description="Let colleagues know you are handling it.">Review</CardTitle>
                <form action={markUnderReview}><input type="hidden" name="id" value={app.id} /><SubmitButton variant="outline">Mark under review</SubmitButton></form>
              </Card>
            )}
            <Card>
              <CardTitle description="Creates an active student account with this email and copies the details, fee plan and payment method into the student record.">Accept</CardTitle>
              {(!app.fee_plan || !app.payment_method) && (
                <Alert tone="warning" className="mb-3">Choose the fee plan and payment method in the application details and save before accepting.</Alert>
              )}
              <form action={acceptApplication} className="space-y-3">
                <input type="hidden" name="id" value={app.id} />
                <Label label="Temporary password"><Input name="password" minLength={8} autoComplete="off" required /></Label>
                <Label label="Note (optional)"><Input name="decision_note" /></Label>
                <SubmitButton variant="success">Accept and create student</SubmitButton>
              </form>
            </Card>
            <Card>
              <CardTitle>Reject</CardTitle>
              <form action={rejectApplication} className="space-y-3">
                <input type="hidden" name="id" value={app.id} />
                <Label label="Reason"><Textarea name="decision_note" required className="min-h-20" /></Label>
                <SubmitButton variant="danger" confirm="The application will be closed. This cannot be undone.">Reject application</SubmitButton>
              </form>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
