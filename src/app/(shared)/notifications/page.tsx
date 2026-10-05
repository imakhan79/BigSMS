import Link from "next/link";
import { markNotificationRead } from "@/app/(shared)/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export default async function NotificationsPage() {
  const profile = await requireRole();
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader
        title="Notifications"
        action={
          <form action={markNotificationRead}>
            <SubmitButton variant="outline" size="sm">Mark all read</SubmitButton>
          </form>
        }
      />
      {!items?.length ? (
        <Empty>No notifications.</Empty>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id} className={cn("flex items-start justify-between gap-4 p-4", !n.read_at && "border-l-4 border-l-accent")}>
              <div>
                <p className="font-medium">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</p>
                {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
              </div>
              {!n.read_at && (
                <form action={markNotificationRead}>
                  <input type="hidden" name="id" value={n.id} />
                  <SubmitButton variant="ghost" size="sm">Mark read</SubmitButton>
                </form>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
