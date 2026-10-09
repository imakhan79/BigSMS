import { Badge, buttonClass, Card, Input, Label, PageHeader, Stat, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAFF_ATTENDANCE_STATUSES } from "@/lib/types";
import { formatDay, pct, today } from "@/lib/utils";

const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** An employee's own attendance, as marked by the Principal or the Admin Manager. */
export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole("admin", "admin_manager", "principal", "professor", "staff");
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today().slice(0, 7);
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_attendance")
    .select("attended_on, status, check_in, check_out, note")
    .eq("employee_id", profile.id)
    .gte("attended_on", `${month}-01`)
    .lte("attended_on", lastDayOf(month))
    .order("attended_on", { ascending: false });
  const rows = data ?? [];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const counted = rows.length - count("leave");
  const rate = counted ? (100 * (count("present") + count("late") + 0.5 * count("half_day"))) / counted : null;
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title="My attendance" subtitle={`${monthLabel}. Marked by the Principal or the Admin Manager.`} />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <Label label="Month"><Input name="month" type="month" defaultValue={month} max={today().slice(0, 7)} required /></Label>
        <button className={buttonClass("outline")}>Show</button>
      </form>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
        <Stat label="Attendance" value={pct(rate)} />
        <Stat label="Present" value={count("present")} />
        <Stat label="Late" value={count("late")} />
        <Stat label="Half day" value={count("half_day")} />
        <Stat label="Absent" value={count("absent")} />
        <Stat label="Leave" value={count("leave")} />
      </div>
      <Card>
        <Table head={["Date", "Status", "Check in", "Check out", "Note"]} empty={!rows.length}>
          {rows.map((r) => (
            <tr key={r.attended_on}>
              <Td className="font-medium">{formatDay(r.attended_on)}</Td>
              <Td><Badge value={r.status}>{STAFF_ATTENDANCE_STATUSES[r.status]}</Badge></Td>
              <Td>{r.check_in?.slice(0, 5) ?? "—"}</Td>
              <Td>{r.check_out?.slice(0, 5) ?? "—"}</Td>
              <Td className="text-xs text-muted-foreground">{r.note || "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
