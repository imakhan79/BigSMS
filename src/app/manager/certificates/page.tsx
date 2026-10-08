import { createCertificateList } from "@/app/manager/actions";
import { CertificateListsTable } from "@/components/CertificateList";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, CardTitle, Flash, type FlashParams, Input, Label, PageHeader, Select, Textarea } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { CERTIFICATE_LIST_SELECT, type CertificateListRow } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import { CERTIFICATE_KINDS } from "@/lib/types";

export default async function CertificateListsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  await requireRole("admin_manager");
  const supabase = await createClient();
  const [{ data: lists }, { data: courses }] = await Promise.all([
    supabase.from("certificate_lists").select(CERTIFICATE_LIST_SELECT).order("updated_at", { ascending: false }),
    supabase.from("courses").select("id, title").eq("status", "published").order("title"),
  ]);

  return (
    <>
      <PageHeader title="Certificate lists" subtitle="Workflow: Prepared by Admin Manager → Approved by Principal. Approval issues the certificates." />
      <Flash params={params} />
      <Card className="mb-6">
        <CardTitle description="Start a list, add the eligible students, then submit it to the Principal.">Compile a new list</CardTitle>
        <form action={createCertificateList} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Label label="List title"><Input name="title" required placeholder="e.g. Spring 2026 completion" /></Label>
          <Label label="Course" hint="Only students enrolled in it can be added.">
            <Select name="course_id">
              <option value="">Not tied to a course</option>
              {courses?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Label>
          <Label label="Certificate type">
            <Select name="kind">{CERTIFICATE_KINDS.map((k) => <option key={k} value={k} className="capitalize">{k}</option>)}</Select>
          </Label>
          <Label label="Eligibility criteria" className="sm:col-span-2 lg:col-span-4">
            <Textarea name="criteria" className="min-h-16" placeholder="e.g. Completed all lectures, attendance at least 75%, fees cleared" />
          </Label>
          <div className="sm:col-span-2 lg:col-span-4"><SubmitButton>Create list</SubmitButton></div>
        </form>
      </Card>
      <Card><CertificateListsTable lists={(lists ?? []) as unknown as CertificateListRow[]} hrefBase="/manager/certificates" /></Card>
    </>
  );
}
