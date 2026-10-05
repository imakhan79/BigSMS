import { QuestionBank } from "@/components/QuestionBank";
import type { FlashParams } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export default async function AdminQuestionBank({
  searchParams,
}: {
  searchParams: Promise<FlashParams & { edit?: string; category?: string; q?: string }>;
}) {
  const profile = await requireRole("admin");
  return <QuestionBank profile={profile} base="/admin/question-bank" params={await searchParams} />;
}
