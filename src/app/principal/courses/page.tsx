import { CourseApprovalList } from "@/components/CourseApprovalList";
import type { FlashParams } from "@/components/ui";

export default async function PrincipalCoursesPage({ searchParams }: { searchParams: Promise<FlashParams & { status?: string }> }) {
  return <CourseApprovalList base="/principal/courses" isAdmin={false} params={await searchParams} />;
}
