import Link from "next/link";
import { deleteQuestion, saveQuestion } from "@/app/(shared)/question-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Empty, Flash, type FlashParams, Input, Label, PageHeader, Select, Textarea, TextLink } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Question {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  difficulty: string;
  category_id: string | null;
  created_by: string | null;
  course_categories: { name: string } | null;
  profiles: { full_name: string } | null;
}

export async function QuestionBank({
  profile,
  base,
  params,
}: {
  profile: Profile;
  base: "/admin/question-bank" | "/professor/question-bank";
  params: FlashParams & { edit?: string; category?: string; q?: string };
}) {
  const supabase = await createClient();
  let query = supabase
    .from("questions")
    .select("*, course_categories(name), profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (params.category) query = query.eq("category_id", params.category);
  if (params.q) query = query.ilike("prompt", `%${params.q}%`);

  const [{ data }, { data: categories }] = await Promise.all([
    query,
    supabase.from("course_categories").select("id, name").order("name"),
  ]);
  const questions = (data ?? []) as Question[];
  const editing = params.edit ? questions.find((q) => q.id === params.edit) : undefined;
  const canEdit = (q: Question) => profile.role === "admin" || q.created_by === profile.id;

  return (
    <>
      <PageHeader title="Question bank" subtitle="Shared multiple-choice questions for quizzes" />
      <Flash params={params} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <form className="flex flex-wrap gap-2">
            <Input name="q" defaultValue={params.q} placeholder="Search questions" className="max-w-xs" />
            <Select name="category" defaultValue={params.category ?? ""} className="max-w-xs" aria-label="Category">
              <option value="">All categories</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <button className="h-10 rounded-md border border-border px-4 text-sm">Filter</button>
          </form>

          {!questions.length ? (
            <Empty>No questions found.</Empty>
          ) : (
            questions.map((q) => (
              <Card key={q.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{q.prompt}</p>
                  <div className="flex gap-1">
                    <Badge value={q.difficulty} />
                    {q.course_categories && <Badge value="category">{q.course_categories.name}</Badge>}
                  </div>
                </div>
                <ol className="mt-2 list-[upper-alpha] space-y-0.5 pl-6 text-sm">
                  {q.options.map((o, i) => (
                    <li key={i} className={cn(i === q.correct_index && "font-semibold text-success")}>{o}</li>
                  ))}
                </ol>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>By {q.profiles?.full_name ?? "—"}</span>
                  {canEdit(q) && (
                    <div className="flex items-center gap-2">
                      <Link href={`${base}?edit=${q.id}`} className="text-primary hover:underline">Edit</Link>
                      <form action={deleteQuestion}>
                        <input type="hidden" name="id" value={q.id} />
                        <input type="hidden" name="base" value={base} />
                        <SubmitButton size="sm" variant="ghost" confirm="Delete this question? It will be removed from any quizzes.">Delete</SubmitButton>
                      </form>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardTitle action={editing && <TextLink href={base}>Cancel</TextLink>}>
            {editing ? "Edit question" : "New question"}
          </CardTitle>
          <form action={saveQuestion} className="space-y-3" key={editing?.id ?? "new"}>
            <input type="hidden" name="base" value={base} />
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Label label="Question">
              <Textarea name="prompt" defaultValue={editing?.prompt} required />
            </Label>
            <Label label="Options (one per line, 2–6)">
              <Textarea name="options" defaultValue={editing?.options.join("\n")} required />
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Label label="Correct option #">
                <Input name="correct_index" type="number" min={1} max={6} defaultValue={editing ? editing.correct_index + 1 : 1} required />
              </Label>
              <Label label="Difficulty">
                <Select name="difficulty" defaultValue={editing?.difficulty ?? "medium"}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </Select>
              </Label>
            </div>
            <Label label="Category">
              <Select name="category_id" defaultValue={editing?.category_id ?? ""}>
                <option value="">None</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Label>
            <SubmitButton className="w-full">Save question</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
