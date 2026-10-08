import Link from "next/link";
import { Badge, Table, Td } from "@/components/ui";
import { PROFILE_FIELD_LABEL, PROFILE_STATUS_LABEL, showValue, type ProfileRequest } from "@/lib/profileRequests";
import { formatDate, timeAgo } from "@/lib/utils";

/** Field-by-field "current → requested" list. */
export function ChangeList({ request }: { request: Pick<ProfileRequest, "changes" | "current_values"> }) {
  return (
    <dl className="divide-y divide-border rounded-md border border-border text-sm">
      {Object.entries(request.changes).map(([k, v]) => (
        <div key={k} className="grid grid-cols-[8rem_1fr] gap-2 p-2">
          <dt className="text-muted-foreground">{PROFILE_FIELD_LABEL[k] ?? k}</dt>
          <dd>
            <span className="text-muted-foreground line-through">{showValue(k, request.current_values?.[k])}</span>{" "}
            → <span className="font-medium">{showValue(k, v)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The fixed workflow, shown on every request: Student → Admin Manager → Principal. */
export function ProfileRequestTrail({ request }: { request: ProfileRequest }) {
  const returnedByManager = request.status === "rejected" && !request.reviewed_at;
  const steps = [
    { label: "Requested by", who: `${request.student?.full_name ?? "Student"} (Student)`, when: request.submitted_at, done: true },
    {
      label: returnedByManager ? "Returned by" : "Forwarded by",
      who: request.forwarder ? `${request.forwarder.full_name} (Admin Manager)` : "Admin Manager",
      when: request.forwarded_at,
      done: !!request.forwarded_at,
    },
    ...(returnedByManager
      ? []
      : [{
          label: request.status === "approved" ? "Approved by" : request.status === "rejected" ? "Rejected by" : "To be approved by",
          who: request.reviewer ? `${request.reviewer.full_name} (Principal)` : "Principal",
          when: request.reviewed_at,
          done: !!request.reviewed_at,
        }]),
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map((s) => (
        <li key={s.label} className={`rounded-md border p-3 text-sm ${s.done ? "border-border bg-surface" : "border-dashed border-border bg-muted/30"}`}>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
          <p className="mt-1 font-semibold">{s.who}</p>
          <p className="text-xs text-muted-foreground">{s.when ? formatDate(s.when) : "Pending"}</p>
        </li>
      ))}
    </ol>
  );
}

export function ProfileRequestsTable({ requests, hrefBase }: { requests: ProfileRequest[]; hrefBase: string }) {
  return (
    <Table head={["Request", "Student", "Fields", "Status"]} empty={!requests.length}>
      {requests.map((r) => (
        <tr key={r.id}>
          <Td>
            <Link href={`${hrefBase}/${r.id}`} className="font-mono text-xs font-medium hover:underline">{r.request_no}</Link>
            <p className="text-xs text-muted-foreground">{timeAgo(r.submitted_at)}</p>
          </Td>
          <Td><p className="font-medium">{r.student?.full_name}</p><p className="font-mono text-xs text-muted-foreground">{r.student?.user_code}</p></Td>
          <Td className="text-xs">{Object.keys(r.changes).map((k) => PROFILE_FIELD_LABEL[k] ?? k).join(", ")}</Td>
          <Td><Badge value={r.status === "submitted" || r.status === "forwarded" ? "pending" : r.status}>{PROFILE_STATUS_LABEL[r.status]}</Badge></Td>
        </tr>
      ))}
    </Table>
  );
}
