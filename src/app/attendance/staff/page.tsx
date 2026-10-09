import Link from "next/link";
import { saveStaffAttendance } from "@/app/attendance/actions";
import { CsvButton } from "@/components/CsvButton";
import { Alert, Badge, buttonClass, Card, CardTitle, Filters, Flash, type FlashParams, Input, Label, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type Role, STAFF_ATTENDANCE_STATUSES } from "@/lib/types";
import { formatDay, today } from "@/lib/utils";

interface RegisterRow {
  employee_id: string;
  full_name: string;
  user_code: string | null;
  role: Role;
  department: string;
  status: string | null;
  check_in: string | null;
  check_out: string | null;
  note: string | null;
}

const GROUPS = { all: "All", faculty: "Faculty", staff: "Staff", office: "Administration" } as const;
const inGroup = (role: Role, group: string) =>
  group === "all" || (group === "faculty" ? role === "professor" : group === "staff" ? role === "staff" : !["professor", "staff"].includes(role));

/** "09:00:00" -> "09:00" for time inputs. */
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export default async function StaffAttendancePage({ searchParams }: { searchParams: Promise<FlashParams & { date?: string; group?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole("admin", "admin_manager", "principal");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") && params.date! <= today() ? params.date! : today();
  const group = params.group && params.group in GROUPS ? params.group : "all";
  const canMark = profile.role === "principal" || profile.role === "admin_manager";
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("staff_attendance_register", { p_day: day });
  const all = (data ?? []) as RegisterRow[];
  const rows = all.filter((r) => inGroup(r.role, group));
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const unmarked = all.filter((r) => !r.status).length;
  const href = (d: string, g = group) => `/attendance/staff?date=${d}&group=${g}`;

  return (
    <>
      <PageHeader
        title="Staff & Faculty attendance"
        subtitle={`Daily register for ${formatDay(day)}. ${canMark ? "The Principal and the Admin Manager mark attendance; nobody marks their own." : "Read-only. The Principal and the Admin Manager mark attendance."}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/attendance/staff/summary?month=${day.slice(0, 7)}`} className={buttonClass("outline")}>Monthly summary</Link>
            <CsvButton
              filename={`staff-attendance-${day}.csv`}
              rows={all.map((r) => ({
                date: day, employee: r.full_name, employee_id: r.user_code, role: ROLE_LABEL[r.role], department: r.department,
                status: r.status ? STAFF_ATTENDANCE_STATUSES[r.status] : "Not marked", check_in: hhmm(r.check_in), check_out: hhmm(r.check_out), note: r.note ?? "",
              }))}
            />
          </div>
        }
      />
      <Flash params={params} />
      {error && <Alert tone="danger" className="mb-5">{error.message}</Alert>}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
        <Stat label="Present" value={count("present")} />
        <Stat label="Late" value={count("late")} />
        <Stat label="Half day" value={count("half_day")} />
        <Stat label="Absent" value={count("absent")} />
        <Stat label="Leave" value={count("leave")} />
        <Stat label="Not marked" value={unmarked} />
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <form className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="group" value={group} />
          <Label label="Date"><Input name="date" type="date" max={today()} defaultValue={day} required /></Label>
          <button className={buttonClass("outline")}>Show</button>
        </form>
        <Filters label="Show" items={Object.entries(GROUPS).map(([k, v]) => ({ href: href(day, k), label: v, active: group === k }))} />
      </div>

      <Card>
        {canMark ? (
          <form action={saveStaffAttendance} className="space-y-4">
            <input type="hidden" name="day" value={day} />
            <Table head={["Employee", "Status", "Check in", "Check out", "Note"]} empty={!rows.length}>
              {rows.map((r) => {
                const self = r.employee_id === profile.id;
                return (
                  <tr key={r.employee_id}>
                    <Td><Person row={r} /></Td>
                    {self ? (
                      <Td colSpan={4} className="text-xs text-muted-foreground">
                        {r.status && <span className="mr-2"><Badge value={r.status}>{STAFF_ATTENDANCE_STATUSES[r.status]}</Badge></span>}
                        Your own attendance is marked by the {profile.role === "principal" ? "Admin Manager" : "Principal"}.
                      </Td>
                    ) : (
                      <>
                        <Td>
                          <input type="hidden" name="employee_id" value={r.employee_id} />
                          <Select name={`status_${r.employee_id}`} defaultValue={r.status ?? ""} aria-label={`Status for ${r.full_name}`} className="w-32">
                            <option value="">Not marked</option>
                            {Object.entries(STAFF_ATTENDANCE_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </Select>
                        </Td>
                        <Td><Input name={`in_${r.employee_id}`} type="time" defaultValue={hhmm(r.check_in)} aria-label={`Check in for ${r.full_name}`} className="w-28" /></Td>
                        <Td><Input name={`out_${r.employee_id}`} type="time" defaultValue={hhmm(r.check_out)} aria-label={`Check out for ${r.full_name}`} className="w-28" /></Td>
                        <Td><Input name={`note_${r.employee_id}`} defaultValue={r.note ?? ""} aria-label={`Note for ${r.full_name}`} className="min-w-40" /></Td>
                      </>
                    )}
                  </tr>
                );
              })}
            </Table>
            {!!rows.length && (
              <div className="flex flex-wrap gap-2">
                <button className={buttonClass("primary")}>Save attendance</button>
                <button name="fill" value="present" className={buttonClass("outline")}>Save, marking the rest present</button>
              </div>
            )}
          </form>
        ) : (
          <Table head={["Employee", "Status", "Check in", "Check out", "Note"]} empty={!rows.length}>
            {rows.map((r) => (
              <tr key={r.employee_id}>
                <Td><Person row={r} /></Td>
                <Td>{r.status ? <Badge value={r.status}>{STAFF_ATTENDANCE_STATUSES[r.status]}</Badge> : <span className="text-xs text-muted-foreground">Not marked</span>}</Td>
                <Td>{hhmm(r.check_in) || "—"}</Td>
                <Td>{hhmm(r.check_out) || "—"}</Td>
                <Td className="text-xs text-muted-foreground">{r.note || "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function Person({ row }: { row: RegisterRow }) {
  return (
    <>
      <p className="font-medium">{row.full_name || "—"}</p>
      <p className="text-xs text-muted-foreground">
        <span className="font-mono">{row.user_code}</span> · {ROLE_LABEL[row.role]}{row.department ? ` · ${row.department}` : ""}
      </p>
    </>
  );
}
