import Link from "next/link";
import { addQuizQuestion, createQuiz, deleteQuiz, removeQuizQuestion, toggleQuiz } from "@/app/professor/actions";
import { StudentCell } from "@/app/professor/_components";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Empty, Input, Label, Select, Table, Td, Textarea } from "@/components/ui";
import { getRoster } from "@/lib/faculty";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export async function QuizzesTab({ courseId, quizId }: { courseId: string; quizId?: string }) {
  const supabase = await createClient();
  const [{ data: quizzes }, roster] = await Promise.all([
    supabase
      .from("quizzes")
      .select("*, quiz_questions(question_id), quiz_attempts(id, student_id, score, total, submitted_at)")
      .eq("course_id", courseId)
      .order("created_at"),
    getRoster(supabase, courseId),
  ]);
  const students = new Map(roster.map((s) => [s.student_id, s]));
  const selected = quizzes?.find((q) => q.id === quizId);
  const { data: links } = selected
    ? await supabase
        .from("quiz_questions")
        .select("question_id, questions(prompt, options, correct_index, difficulty)")
        .eq("quiz_id", selected.id)
        .order("position")
    : { data: null };

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
                <Link href={`/professor/courses/${courseId}?tab=quizzes&quiz=${q.id}`} className="text-sm text-primary hover:underline">Questions</Link>
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
                      <Td><StudentCell name={students.get(a.student_id)?.full_name} code={students.get(a.student_id)?.user_code} /></Td>
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
            <CardTitle>Questions for “{selected.title}”</CardTitle>
            {!links?.length ? (
              <Empty>No questions yet. Add the first one below.</Empty>
            ) : (
              <ol className="space-y-3">
                {links.map((l: any, i: number) => (
                  <li key={l.question_id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{i + 1}. {l.questions.prompt}</p>
                      <div className="flex items-center gap-2">
                        <Badge value={l.questions.difficulty} />
                        <form action={removeQuizQuestion}>
                          <input type="hidden" name="course_id" value={courseId} />
                          <input type="hidden" name="quiz_id" value={selected.id} />
                          <input type="hidden" name="question_id" value={l.question_id} />
                          <SubmitButton size="sm" variant="ghost" confirm="Remove this question from the quiz?">Remove</SubmitButton>
                        </form>
                      </div>
                    </div>
                    <ol className="mt-2 list-[upper-alpha] space-y-0.5 pl-6">
                      {l.questions.options.map((o: string, j: number) => (
                        <li key={j} className={cn(j === l.questions.correct_index && "font-semibold text-success")}>{o}</li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            )}

            <form action={addQuizQuestion} className="mt-4 space-y-3 border-t border-border pt-4">
              <input type="hidden" name="course_id" value={courseId} />
              <input type="hidden" name="quiz_id" value={selected.id} />
              <Label label="Question"><Textarea name="prompt" required /></Label>
              <Label label="Options (one per line, 2–6)"><Textarea name="options" required /></Label>
              <div className="grid grid-cols-2 gap-3">
                <Label label="Correct option #">
                  <Input name="correct_index" type="number" min={1} max={6} defaultValue={1} required />
                </Label>
                <Label label="Difficulty">
                  <Select name="difficulty" defaultValue="medium">
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </Select>
                </Label>
              </div>
              <SubmitButton>Add question</SubmitButton>
            </form>
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
