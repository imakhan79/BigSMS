import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import { Badge, Table, Td } from "@/components/ui";
import type { CertificateEntryRow, CertificateListRow } from "@/lib/office";
import { cn, formatDate, formatMoney, pct } from "@/lib/utils";

/**
 * The fixed certificate workflow, shown on every list: Prepared by Admin Manager → Approved by Principal.
 */
export function CertificateTrail({ list }: { list: CertificateListRow }) {
  const decided = list.status === "approved" || list.status === "rejected";
  const ApprovalIcon = list.status === "approved" ? CheckCircle2 : list.status === "rejected" ? XCircle : list.status === "submitted" ? Clock : Circle;
  const approvalLabel =
    list.status === "approved" ? "Approved by" : list.status === "rejected" ? "Rejected by" : list.status === "submitted" ? "Awaiting approval by" : "To be approved by";
  const reviewerRole = list.reviewer?.role === "super_admin" ? "Super Admin" : "Principal";

  return (
    <ol className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/40 p-4 text-sm sm:flex-row sm:items-center" aria-label="Certificate workflow">
      <li className="flex min-w-0 items-start gap-2.5">
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Prepared by</p>
          <p className="font-semibold">
            {list.preparer?.full_name ?? "—"} <span className="font-normal text-muted-foreground">(Admin Manager)</span>
          </p>
          <p className="text-xs text-muted-foreground">{list.submitted_at ? `Submitted ${formatDate(list.submitted_at)}` : "Not submitted yet"}</p>
        </div>
      </li>
      <ArrowRight size={18} className="hidden shrink-0 text-muted-foreground sm:block" aria-hidden />
      <li className="flex min-w-0 items-start gap-2.5">
        <ApprovalIcon
          size={18}
          className={cn(
            "mt-0.5 shrink-0",
            list.status === "approved" ? "text-success" : list.status === "rejected" ? "text-danger" : list.status === "submitted" ? "text-warning" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{approvalLabel}</p>
          <p className="font-semibold">
            {decided ? list.reviewer?.full_name ?? "—" : "Principal"}
            {decided && <span className="font-normal text-muted-foreground"> ({reviewerRole})</span>}
          </p>
          {decided && <p className="text-xs text-muted-foreground">{formatDate(list.reviewed_at)}</p>}
        </div>
      </li>
    </ol>
  );
}

/** One-line version for tables. */
export function trailText(list: CertificateListRow) {
  const prepared = `Prepared by ${list.preparer?.full_name ?? "—"}`;
  if (list.status === "approved") return `${prepared} → Approved by ${list.reviewer?.full_name ?? "—"}`;
  if (list.status === "rejected") return `${prepared} → Rejected by ${list.reviewer?.full_name ?? "—"}`;
  return `${prepared} → Principal approval`;
}

export function CertificateListsTable({ lists, hrefBase }: { lists: CertificateListRow[]; hrefBase: string }) {
  return (
    <Table head={["List", "Course", "Type", "Workflow", "Status", "Updated"]} empty={!lists.length}>
      {lists.map((l) => (
        <tr key={l.id}>
          <Td className="whitespace-nowrap">
            <Link href={`${hrefBase}/${l.id}`} className="font-medium hover:underline">{l.title}</Link>
            <p className="font-mono text-xs text-muted-foreground">{l.list_no}</p>
          </Td>
          <Td>{l.course?.title ?? <span className="text-muted-foreground">Any course</span>}</Td>
          <Td className="capitalize">{l.kind}</Td>
          <Td className="text-xs text-muted-foreground">{trailText(l)}</Td>
          <Td><Badge value={l.status === "submitted" ? "pending_approval" : l.status}>{l.status === "submitted" ? "awaiting principal" : l.status}</Badge></Td>
          <Td className="whitespace-nowrap">{formatDate(l.updated_at)}</Td>
        </tr>
      ))}
    </Table>
  );
}

export function EntryFigures({ entry, currency }: { entry: CertificateEntryRow; currency: string }) {
  return (
    <>
      <Td className="whitespace-nowrap">
        {pct(entry.final_percentage)}
        {entry.final_grade && <span className="ml-1 font-medium">· {entry.final_grade}</span>}
      </Td>
      <Td>{pct(entry.exam_average)}</Td>
      <Td>{pct(entry.completion_rate)}</Td>
      <Td>{pct(entry.attendance_rate)}</Td>
      <Td className={cn("whitespace-nowrap", Number(entry.outstanding_fees) > 0 && "font-medium text-warning")}>
        {Number(entry.outstanding_fees) > 0 ? formatMoney(entry.outstanding_fees, currency) : "Cleared"}
      </Td>
    </>
  );
}
