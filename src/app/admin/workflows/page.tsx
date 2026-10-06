import { saveCourseWorkflow } from "@/app/admin/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, CardTitle, Flash, Label, PageHeader, Select, type FlashParams } from "@/components/ui";
import { getCourseWorkflow, workflowSummary } from "@/lib/approvals";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/types";

const APPROVERS = ["admin", "principal"] as const;

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  await requireRole("super_admin");
  const supabase = await createClient();
  const [steps, { count: pending }] = await Promise.all([
    getCourseWorkflow(supabase),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
  ]);

  return (
    <>
      <PageHeader title="Approval workflows" subtitle="Configure who approves what, and in which order, without code changes" />
      <Flash params={params} />

      <Card>
        <CardTitle>Course publication</CardTitle>
        <p className="mb-4 text-sm text-muted-foreground">
          A course a professor submits is approved step by step in this order and is published after the last step. Rejecting at any step sends it back to the professor.
          As Super Admin you can decide at any step; approving as Super Admin publishes immediately.
        </p>
        <p className="mb-4 text-sm">
          Current: <span className="font-semibold">{workflowSummary(steps)}</span>
        </p>

        <form action={saveCourseWorkflow} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {APPROVERS.map((_, i) => (
              <Label key={i} label={`Step ${i + 1}${i === 0 ? "" : " (optional)"}`}>
                <Select name="step" defaultValue={steps[i]?.approver_role ?? ""} required={i === 0}>
                  {i > 0 && <option value="">None</option>}
                  {APPROVERS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
              </Label>
            ))}
          </div>
          {!!pending && (
            <p className="text-sm text-warning">
              {pending} course{pending === 1 ? " is" : "s are"} awaiting approval. Saving a change restarts them at step 1 and notifies the first approver.
            </p>
          )}
          <SubmitButton>Save workflow</SubmitButton>
        </form>
      </Card>
    </>
  );
}
