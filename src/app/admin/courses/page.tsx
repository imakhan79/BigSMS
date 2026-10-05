import { CourseApprovalList } from "@/components/CourseApprovalList";
import type { FlashParams } from "@/components/ui";

export default async function AdminCoursesPage({ searchParams }: { searchParams: Promise<FlashParams & { status?: string }> }) {
  return <CourseApprovalList base="/admin/courses" isAdmin params={await searchParams} />;
}
