import { reviewExamResults } from "@/app/principal/actions-exams";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Flash, type FlashParams, Input, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { EXAM_KINDS, examStage } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatDay, pct } from "@/lib/utils";

interface Row {
  exam_id: string;
  title: string;
  kind: string;
  held_on: string;
  max_marks: number;
  course_title: string;
  faculty_name: string | null;
  results_status: string;
  submitted_at: string | null;
  approved_at: string | null;
  students: number;
  absent: number;
  average: number | null;
}

interface Mark {
  student_id: string;
  marks: number | null;
  absent: boolean;
  remarks: string;
  student: { full_name: string; user_code: string | null } | null;
}

/** Exam results submitted by Faculty: the Principal approves them (publishing to students) or returns them. */
export default async function PrincipalExamsPage({ searchParams }: { searchParams: Promise<FlashParams & { exam?: string }> }) {
  const params = await searchParams;
  await requireRole("principal");
  const supabase = await createClient();
  const { data } = await supabase.rpc("exam_results_overview");
  const rows = (data ?? []) as Row[];
  const waiting = rows.filter((r) => r.results_status === "pending");
  const open = rows.find((r) => r.exam_id === params.exam) ?? waiting[0];
  const { data: marks } = open
    ? await supabase.from("exam_results").select("student_id, marks, absent, remarks, student:profiles!exam_results_student_id_fkey(full_name, user_code)").eq("exam_id", open.exam_id)
    : { data: [] };
  const sheet = ((marks ?? []) as unknown as Mark[]).sort((a, b) => (a.student?.full_name ?? "").localeCompare(b.student?.full_name ?? ""));

  const list = (items: Row[]) => (
    <Table head={["Exam", "Course", "Students", "Average", "Stage"]} empty={!items.length}>
      {items.map((r) => (
        <tr key={r.exam_id} className={cn(r.exam_id === open?.exam_id && "bg-secondary/50")}>
          <Td>
            <a href={`/principal/exams?exam=${r.exam_id}`} className="font-medium hover:underline">{r.title}</a>
            <p className="text-xs text-muted-foreground">{EXAM_KINDS[r.kind] ?? r.kind} · {formatDay(r.held_on)}</p>
          </Td>
          <Td>{r.course_title}<p className="text-xs text-muted-foreground">{r.faculty_name}</p></Td>
          <Td>{r.students}{r.absent ? ` (${r.absent} absent)` : ""}</Td>
          <Td>{pct(r.average)}</Td>
          <Td><Badge value={examStage({ assigned_at: "x", results_status: r.results_status }).tone}>{examStage({ assigned_at: "x", results_status: r.results_status }).label}</Badge></Td>
        </tr>
      ))}
    </Table>
  );

  return (
    <>
      <PageHeader title="Exam results" subtitle="Faculty submit exam results. They are published to students only when you approve them." />
      <Flash params={params} />
      {open && (
        <Card className="mb-6">
          <CardTitle
            description={`${open.course_title} · ${open.faculty_name ?? ""} · out of ${Number(open.max_marks)} · submitted ${formatDate(open.submitted_at)}`}
            action={<Badge value={examStage({ assigned_at: "x", results_status: open.results_status }).tone}>{examStage({ assigned_at: "x", results_status: open.results_status }).label}</Badge>}
          >
            {open.title}
          </CardTitle>
          <Table head={["Student", "Marks", "Percent", "Remarks"]} empty={!sheet.length}>
            {sheet.map((m) => (
              <tr key={m.student_id}>
                <Td><p className="font-medium">{m.student?.full_name}</p><p className="font-mono text-xs text-muted-foreground">{m.student?.user_code}</p></Td>
                <Td>{m.absent ? <Badge value="absent" tone="danger" /> : Number(m.marks)}</Td>
                <Td>{m.absent || m.marks == null ? "—" : pct((Number(m.marks) / Number(open.max_marks)) * 100)}</Td>
                <Td className="text-xs text-muted-foreground">{m.remarks || "—"}</Td>
              </tr>
            ))}
          </Table>
          {open.results_status === "pending" && (
            <div className="mt-4 flex flex-wrap items-start gap-3">
              <form action={reviewExamResults}>
                <input type="hidden" name="exam_id" value={open.exam_id} />
                <input type="hidden" name="decision" value="approve" />
                <SubmitButton variant="success" confirm="Students will see their results." confirmTitle="Approve and publish these results?">Approve and publish</SubmitButton>
              </form>
              <form action={reviewExamResults} className="flex flex-wrap gap-2">
                <input type="hidden" name="exam_id" value={open.exam_id} />
                <input type="hidden" name="decision" value="return" />
                <Input name="note" placeholder="What needs correcting" aria-label="What needs correcting" className="w-72" required />
                <SubmitButton variant="outline">Return to Faculty</SubmitButton>
              </form>
            </div>
          )}
        </Card>
      )}
      <Card className="mb-6">
        <CardTitle description={`${waiting.length} waiting for you`}>Awaiting your approval</CardTitle>
        {list(waiting)}
      </Card>
      <Card>
        <CardTitle>Decided</CardTitle>
        {list(rows.filter((r) => r.results_status !== "pending"))}
      </Card>
    </>
  );
}
