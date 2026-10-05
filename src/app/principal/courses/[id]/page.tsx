import { CourseReview } from "@/components/CourseReview";

export default async function PrincipalCourseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CourseReview id={id} base="/principal/courses" isAdmin={false} />;
}
