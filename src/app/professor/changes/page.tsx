import { withdrawResultChange } from "@/app/professor/actions";
import { StudentCell } from "@/app/professor/_components";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, Card, CardTitle, Flash, type FlashParams, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { describeValue, getRoster, RESULT_KIND_LABEL, type ResultChange } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/utils";

export default async function ProfessorChangesPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const flash = await searchParams;
  const profile = await requireRole("professor");
  const supabase = await createClient();
  const [{ data }, roster] = await Promise.all([
    supabase
      .from("result_changes")
      .select("*, course:courses(title)")
      .eq("requested_by", profile.id)
      .order("requested_at", { ascending: false })
      .limit(100),
    getRoster(supabase),
  ]);
  const changes = (data ?? []) as ResultChange[];
  const students = new Map(roster.map((s) => [s.student_id, s]));

  return (
    <>
      <PageHeader title="Change requests" subtitle="Changes to submitted attendance, marks, grades and final reports take effect once the Principal approves them." />
      <Flash params={flash} />
      <Alert tone="info" className="mb-6">
        To request a change, open the submitted register, exam, assignment or final report in the course and choose <strong>Request change</strong> next to the student.
      </Alert>
      <Card>
        <CardTitle>Your requests</CardTitle>
        <Table head={["Request", "Student", "Current → requested", "Reason", "Status", ""]} empty={!changes.length}>
          {changes.map((c) => (
            <tr key={c.id}>
              <Td>
                <p className="font-medium">{RESULT_KIND_LABEL[c.kind]}: {c.label}</p>
                <p className="text-xs text-muted-foreground">{c.course?.title} · <span className="font-mono">{c.change_no}</span> · {timeAgo(c.requested_at)}</p>
              </Td>
              <Td><StudentCell name={students.get(c.student_id)?.full_name} code={students.get(c.student_id)?.user_code} /></Td>
              <Td className="text-xs">
                <span className="text-muted-foreground line-through">{describeValue(c.kind, c.old_value)}</span>
                <br />
                <span className="font-medium">{describeValue(c.kind, c.new_value)}</span>
              </Td>
              <Td className="max-w-56 text-xs text-muted-foreground">
                {c.reason}
                {c.review_note && <p className="mt-1 text-foreground">Principal: {c.review_note}</p>}
              </Td>
              <Td><Badge value={c.status === "pending" ? "pending_approval" : c.status}>{c.status === "pending" ? "with Principal" : c.status}</Badge></Td>
              <Td className="text-right">
                {c.status === "pending" && (
                  <form action={withdrawResultChange}>
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton size="sm" variant="ghost" confirm="Withdraw this change request?">Withdraw</SubmitButton>
                  </form>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
