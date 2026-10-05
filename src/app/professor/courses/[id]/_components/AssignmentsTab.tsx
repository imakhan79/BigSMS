import { deleteAssignment, gradeSubmission, saveAssignment, toggleAssignment } from "@/app/professor/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Empty, Input, Label, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export async function AssignmentsTab({ courseId }: { courseId: string }) {
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("assignments")
    .select("*, submissions(*, student:profiles!submissions_student_id_fkey(full_name, email))")
    .eq("course_id", courseId)
    .order("created_at");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {!assignments?.length && <Empty>No assignments yet.</Empty>}
        {assignments?.map((a: any) => (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{a.title}</h3>
                <p className="text-xs text-muted-foreground">Due {formatDate(a.due_at)} · out of {a.max_score}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge value={a.published ? "published" : "draft"} />
                <form action={toggleAssignment}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="published" value={String(!a.published)} />
                  <SubmitButton size="sm" variant="outline">{a.published ? "Unpublish" : "Publish"}</SubmitButton>
                </form>
                <form action={deleteAssignment}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="course_id" value={courseId} />
                  <SubmitButton size="sm" variant="ghost" confirm="Delete this assignment and all submissions?">Delete</SubmitButton>
                </form>
              </div>
            </div>
            {a.instructions && <p className="mt-2 whitespace-pre-wrap text-sm">{a.instructions}</p>}

            <h4 className="mt-4 text-sm font-semibold">Submissions ({a.submissions.length})</h4>
            {!a.submissions.length ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {a.submissions.map((s: any) => (
                  <div key={s.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="font-medium">{s.student?.full_name || s.student?.email}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {formatDate(s.submitted_at)} <Badge value={s.status} />
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{s.content}</p>
                    {s.link_url && (
                      <a href={s.link_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{s.link_url}</a>
                    )}
                    <form action={gradeSubmission} className="mt-3 grid gap-2 sm:grid-cols-[6rem_1fr_auto]">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="max_score" value={a.max_score} />
                      <Input name="score" type="number" step="0.5" min={0} max={a.max_score} defaultValue={s.score ?? ""} placeholder="Score" aria-label="Score" required />
                      <Input name="feedback" defaultValue={s.feedback ?? ""} placeholder="Feedback for the student" aria-label="Feedback" />
                      <SubmitButton size="md">{s.status === "graded" ? "Update grade" : "Grade"}</SubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card className="h-fit">
        <CardTitle>New assignment</CardTitle>
        <form action={saveAssignment} className="space-y-3">
          <input type="hidden" name="course_id" value={courseId} />
          <Label label="Title"><Input name="title" required /></Label>
          <Label label="Instructions"><Textarea name="instructions" /></Label>
          <div className="grid grid-cols-2 gap-3">
            <Label label="Due"><Input name="due_at" type="datetime-local" /></Label>
            <Label label="Max score"><Input name="max_score" type="number" min={1} defaultValue={100} /></Label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" /> Publish to students now</label>
          <SubmitButton className="w-full">Create assignment</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
