import { deleteSetting, saveSetting } from "@/app/admin/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, CardTitle, Flash, Input, Label, PageHeader, type FlashParams } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: settings } = await supabase.from("system_settings").select("*").order("key");

  return (
    <>
      <PageHeader title="System configuration" subtitle="Key/value settings. Values are stored as JSON (plain text is saved as a string)." />
      <Flash params={params} />
      <div className="grid gap-4">
        {settings?.map((s) => (
          <Card key={s.key} className="p-4">
            <form action={saveSetting} className="grid gap-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
              <input type="hidden" name="key" value={s.key} />
              <div>
                <p className="font-mono text-sm font-medium">{s.key}</p>
                <p className="text-xs text-muted-foreground">Updated {formatDate(s.updated_at)}</p>
              </div>
              <Input name="value" defaultValue={typeof s.value === "string" ? s.value : JSON.stringify(s.value)} aria-label={s.key} />
              <SubmitButton size="md">Save</SubmitButton>
            </form>
            <form action={deleteSetting} className="mt-2">
              <input type="hidden" name="key" value={s.key} />
              <SubmitButton size="sm" variant="ghost" confirm={`Remove setting "${s.key}"?`}>Remove</SubmitButton>
            </form>
          </Card>
        ))}
        <Card>
          <CardTitle>Add setting</CardTitle>
          <form action={saveSetting} className="grid gap-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
            <Label label="Key"><Input name="key" required /></Label>
            <Label label="Value"><Input name="value" required /></Label>
            <SubmitButton>Add</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
