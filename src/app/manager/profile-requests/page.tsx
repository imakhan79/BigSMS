import { ProfileRequestsTable } from "@/components/ProfileRequests";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { PROFILE_REQUEST_SELECT, type ProfileRequest } from "@/lib/profileRequests";
import { createClient } from "@/lib/supabase/server";

export default async function ManagerProfileRequestsPage() {
  await requireRole("admin_manager");
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_change_requests")
    .select(PROFILE_REQUEST_SELECT)
    .neq("status", "withdrawn")
    .order("submitted_at", { ascending: false })
    .limit(200);
  const requests = (data ?? []) as unknown as ProfileRequest[];

  return (
    <>
      <PageHeader title="Profile change requests" subtitle="Students cannot edit their own profile. Check each request and forward it to the Principal, whose approval puts it into effect." />
      <Card className="mb-6">
        <CardTitle description="Check the details, then forward or return">Waiting for you</CardTitle>
        <ProfileRequestsTable requests={requests.filter((r) => r.status === "submitted")} hrefBase="/manager/profile-requests" />
      </Card>
      <Card className="mb-6">
        <CardTitle>With the Principal</CardTitle>
        <ProfileRequestsTable requests={requests.filter((r) => r.status === "forwarded")} hrefBase="/manager/profile-requests" />
      </Card>
      <Card>
        <CardTitle>Decided</CardTitle>
        <ProfileRequestsTable requests={requests.filter((r) => r.status === "approved" || r.status === "rejected")} hrefBase="/manager/profile-requests" />
      </Card>
    </>
  );
}
