import Link from "next/link";
import { CsvButton } from "@/components/CsvButton";
import { Alert, buttonClass, Card, Input, Label, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { pct, today } from "@/lib/utils";

interface SummaryRow {
  employee_id: string;
  full_name: string;
  user_code: string | null;
  role: Role;
  days: number;
  present: number;
  late: number;
  half_day: number;
  absent: number;
  leave: number;
  rate: number | null;
}

const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export default async function StaffAttendanceSummaryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  await requireRole("admin", "admin_manager", "principal");
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today().slice(0, 7);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_attendance_summary", { p_from: `${month}-01`, p_to: lastDayOf(month) });
  const rows = (data ?? []) as SummaryRow[];
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/attendance/staff" className="transition-colors hover:text-foreground">Staff & Faculty attendance</Link>}
        title={`Monthly summary · ${monthLabel}`}
        subtitle="Days marked per employee. Late counts as attended, a half day as half; leave is left out of the rate."
        action={
          <CsvButton
            filename={`staff-attendance-${month}.csv`}
            rows={rows.map((r) => ({
              employee: r.full_name, employee_id: r.user_code, role: ROLE_LABEL[r.role], days_marked: r.days, present: r.present,
              late: r.late, half_day: r.half_day, absent: r.absent, leave: r.leave, rate: r.rate ?? "",
            }))}
          />
        }
      />
      {error && <Alert tone="danger" className="mb-5">{error.message}</Alert>}
      <form className="mb-4 flex flex-wrap items-end gap-3">
        <Label label="Month"><Input name="month" type="month" defaultValue={month} required /></Label>
        <button className={buttonClass("outline")}>Show</button>
      </form>
      <Card>
        <Table head={["Employee", "Days marked", "Present", "Late", "Half day", "Absent", "Leave", "Attendance"]} empty={!rows.length}>
          {rows.map((r) => (
            <tr key={r.employee_id}>
              <Td>
                <p className="font-medium">{r.full_name || "—"}</p>
                <p className="text-xs text-muted-foreground"><span className="font-mono">{r.user_code}</span> · {ROLE_LABEL[r.role]}</p>
              </Td>
              <Td>{r.days}</Td>
              <Td>{r.present}</Td>
              <Td>{r.late}</Td>
              <Td>{r.half_day}</Td>
              <Td className={r.absent ? "font-medium text-danger" : undefined}>{r.absent}</Td>
              <Td>{r.leave}</Td>
              <Td className="font-medium">{pct(r.rate)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
