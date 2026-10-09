import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Card, CardTitle, Empty } from "@/components/ui";
import { cn, today } from "@/lib/utils";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const EVENT_KINDS: Record<string, string> = { holiday: "Holiday", exam: "Exams", event: "Event", term: "Term" };
const EVENT_TONE: Record<string, "danger" | "warning" | "info" | "brand"> = { holiday: "danger", exam: "warning", event: "info", term: "brand" };

export const hhmm = (t: string) => t.slice(0, 5);

export interface Slot {
  id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  room: string;
  batch_id: string | null;
  course: { id: string; title: string; code: string } | null;
  batch: { name: string } | null;
  faculty?: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  kind: string;
  starts_on: string;
  ends_on: string;
  notes: string;
  course: { title: string } | null;
}

export interface CalendarExam {
  id: string;
  title: string;
  held_on: string;
  course: { title: string } | null;
}

export const SLOT_SELECT = "id, weekday, starts_at, ends_at, room, batch_id, course:courses(id, title, code), batch:course_batches(name)";
export const EVENT_SELECT = "id, title, kind, starts_on, ends_on, notes, course:courses(title)";

/** The week's classes, one card per day. */
export function WeekTimetable({ slots, courseHref, empty }: { slots: Slot[]; courseHref?: (courseId: string) => string; empty: string }) {
  if (!slots.length) return <Empty icon={<CalendarDays size={18} />} title="No classes scheduled">{empty}</Empty>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {WEEKDAYS.map((day, i) => {
        const daySlots = slots.filter((s) => s.weekday === i + 1).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        if (!daySlots.length) return null;
        return (
          <Card key={day}>
            <CardTitle>{day}</CardTitle>
            <ul className="divide-y divide-border text-sm">
              {daySlots.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    {courseHref && s.course ? (
                      <Link href={courseHref(s.course.id)} className="font-medium hover:underline">{s.course.title}</Link>
                    ) : (
                      <p className="font-medium">{s.course?.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {[s.batch?.name ? `Class ${s.batch.name}` : null, s.room || "Room not set", s.faculty].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-mono text-xs">{hhmm(s.starts_at)}–{hhmm(s.ends_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * A month calendar: calendar events, exams and the weekly classes on each day (no classes on
 * holidays). `month` is YYYY-MM; `href` builds the link for another month.
 */
export function MonthCalendar({
  month,
  href,
  slots,
  events,
  exams = [],
}: {
  month: string;
  href: (month: string) => string;
  slots: Slot[];
  events: CalendarEvent[];
  exams?: CalendarExam[];
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const shift = (n: number) => isoDay(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
  const label = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const now = today();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => isoDay(new Date(Date.UTC(y, m - 1, i + 1))))];
  while (cells.length % 7) cells.push(null);

  return (
    <Card>
      <CardTitle
        action={
          <div className="flex items-center gap-1">
            <Link href={href(shift(-1))} className="rounded-md p-1.5 hover:bg-secondary" aria-label="Previous month"><ChevronLeft size={16} /></Link>
            <Link href={href(now.slice(0, 7))} className="rounded-md px-2 py-1 text-xs hover:bg-secondary">Today</Link>
            <Link href={href(shift(1))} className="rounded-md p-1.5 hover:bg-secondary" aria-label="Next month"><ChevronRight size={16} /></Link>
          </div>
        }
      >
        {label}
      </CardTitle>
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
          {WEEKDAYS.map((d) => <div key={d} className="bg-secondary/70 px-2 py-1.5 font-medium">{d.slice(0, 3)}</div>)}
          {cells.map((day, i) => {
            if (!day) return <div key={`blank-${i}`} className="min-h-24 bg-muted/40" />;
            const dayEvents = events.filter((e) => e.starts_on <= day && e.ends_on >= day);
            const holiday = dayEvents.some((e) => e.kind === "holiday");
            const weekday = ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
            const daySlots = holiday ? [] : slots.filter((s) => s.weekday === weekday).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            const dayExams = exams.filter((e) => e.held_on === day);
            return (
              <div key={day} className={cn("min-h-24 space-y-1 bg-surface p-1.5", holiday && "bg-danger/[0.04]")}>
                <p className={cn("text-right tabular-nums text-muted-foreground", day === now && "font-semibold text-accent")}>{Number(day.slice(8))}</p>
                {dayEvents.map((e) => (
                  <p key={e.id} className="truncate" title={e.notes || e.title}><Badge value={e.kind} tone={EVENT_TONE[e.kind]}>{e.title}</Badge></p>
                ))}
                {dayExams.map((e) => (
                  <p key={e.id} className="truncate font-medium text-warning" title={e.course?.title}>Exam: {e.title}</p>
                ))}
                {daySlots.map((s) => (
                  <p key={s.id} className="truncate" title={`${s.course?.title}${s.batch ? ` (${s.batch.name})` : ""} ${s.room}`}>
                    <span className="font-mono text-muted-foreground">{hhmm(s.starts_at)}</span> {s.course?.code || s.course?.title}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/** The month in the query string, or this month. */
export const monthParam = (value?: string) => (/^\d{4}-\d{2}$/.test(value ?? "") ? value! : today().slice(0, 7));
