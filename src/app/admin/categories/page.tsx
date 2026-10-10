import { createCategory, deleteCategory } from "@/app/admin/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, Flash, Input, PageHeader, Table, Td, type FlashParams } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: categories } = await supabase.from("course_categories").select("id, name, courses(count)").order("name");

  return (
    <>
      <PageHeader title="Course categories" subtitle="Used by Faculty to categorise courses" />
      <Flash params={params} />
      <Card>
        <form action={createCategory} className="mb-4 flex gap-2">
          <Input name="name" placeholder="New category name" required />
          <SubmitButton>Add</SubmitButton>
        </form>
        <Table head={["Category", "Courses", ""]} empty={!categories?.length}>
          {categories?.map((c: any) => (
            <tr key={c.id}>
              <Td className="font-medium">{c.name}</Td>
              <Td>{c.courses?.[0]?.count ?? 0}</Td>
              <Td className="text-right">
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton size="sm" variant="outline" confirm="Delete this category? Courses keep existing but become uncategorised.">Delete</SubmitButton>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
