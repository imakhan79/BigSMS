import { createCourse } from "@/app/courses/actions";
import { CourseFields } from "@/components/CourseManagement";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, Flash, type FlashParams, PageHeader, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { courseFormOptions } from "@/lib/courses";
import { createClient } from "@/lib/supabase/server";

export default async function NewCoursePage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  await requireRole("principal", "admin_manager");
  const options = await courseFormOptions(await createClient());

  return (
    <>
      <PageHeader eyebrow={<TextLink href="/courses">← Courses</TextLink>} title="New course" subtitle="The course starts as a Draft. Publish it when the information is complete." />
      <Flash params={params} />
      <Card className="max-w-3xl">
        <form action={createCourse} className="space-y-5">
          <CourseFields {...options} />
          <SubmitButton>Create draft</SubmitButton>
        </form>
      </Card>
    </>
  );
}
