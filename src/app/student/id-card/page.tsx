import { StudentIdCard } from "@/components/StudentIdCard";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export default async function StudentIdCardPage() {
  const profile = await requireRole("student");
  return (
    <>
      <PageHeader title="My ID card" subtitle="Details are kept by the student office. To correct them, request a change from My profile." />
      <StudentIdCard studentId={profile.id} />
    </>
  );
}
