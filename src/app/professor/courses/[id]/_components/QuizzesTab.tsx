import Link from "next/link";
import { createQuiz, deleteQuiz, setQuizQuestions, toggleQuiz } from "@/app/professor/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Empty, Input, Label, Table, Td, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export async function QuizzesTab({ courseId, quizId }: { courseId: string; quizId?: string }) {
  const supabase = await createClient();
  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("*, quiz_questions(question_id), quiz_attempts(id, score, total, submitted_at, student:profiles(full_name))")
    .eq("course_id", courseId)
    .order("created_at");
  const selected = quizzes?.find((q) => q.id === quizId);
  const { data: bank } = selected
    ? await supabase.from("questions").select("id, prompt, difficulty, course_categories(name)").order("created_at", { ascending: false })
    : { data: null };
  const chosen = new Set<string>(selected?.quiz_questions.map((q: { question_id: string }) => q.question_id) ?? []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {!quizzes?.length && <Empty>No quizzes yet.</Empty>}
        {quizzes?.map((q: any) => (
          <Card key={q.id} className={cn(q.id === quizId && "ring-2 ring-accent")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{q.title}</h3>
                <p className="text-xs text-muted-foreground">{q.quiz_questions.length} questions · {q.quiz_attempts.length} attempts</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge value={q.published ? "published" : "draft"} />
                <Link href={`/professor/courses/${courseId}?tab=quizzes&quiz=${q.id}`} className="text-sm text-primary hover:underline">Select questions</Link>
                <form action={toggleQuiz}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="published" value={String(!q.published)} />
                  <SubmitButton size="sm" variant="outline">{q.published ? "Unpublish" : "Publish"}</SubmitButton>
                </form>
                <form action={deleteQuiz}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="course_id" value={courseId} />
                  <SubmitButton size="sm" variant="ghost" confirm="Delete this quiz and its attempts?">Delete</SubmitButton>
                </form>
              </div>
            </div>
            {q.description && <p className="mt-2 text-sm">{q.description}</p>}
            {!!q.quiz_attempts.length && (
              <div className="mt-3">
                <Table head={["Student", "Score", "Submitted"]}>
                  {q.quiz_attempts.map((a: any) => (
                    <tr key={a.id}>
                      <Td>{a.student?.full_name}</Td>
                      <Td>{a.score}/{a.total}</Td>
                      <Td>{formatDate(a.submitted_at)}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        ))}

        {selected && (
          <Card>
            <CardTitle action={<Link href="/professor/question-bank" className="text-sm text-primary hover:underline">Add to bank</Link>}>
              Questions for “{selected.title}”
            </CardTitle>
            {!bank?.length ? (
              <Empty>The question bank is empty. Add questions first.</Empty>
            ) : (
              <form action={setQuizQuestions} className="space-y-2">
                <input type="hidden" name="course_id" value={courseId} />
                <input type="hidden" name="quiz_id" value={selected.id} />
                <div className="max-h-[28rem] space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {bank.map((b: any) => (
                    <label key={b.id} className="flex cursor-pointer items-start gap-3 rounded p-2 text-sm hover:bg-secondary">
                      <input type="checkbox" name="question_id" value={b.id} defaultChecked={chosen.has(b.id)} className="mt-1" />
                      <span className="flex-1">{b.prompt}</span>
                      <Badge value={b.difficulty} />
                    </label>
                  ))}
                </div>
                <SubmitButton>Save selection</SubmitButton>
              </form>
            )}
          </Card>
        )}
      </div>

      <Card className="h-fit">
        <CardTitle>New quiz</CardTitle>
        <form action={createQuiz} className="space-y-3">
          <input type="hidden" name="course_id" value={courseId} />
          <Label label="Title"><Input name="title" required /></Label>
          <Label label="Description"><Textarea name="description" /></Label>
          <SubmitButton className="w-full">Create quiz</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
