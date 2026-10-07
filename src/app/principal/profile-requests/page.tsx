import { ProfileRequestsTable } from "@/components/ProfileRequests";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PROFILE_REQUEST_SELECT, type ProfileRequest } from "@/lib/profileRequests";
import { createClient } from "@/lib/supabase/server";

export default async function PrincipalProfileRequestsPage() {
  await requireRole("principal");
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_change_requests")
    .select(PROFILE_REQUEST_SELECT)
    .in("status", ["forwarded", "approved", "rejected"])
    .not("forwarded_at", "is", null)
    .order("forwarded_at", { ascending: false })
    .limit(200);
  const requests = (data ?? []) as unknown as ProfileRequest[];
  // Requests the Admin Manager returned never reached the Principal.
  const decided = requests.filter((r) => r.reviewed_at);

  return (
    <>
      <PageHeader title="Profile change requests" subtitle="Student → Admin Manager → Principal. A student's profile changes only when you approve." />
      <Card className="mb-6">
        <CardTitle description="Forwarded by the Admin Manager">Awaiting your approval</CardTitle>
        <ProfileRequestsTable requests={requests.filter((r) => r.status === "forwarded")} hrefBase="/principal/profile-requests" />
      </Card>
      <Card>
        <CardTitle>Decided</CardTitle>
        <ProfileRequestsTable requests={decided} hrefBase="/principal/profile-requests" />
      </Card>
    </>
  );
}
