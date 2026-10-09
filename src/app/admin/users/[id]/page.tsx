import Link from "next/link";
import { notFound } from "next/navigation";
import { linkChild, offboardUser, unlinkChild, updateUser, updateUserDetails } from "@/app/admin/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Flash, type FlashParams, Input, Label, PageHeader, Select, Textarea, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_ROLES, ROLE_LABEL, type Profile } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FlashParams>;
}) {
  const [{ id }, flash] = await Promise.all([params, searchParams]);
  const viewer = await requireRole("admin");
  const isSuper = viewer.role === "super_admin";
  const supabase = await createClient();

  const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
  if (!data) notFound();
  const user = data as Profile;

  const actorIds = [user.onboarded_by, user.offboarded_by].filter(Boolean) as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] as { id: string; full_name: string; email: string }[] };
  const actor = (actorId: string | null) => {
    const a = actors?.find((x) => x.id === actorId);
    return a ? a.full_name || a.email : actorId ? "—" : "System";
  };

  // A parent account sees what its linked children see.
  const [{ data: links }, { data: students }] = user.role === "parent"
    ? await Promise.all([
        supabase.from("parent_students").select("student:profiles!parent_students_student_id_fkey(id, full_name, user_code)").eq("parent_id", user.id),
        supabase.from("profiles").select("id, full_name, user_code").eq("role", "student").eq("status", "active").order("full_name"),
      ])
    : [{ data: [] }, { data: [] }];
  const linked = (links ?? []).map((l) => l.student as unknown as { id: string; full_name: string; user_code: string | null }).filter(Boolean);

  const canManage = isSuper || (!ADMIN_ROLES.includes(user.role) && user.id !== viewer.id);
  const path = `/admin/users/${user.id}`;

  return (
    <>
      <PageHeader
        title={user.full_name || user.email}
        subtitle={`${ROLE_LABEL[user.role]} · ${user.email}`}
        action={<TextLink href="/admin/users">← All users</TextLink>}
      />
      <Flash params={flash} />
      {!canManage && (
        <p className="mb-4 rounded-md border border-border bg-secondary p-3 text-sm">
          {user.id === viewer.id ? "You can't change your own account here; use My profile." : "Only a Super Admin can manage administrator accounts."}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Details</CardTitle>
          <form action={updateUserDetails} className="space-y-4">
            <input type="hidden" name="id" value={user.id} />
            <fieldset disabled={!canManage} className="space-y-4">
              <Label label="User ID">
                {isSuper ? (
                  <Input name="user_code" defaultValue={user.user_code ?? ""} placeholder="Assigned on activation" className="font-mono uppercase" />
                ) : (
                  <Input value={user.user_code ?? "Assigned on activation"} readOnly disabled className="font-mono" />
                )}
              </Label>
              <Label label="Full name"><Input name="full_name" defaultValue={user.full_name} required /></Label>
              <Label label="Phone"><Input name="phone" type="tel" defaultValue={user.phone} /></Label>
              <Label label="Department"><Input name="department" defaultValue={user.department} /></Label>
              {canManage && <SubmitButton>Save details</SubmitButton>}
            </fieldset>
          </form>
        </Card>

        <Card>
          <CardTitle>Onboarding</CardTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd><Badge value={user.status} /></dd>
            <dt className="text-muted-foreground">Registered</dt>
            <dd>{formatDate(user.created_at)}</dd>
            <dt className="text-muted-foreground">Onboarded</dt>
            <dd>{user.onboarded_at ? `${formatDate(user.onboarded_at)} by ${actor(user.onboarded_by)}` : "Not yet (activate the account)"}</dd>
            {user.status === "offboarded" && (
              <>
                <dt className="text-muted-foreground">Offboarded</dt>
                <dd>{formatDate(user.offboarded_at)} by {actor(user.offboarded_by)}</dd>
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{user.offboard_reason || "—"}</dd>
              </>
            )}
          </dl>

          {canManage && user.status === "pending" && (
            <form action={updateUser} className="mt-4">
              <input type="hidden" name="id" value={user.id} />
              <input type="hidden" name="role" value={user.role} />
              <input type="hidden" name="status" value="active" />
              <input type="hidden" name="back" value={path} />
              <SubmitButton>Onboard (activate and assign ID)</SubmitButton>
            </form>
          )}
          {canManage && user.status === "offboarded" && (
            <form action={updateUser} className="mt-4">
              <input type="hidden" name="id" value={user.id} />
              <input type="hidden" name="role" value={user.role} />
              <input type="hidden" name="status" value="active" />
              <input type="hidden" name="back" value={path} />
              <SubmitButton variant="outline">Re-onboard (restore access)</SubmitButton>
            </form>
          )}
        </Card>
      </div>

      {user.role === "parent" && (
        <Card className="mt-6">
          <CardTitle description="The parent sees exactly what these students see in their portal, read-only.">Children</CardTitle>
          {!linked.length && <p className="mb-3 text-sm text-muted-foreground">No children linked yet.</p>}
          <ul className="mb-4 divide-y divide-border text-sm">
            {linked.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span><span className="font-medium">{c.full_name}</span> <span className="font-mono text-xs text-muted-foreground">{c.user_code}</span></span>
                {canManage && (
                  <form action={unlinkChild}>
                    <input type="hidden" name="parent_id" value={user.id} />
                    <input type="hidden" name="student_id" value={c.id} />
                    <SubmitButton size="sm" variant="ghost">Unlink</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {canManage && (
            <form action={linkChild} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="parent_id" value={user.id} />
              <Label label="Link a student" className="min-w-64 flex-1">
                <Select name="student_id" required defaultValue="">
                  <option value="" disabled>Choose a student</option>
                  {(students ?? []).filter((s) => !linked.some((c) => c.id === s.id)).map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}{s.user_code ? ` (${s.user_code})` : ""}</option>
                  ))}
                </Select>
              </Label>
              <SubmitButton>Link</SubmitButton>
            </form>
          )}
        </Card>
      )}

      {canManage && user.status !== "offboarded" && (
        <Card className="mt-6 border-danger/30">
          <CardTitle>Offboard</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            Ends this person&apos;s access immediately. Their records (courses, grades, submissions, audit history) are kept, and they can be re-onboarded later.
          </p>
          <form action={offboardUser} className="space-y-3">
            <input type="hidden" name="id" value={user.id} />
            <Label label="Reason"><Textarea name="reason" rows={2} required placeholder="e.g. Graduated, resigned, contract ended" /></Label>
            <SubmitButton variant="danger" confirm={`Offboard ${user.full_name || user.email}? They will lose access immediately.`}>Offboard user</SubmitButton>
          </form>
        </Card>
      )}
    </>
  );
}
