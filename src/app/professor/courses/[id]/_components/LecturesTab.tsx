import Link from "next/link";
import { addMaterial, deleteLecture, deleteMaterial, saveLecture } from "@/app/professor/actions";
import { MaterialLink } from "@/components/MaterialLink";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Empty, Input, Label, Select, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const TYPES = [
  ["video", "Video"],
  ["pdf", "PDF"],
  ["book", "Book"],
  ["notes", "Notes"],
  ["worksheet", "Worksheet"],
] as const;

export async function LecturesTab({ courseId, editId }: { courseId: string; editId?: string }) {
  const supabase = await createClient();
  const [{ data: lectures }, { data: materials }] = await Promise.all([
    supabase.from("lectures").select("*").eq("course_id", courseId).order("position").order("created_at"),
    supabase.from("materials").select("*").eq("course_id", courseId).order("created_at"),
  ]);
  const editing = lectures?.find((l) => l.id === editId);
  const general = materials?.filter((m) => !m.lecture_id) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {!lectures?.length && <Empty>No lectures yet.</Empty>}
        {lectures?.map((l) => (
          <Card key={l.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold">{l.position}. {l.title}</h3>
              <div className="flex items-center gap-2 text-sm">
                <Link href={`/professor/courses/${courseId}?tab=lectures&edit=${l.id}`} className="text-primary hover:underline">Edit</Link>
                <form action={deleteLecture}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="course_id" value={courseId} />
                  <SubmitButton size="sm" variant="ghost" confirm="Delete this lecture and its materials?">Delete</SubmitButton>
                </form>
              </div>
            </div>
            {l.content && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{l.content}</p>}
            <MaterialList items={materials?.filter((m) => m.lecture_id === l.id) ?? []} courseId={courseId} />
          </Card>
        ))}
        {!!general.length && (
          <Card className="p-4">
            <h3 className="font-semibold">Course-wide materials</h3>
            <MaterialList items={general} courseId={courseId} />
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardTitle action={editing && <Link href={`/professor/courses/${courseId}?tab=lectures`} className="text-sm text-primary hover:underline">Cancel</Link>}>
            {editing ? "Edit lecture" : "New lecture"}
          </CardTitle>
          <form action={saveLecture} className="space-y-3" key={editing?.id ?? "new"}>
            <input type="hidden" name="course_id" value={courseId} />
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Label label="Title"><Input name="title" defaultValue={editing?.title} required /></Label>
            <Label label="Order"><Input name="position" type="number" defaultValue={editing?.position ?? (lectures?.length ?? 0) + 1} /></Label>
            <Label label="Content / summary"><Textarea name="content" defaultValue={editing?.content} /></Label>
            <SubmitButton className="w-full">Save lecture</SubmitButton>
          </form>
        </Card>

        <Card>
          <CardTitle>Upload material</CardTitle>
          <form action={addMaterial} className="space-y-3">
            <input type="hidden" name="course_id" value={courseId} />
            <Label label="Type">
              <Select name="type" defaultValue="pdf">
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Label>
            <Label label="Lecture">
              <Select name="lecture_id">
                <option value="">Whole course</option>
                {lectures?.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </Select>
            </Label>
            <Label label="Title"><Input name="title" placeholder="Defaults to file name" /></Label>
            <Label label="File (videos, PDFs, books, notes, worksheets)"><Input name="file" type="file" /></Label>
            <Label label="…or external link (e.g. YouTube)"><Input name="external_url" type="url" placeholder="https://" /></Label>
            <SubmitButton className="w-full">Add material</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}

function MaterialList({ items, courseId }: { items: any[]; courseId: string }) {
  if (!items.length) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
      {items.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Badge value={m.type} />
            <MaterialLink material={m} />
          </span>
          <form action={deleteMaterial}>
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="course_id" value={courseId} />
            <input type="hidden" name="file_path" value={m.file_path ?? ""} />
            <SubmitButton size="sm" variant="ghost" confirm="Remove this material?">Remove</SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}
