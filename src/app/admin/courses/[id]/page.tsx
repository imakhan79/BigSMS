import { CourseReview } from "@/components/CourseReview";

export default async function AdminCourseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CourseReview id={id} base="/admin/courses" isAdmin />;
}
