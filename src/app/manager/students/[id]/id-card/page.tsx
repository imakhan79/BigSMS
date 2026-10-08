import { notFound } from "next/navigation";
import { StudentIdCard } from "@/components/StudentIdCard";
import { PageHeader, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export default async function ManagerStudentIdCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("admin_manager");
  const card = await StudentIdCard({ studentId: id });
  if (!card) notFound();
  return (
    <>
      <PageHeader eyebrow={<TextLink href={`/manager/students/${id}`}>← Student record</TextLink>} title="Student ID card" subtitle="Built from the student record and the photograph in Documents." />
      {card}
    </>
  );
}
