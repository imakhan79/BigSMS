import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { submitQuiz } from "@/app/student/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, Flash, PageHeader, type FlashParams } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TakeQuizPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const profile = await requireRole("student");
  const supabase = await createClient();
  const { data: quiz } = await supabase.from("quizzes").select("id, title, description, course_id").eq("id", id).single();
  if (!quiz) notFound();

  const { data: attempt } = await supabase.from("quiz_attempts").select("id").eq("quiz_id", id).eq("student_id", profile.id).maybeSingle();
  if (attempt) redirect(`/student/courses/${quiz.course_id}?tab=quizzes`);

  // Correct answers are never sent to the browser; grading happens in submit_quiz().
  const { data: questions } = await supabase.rpc("get_quiz_questions", { p_quiz_id: id });

  return (
    <>
      <PageHeader
        title={quiz.title}
        subtitle={quiz.description || "Answer every question, then submit. You get one attempt."}
        action={<Link href={`/student/courses/${quiz.course_id}?tab=quizzes`} className="text-sm text-primary hover:underline">← Back</Link>}
      />
      <Flash params={sp} />
      <form action={submitQuiz} className="space-y-4">
        <input type="hidden" name="quiz_id" value={id} />
        <input type="hidden" name="course_id" value={quiz.course_id} />
        {(questions ?? []).map((q: { question_id: string; prompt: string; options: string[] }, i: number) => (
          <Card key={q.question_id}>
            <fieldset>
              <legend className="mb-3 font-medium">{i + 1}. {q.prompt}</legend>
              <div className="space-y-2">
                {q.options.map((o, idx) => (
                  <label key={idx} className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 text-sm hover:bg-secondary has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                    <input type="radio" name={`q_${q.question_id}`} value={idx} required />
                    {o}
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>
        ))}
        <SubmitButton variant="accent" confirm="Submit your answers? You cannot change them afterwards.">Submit quiz</SubmitButton>
      </form>
    </>
  );
}
