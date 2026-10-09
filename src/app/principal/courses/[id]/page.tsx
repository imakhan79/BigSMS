import { redirect } from "next/navigation";

/** Courses moved to the shared Course management section. */
export default async function CourseMoved({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/courses/${(await params).id}`);
}
