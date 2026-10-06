import Link from "next/link";
import { Card, CardTitle, Empty, PageHeader, TextLink } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

/** Staff portal: account details and notifications. Staff modules are added as the BRD defines them. */
export default async function StaffDashboard() {
  const profile = await requireRole("staff");
  const supabase = await createClient();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, title, body, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <>
      <PageHeader title={`Welcome, ${profile.full_name || "Staff"}`} subtitle="Staff portal" />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardTitle action={<TextLink href="/profile">Edit</TextLink>}>My details</CardTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">User ID</dt>
            <dd className="font-mono">{profile.user_code ?? "—"}</dd>
            <dt className="text-muted-foreground">Department</dt>
            <dd>{profile.department || "—"}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{profile.email}</dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{profile.phone || "—"}</dd>
          </dl>
        </Card>
        <Card>
          <CardTitle action={<TextLink href="/notifications">All</TextLink>}>Notifications</CardTitle>
          {!notifications?.length ? (
            <Empty>No notifications.</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {notifications.map((n) => (
                <li key={n.id} className="py-2">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-muted-foreground">{n.body}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
