import { saveBatch } from "@/app/enrollment/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, CardTitle, Flash, type FlashParams, Input, Label, PageHeader, Select, Table, Td, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Batch = {
  id: string;
  course_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  capacity: number | null;
  status: string;
  course: { code: string; title: string } | null;
  enrollments: { count: number }[];
};

/** Course batches: a cohort of a course with dates and an optional seat limit. */
export default async function BatchesPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  await requireRole("admin", "admin_manager", "principal");
  const supabase = await createClient();
  const [{ data: batchData }, { data: courses }] = await Promise.all([
    supabase.from("course_batches").select("id, course_id, name, starts_on, ends_on, capacity, status, course:courses(code, title), enrollments(count)").order("starts_on", { ascending: false, nullsFirst: false }),
    supabase.from("courses").select("id, code, title").neq("status", "archived").order("title"),
  ]);
  const batches = (batchData ?? []) as unknown as Batch[];

  return (
    <>
      <PageHeader eyebrow={<TextLink href="/enrollment">← Student enrollment</TextLink>} title="Course batches" subtitle="Students can be enrolled in a course or in one of its batches." />
      <Flash params={params} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <Table head={["Course", "Batch", "Dates", "Seats", "Status", ""]} empty={!batches.length}>
            {batches.map((b) => {
              const form = `batch-${b.id}`;
              const used = b.enrollments?.[0]?.count ?? 0;
              return (
                <tr key={b.id}>
                  <Td><span className="font-mono text-xs">{b.course?.code}</span> {b.course?.title}</Td>
                  <Td><Input form={form} name="name" defaultValue={b.name} className="h-8 w-32 min-w-32 text-xs" aria-label="Batch name" required /></Td>
                  <Td className="whitespace-nowrap text-xs">
                    <Input form={form} name="starts_on" type="date" defaultValue={b.starts_on ?? ""} className="h-8 w-36 text-xs" aria-label="Starts" />
                    <Input form={form} name="ends_on" type="date" defaultValue={b.ends_on ?? ""} className="mt-1 h-8 w-36 text-xs" aria-label="Ends" />
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    <Input form={form} name="capacity" type="number" min={1} defaultValue={b.capacity ?? ""} placeholder="No limit" className="h-8 w-24 text-xs" aria-label="Capacity" />
                    <p className="mt-1 text-muted-foreground">{used} enrolled</p>
                  </Td>
                  <Td>
                    <Select form={form} name="status" defaultValue={b.status} className="h-8 w-24 text-xs" aria-label="Status">
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                    </Select>
                  </Td>
                  <Td>
                    <form id={form} action={saveBatch}>
                      <input type="hidden" name="id" value={b.id} />
                      <SubmitButton size="sm">Save</SubmitButton>
                    </form>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card className="h-fit">
          <CardTitle>New batch</CardTitle>
          <form action={saveBatch} className="space-y-3">
            <Label label="Course">
              <Select name="course_id" required defaultValue="">
                <option value="" disabled>Choose a course</option>
                {courses?.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
              </Select>
            </Label>
            <Label label="Batch name"><Input name="name" placeholder="e.g. Morning 2026-A" required /></Label>
            <div className="grid grid-cols-2 gap-3">
              <Label label="Starts"><Input name="starts_on" type="date" /></Label>
              <Label label="Ends"><Input name="ends_on" type="date" /></Label>
            </div>
            <Label label="Seats" hint="Leave blank for no limit"><Input name="capacity" type="number" min={1} /></Label>
            <SubmitButton className="w-full">Create batch</SubmitButton>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">Closed batches can&apos;t take new enrollments.</p>
        </Card>
      </div>
    </>
  );
}
