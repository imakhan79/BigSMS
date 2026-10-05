import Link from "next/link";
import { linkParent, unlinkParent, updateUser } from "@/app/admin/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, CardTitle, Flash, Label, PageHeader, Select, Table, Td, type FlashParams } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const ROLES = ["admin", "professor", "student", "parent"] as const;
const STATUSES = ["pending", "active", "inactive"] as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<FlashParams & { role?: string; status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (params.role) query = query.eq("role", params.role);
  if (params.status) query = query.eq("status", params.status);

  const [{ data: users }, { data: allProfiles }, { data: links }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["parent", "student"]).order("full_name"),
    supabase.from("parent_students").select("parent_id, student_id"),
  ]);

  const people = (allProfiles ?? []) as Pick<Profile, "id" | "full_name" | "email" | "role">[];
  const name = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p ? p.full_name || p.email : id;
  };
  const backPath = `/admin/users?${new URLSearchParams({ ...(params.role && { role: params.role }), ...(params.status && { status: params.status }) })}`;

  const filterLink = (key: "role" | "status", value?: string) => {
    const next = new URLSearchParams();
    const merged = { role: params.role, status: params.status, [key]: value };
    Object.entries(merged).forEach(([k, v]) => v && next.set(k, v));
    return `/admin/users?${next}`;
  };

  return (
    <>
      <PageHeader title="User management" subtitle="Activate accounts, assign roles and link parents to students" />
      <Flash params={params} />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[undefined, ...ROLES].map((r) => (
          <Link key={r ?? "all"} href={filterLink("role", r)} className={cn("rounded-full border px-3 py-1 capitalize", params.role === r && "bg-primary text-primary-foreground")}>
            {r ?? "All roles"}
          </Link>
        ))}
        <span className="mx-1 border-l border-border" />
        {[undefined, ...STATUSES].map((s) => (
          <Link key={s ?? "all"} href={filterLink("status", s)} className={cn("rounded-full border px-3 py-1 capitalize", params.status === s && "bg-primary text-primary-foreground")}>
            {s ?? "Any status"}
          </Link>
        ))}
      </div>

      <Card>
        <Table head={["Name", "Email", "Role", "Status", "Joined", "Change"]} empty={!users?.length}>
          {(users as Profile[] | null)?.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">{u.full_name || "—"}</Td>
              <Td>{u.email}</Td>
              <Td><Badge value={u.role} /></Td>
              <Td><Badge value={u.status} /></Td>
              <Td className="whitespace-nowrap">{formatDate(u.created_at)}</Td>
              <Td>
                <form action={updateUser} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="back" value={backPath} />
                  <Select name="role" defaultValue={u.role} className="w-32" aria-label="Role">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  <Select name="status" defaultValue={u.status} className="w-28" aria-label="Status">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <SubmitButton size="sm">Save</SubmitButton>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card className="mt-6">
        <CardTitle>Parent ↔ student links</CardTitle>
        <form action={linkParent} className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Label label="Parent">
            <Select name="parent_id" required>
              {people.filter((p) => p.role === "parent").map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
              ))}
            </Select>
          </Label>
          <Label label="Student">
            <Select name="student_id" required>
              {people.filter((p) => p.role === "student").map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
              ))}
            </Select>
          </Label>
          <SubmitButton>Link</SubmitButton>
        </form>
        <Table head={["Parent", "Student", ""]} empty={!links?.length}>
          {links?.map((l) => (
            <tr key={`${l.parent_id}-${l.student_id}`}>
              <Td>{name(l.parent_id)}</Td>
              <Td>{name(l.student_id)}</Td>
              <Td className="text-right">
                <form action={unlinkParent}>
                  <input type="hidden" name="parent_id" value={l.parent_id} />
                  <input type="hidden" name="student_id" value={l.student_id} />
                  <SubmitButton size="sm" variant="outline" confirm="Remove this link?">Unlink</SubmitButton>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
