import { notFound } from "next/navigation";
import { approveResultChange, rejectResultChange } from "@/app/principal/actions";
import { Alert, Badge, buttonClass, Card, CardTitle, Flash, type FlashParams, Label, PageHeader, Textarea, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { describeValue, RESULT_CHANGE_SELECT, RESULT_KIND_LABEL, type ResultChange } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

type Row = ResultChange & { student: { full_name: string; user_code: string | null } | null; requester: { full_name: string } | null };

export default async function PrincipalChangePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const [{ id }, flash] = await Promise.all([params, searchParams]);
  await requireRole("principal");
  const supabase = await createClient();
  const { data } = await supabase.from("result_changes").select(RESULT_CHANGE_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as unknown as Row;
  const pending = c.status === "pending";

  return (
    <>
      <PageHeader
        eyebrow={<TextLink href="/principal/changes">← Result changes</TextLink>}
        title={`${RESULT_KIND_LABEL[c.kind]}: ${c.label}`}
        subtitle={<>{c.change_no} · {c.course?.title}</>}
        action={<Badge value={pending ? "pending_approval" : c.status}>{pending ? "awaiting you" : c.status}</Badge>}
      />
      <Flash params={flash} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardTitle>Requested change</CardTitle>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Student</dt>
              <dd className="font-medium">{c.student?.full_name} <span className="font-mono text-xs text-muted-foreground">{c.student?.user_code}</span></dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Requested by</dt>
              <dd className="font-medium">{c.requester?.full_name ?? "—"}, Faculty <span className="text-xs font-normal text-muted-foreground">{formatDate(c.requested_at)}</span></dd>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Current (submitted)</dt>
              <dd className="mt-1 font-medium capitalize">{describeValue(c.kind, c.old_value)}</dd>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Requested</dt>
              <dd className="mt-1 font-medium capitalize">{describeValue(c.kind, c.new_value)}</dd>
            </div>
          </dl>
          <Alert tone="info" title="Reason given" className="mt-4">{c.reason}</Alert>
          {c.review_note && !pending && (
            <Alert tone={c.status === "approved" ? "success" : "danger"} title="Your note" className="mt-4">{c.review_note}</Alert>
          )}
        </Card>

        {pending && (
          <Card>
            <CardTitle description="Approving applies the change to the student's record. Rejecting leaves the submitted result as it is.">Your decision</CardTitle>
            <form className="space-y-3">
              <input type="hidden" name="id" value={c.id} />
              <Label label="Note" hint="Required when rejecting."><Textarea name="review_note" className="min-h-20" /></Label>
              <div className="flex flex-wrap gap-2">
                <button formAction={approveResultChange} className={buttonClass("success")}>Approve change</button>
                <button formAction={rejectResultChange} className={buttonClass("danger")}>Reject</button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
