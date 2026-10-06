import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, type ApprovalStep, type Role } from "@/lib/types";

export async function getCourseWorkflow(supabase: SupabaseClient): Promise<ApprovalStep[]> {
  const { data } = await supabase
    .from("approval_steps")
    .select("workflow, step_order, approver_role")
    .eq("workflow", "course_publication")
    .order("step_order");
  return (data ?? []) as ApprovalStep[];
}

/** Where a pending course sits in the workflow, and whether this viewer may decide on it. */
export function approvalState(approvalStep: number | null, steps: ApprovalStep[], viewer: Role) {
  const index = steps.findIndex((s) => s.step_order === approvalStep);
  const step = index >= 0 ? steps[index] : null;
  return {
    step,
    label: step ? `Step ${index + 1} of ${steps.length}: ${ROLE_LABEL[step.approver_role]} approval` : "Awaiting approval",
    canAct: viewer === "super_admin" || (!!step && step.approver_role === viewer),
  };
}

export function workflowSummary(steps: ApprovalStep[]) {
  return steps.length ? steps.map((s) => ROLE_LABEL[s.approver_role]).join(" → ") : "Not configured";
}
