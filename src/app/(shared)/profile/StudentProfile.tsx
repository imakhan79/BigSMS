import { requestProfileChange, withdrawProfileChange } from "@/app/(shared)/actions";
import { ChangeList } from "@/components/ProfileRequests";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Badge, Card, CardTitle, Input, Label, Select, Table, Td, Textarea } from "@/components/ui";
import { PROFILE_FIELD_LABEL, PROFILE_FIELDS, PROFILE_STATUS_LABEL, showValue, type ProfileRequest } from "@/lib/profileRequests";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { formatDay, timeAgo } from "@/lib/utils";

/**
 * Students cannot edit their profile. They request a change, which the Admin Manager
 * forwards to the Principal; it takes effect only when the Principal approves it.
 */
export async function StudentProfile({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const [{ data: record }, { data: requestData }] = await Promise.all([
    supabase.from("student_records").select("*").eq("student_id", profile.id).maybeSingle(),
    supabase.from("profile_change_requests").select("*").eq("student_id", profile.id).order("submitted_at", { ascending: false }).limit(20),
  ]);
  const current: Record<string, string> = {
    full_name: profile.full_name,
    phone: profile.phone,
    date_of_birth: record?.date_of_birth ?? "",
    gender: record?.gender ?? "",
    address: record?.address ?? "",
    guardian_name: record?.guardian_name ?? "",
    guardian_phone: record?.guardian_phone ?? "",
    guardian_relation: record?.guardian_relation ?? "",
  };
  const requests = (requestData ?? []) as ProfileRequest[];
  const open = requests.find((r) => r.status === "submitted" || r.status === "forwarded");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle description="Kept by the student office. To correct anything, send a change request.">My details</CardTitle>
        <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">System ID</dt><dd className="font-mono font-medium">{profile.user_code ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Email</dt><dd className="font-medium">{profile.email}</dd></div>
          {PROFILE_FIELDS.map((f) => (
            <div key={f.key} className={f.type === "long" ? "sm:col-span-2" : undefined}>
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="font-medium">{showValue(f.key, current[f.key])}</dd>
            </div>
          ))}
          {record?.program && <div><dt className="text-muted-foreground">Program</dt><dd className="font-medium">{record.program}</dd></div>}
        </dl>
      </Card>

      <Card>
        <CardTitle description="Student → Admin Manager → Principal approval">Request a change</CardTitle>
        {open ? (
          <div className="space-y-3">
            <Alert tone="info" title={`Request ${open.request_no} is ${PROFILE_STATUS_LABEL[open.status]}`}>
              Sent {timeAgo(open.submitted_at)}. Your details change once the Principal approves it.
            </Alert>
            <ChangeList request={open} />
            <form action={withdrawProfileChange}>
              <input type="hidden" name="id" value={open.id} />
              <SubmitButton size="sm" variant="outline" confirm="Withdraw this change request?">Withdraw request</SubmitButton>
            </form>
          </div>
        ) : (
          <form action={requestProfileChange} className="space-y-3">
            <p className="text-sm text-muted-foreground">Edit the details that are wrong. Only the fields you change are sent.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PROFILE_FIELDS.map((f) => (
                <Label key={f.key} label={f.label} className={f.type === "long" ? "sm:col-span-2" : undefined}>
                  {f.type === "gender" ? (
                    <Select name={f.key} defaultValue={current[f.key]}>
                      <option value="">Not specified</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </Select>
                  ) : f.type === "long" ? (
                    <Textarea name={f.key} defaultValue={current[f.key]} className="min-h-16" />
                  ) : (
                    <Input name={f.key} type={f.type ?? "text"} defaultValue={current[f.key]} required={f.key === "full_name"} />
                  )}
                </Label>
              ))}
            </div>
            <Label label="Reason" hint="Optional. For example, a name corrected on your ID card."><Textarea name="reason" className="min-h-16" /></Label>
            <SubmitButton>Send request</SubmitButton>
          </form>
        )}
      </Card>

      {!!requests.length && (
        <Card className="lg:col-span-2">
          <CardTitle>My requests</CardTitle>
          <Table head={["Request", "Changes", "Status", "Note"]}>
            {requests.map((r) => (
              <tr key={r.id}>
                <Td><p className="font-mono text-xs">{r.request_no}</p><p className="text-xs text-muted-foreground">{formatDay(r.submitted_at)}</p></Td>
                <Td className="text-xs">{Object.keys(r.changes).map((k) => PROFILE_FIELD_LABEL[k] ?? k).join(", ")}</Td>
                <Td><Badge value={r.status === "submitted" || r.status === "forwarded" ? "pending" : r.status}>{PROFILE_STATUS_LABEL[r.status]}</Badge></Td>
                <Td className="text-xs text-muted-foreground">{r.review_note || r.manager_note || "—"}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

