import { Input, Label, Select, Textarea } from "@/components/ui";

type Values = Partial<Record<string, string | null>>;

/** Personal and guardian fields shared by applications, the apply form and student records. */
export function PersonFields({ values = {}, withStatement = false }: { values?: Values; withStatement?: boolean }) {
  const v = (k: string) => values[k] ?? "";
  return (
    <>
      <Label label="Date of birth"><Input name="date_of_birth" type="date" defaultValue={v("date_of_birth")} /></Label>
      <Label label="Gender">
        <Select name="gender" defaultValue={v("gender")}>
          <option value="">Not given</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
        </Select>
      </Label>
      <Label label="Programme"><Input name="program" defaultValue={v("program")} placeholder="e.g. FSc Pre-Engineering" /></Label>
      <Label label="Address" className="sm:col-span-2 lg:col-span-3"><Input name="address" defaultValue={v("address")} /></Label>
      <Label label="Guardian name"><Input name="guardian_name" defaultValue={v("guardian_name")} /></Label>
      <Label label="Guardian phone"><Input name="guardian_phone" type="tel" defaultValue={v("guardian_phone")} /></Label>
      <Label label="Relation"><Input name="guardian_relation" defaultValue={v("guardian_relation")} placeholder="Father, mother…" /></Label>
      <Label label="Previous school" className="sm:col-span-2 lg:col-span-3"><Input name="previous_school" defaultValue={v("previous_school")} /></Label>
      {withStatement && (
        <Label label="Statement / remarks" className="sm:col-span-2 lg:col-span-3"><Textarea name="statement" defaultValue={v("statement")} maxLength={2000} /></Label>
      )}
    </>
  );
}
