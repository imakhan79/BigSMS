import Link from "next/link";
import { createUser, updateUser } from "@/app/admin/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Filters, Flash, type FlashParams, Input, Label, PageHeader, Select, Table, Td, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_ROLES, ROLE_LABEL, type Profile, type Role } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const ROLES: Role[] = ["super_admin", "admin", "admin_manager", "principal", "professor", "staff", "student"];
// Offboarding is done from the user's page so a reason is recorded.
const STATUSES = ["pending", "active", "inactive"] as const;
const FILTER_STATUSES = [...STATUSES, "offboarded"] as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<FlashParams & { role?: string; status?: string }>;
}) {
  const params = await searchParams;
  const viewer = await requireRole("admin");
  const isSuper = viewer.role === "super_admin";
  // Admins manage everyone except administrators; only a Super Admin assigns admin roles.
  const assignable = isSuper ? ROLES : ROLES.filter((r) => !ADMIN_ROLES.includes(r));
  const canManage = (u: Profile) => isSuper || (!ADMIN_ROLES.includes(u.role) && u.id !== viewer.id);
  const supabase = await createClient();

  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (params.role) query = query.eq("role", params.role);
  if (params.status) query = query.eq("status", params.status);

  const { data: users } = await query;
  const backPath = `/admin/users?${new URLSearchParams({ ...(params.role && { role: params.role }), ...(params.status && { status: params.status }) })}`;

  const filterLink = (key: "role" | "status", value?: string) => {
    const next = new URLSearchParams();
    const merged = { role: params.role, status: params.status, [key]: value };
    Object.entries(merged).forEach(([k, v]) => v && next.set(k, v));
    return `/admin/users?${next}`;
  };

  return (
    <>
      <PageHeader title="User management" subtitle="Create and onboard users, assign categories and IDs, and offboard leavers" />
      <Flash params={params} />

      <Card className="mb-6">
        <details>
          <summary className="cursor-pointer select-none text-[15px] font-semibold text-foreground marker:text-muted-foreground">Create a user</summary>
          <p className="mt-2 text-sm text-muted-foreground">
            The account is active straight away and gets a user ID. Give the person the temporary password and ask them to change it under My profile.
          </p>
          <form action={createUser} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Label label="Full name"><Input name="full_name" required /></Label>
            <Label label="Email"><Input name="email" type="email" required /></Label>
            <Label label="Category (role)">
              <Select name="role" defaultValue="student" required>
                {assignable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </Label>
            <Label label="Temporary password"><Input name="password" type="text" minLength={8} autoComplete="off" required /></Label>
            <Label label="Phone"><Input name="phone" type="tel" /></Label>
            <Label label="Department"><Input name="department" /></Label>
            <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>Create user</SubmitButton></div>
          </form>
        </details>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Filters
          label="Role"
          items={[undefined, ...ROLES].map((r) => ({ href: filterLink("role", r), label: r ? ROLE_LABEL[r] : "All", active: params.role === r }))}
        />
        <Filters
          label="Status"
          items={[undefined, ...FILTER_STATUSES].map((s) => ({ href: filterLink("status", s), label: s ?? "Any", active: params.status === s }))}
        />
      </div>

      <Card>
        <Table head={["User ID", "Name", "Email", "Role", "Status", "Joined", "Change"]} empty={!users?.length}>
          {(users as Profile[] | null)?.map((u) => (
            <tr key={u.id}>
              <Td className="whitespace-nowrap font-mono text-xs">{u.user_code ?? "—"}</Td>
              <Td className="whitespace-nowrap font-medium">
                <Link href={`/admin/users/${u.id}`} className="hover:underline">{u.full_name || "—"}</Link>
                {u.department && <p className="text-xs font-normal text-muted-foreground">{u.department}</p>}
              </Td>
              <Td>{u.email}</Td>
              <Td><Badge value={u.role}>{ROLE_LABEL[u.role]}</Badge></Td>
              <Td><Badge value={u.status} /></Td>
              <Td className="whitespace-nowrap">{formatDate(u.created_at)}</Td>
              <Td>
                {!canManage(u) ? (
                  <span className="text-xs text-muted-foreground">{u.id === viewer.id ? "Your account" : "Super Admin only"}</span>
                ) : u.status === "offboarded" ? (
                  <TextLink href={`/admin/users/${u.id}`} className="ml-1">Manage</TextLink>
                ) : (
                  <form action={updateUser} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="back" value={backPath} />
                    <Select name="role" defaultValue={u.role} className="h-8 w-32 shrink-0 text-xs" aria-label="Role">
                      {assignable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </Select>
                    <Select name="status" defaultValue={u.status} className="h-8 w-28 shrink-0 text-xs capitalize" aria-label="Status">
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                    <SubmitButton size="sm" variant="outline">Save</SubmitButton>
                    <TextLink href={`/admin/users/${u.id}`} className="ml-1">Manage</TextLink>
                  </form>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

    </>
  );
}
