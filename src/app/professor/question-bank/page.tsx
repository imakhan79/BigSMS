import { QuestionBank } from "@/components/QuestionBank";
import type { FlashParams } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export default async function ProfessorQuestionBank({
  searchParams,
}: {
  searchParams: Promise<FlashParams & { edit?: string; category?: string; q?: string }>;
}) {
  const profile = await requireRole("professor");
  return <QuestionBank profile={profile} base="/professor/question-bank" params={await searchParams} />;
}
