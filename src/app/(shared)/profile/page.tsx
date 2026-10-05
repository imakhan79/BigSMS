import { changePassword, updateProfile } from "@/app/(shared)/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Flash, Input, Label, PageHeader, type FlashParams } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  const profile = await requireRole();

  return (
    <>
      <PageHeader title="My profile" />
      <Flash params={params} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardTitle>Details</CardTitle>
          <form action={updateProfile} className="space-y-4">
            <Label label="Full name">
              <Input name="full_name" defaultValue={profile.full_name} required />
            </Label>
            <Label label="Email">
              <Input value={profile.email} disabled readOnly />
            </Label>
            <div className="flex gap-2 text-sm">
              Role: <Badge value={profile.role} /> Status: <Badge value={profile.status} />
            </div>
            <SubmitButton>Save</SubmitButton>
          </form>
        </Card>
        <Card>
          <CardTitle>Change password</CardTitle>
          <form action={changePassword} className="space-y-4">
            <Label label="New password">
              <Input name="password" type="password" minLength={8} autoComplete="new-password" required />
            </Label>
            <Label label="Confirm password">
              <Input name="confirm" type="password" minLength={8} autoComplete="new-password" required />
            </Label>
            <SubmitButton>Update password</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
