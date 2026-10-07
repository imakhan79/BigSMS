import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card, CardTitle, Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const time = (t: string) => t.slice(0, 5);

/** The signed-in Faculty member's classes for the week. The timetable itself is set by the administration. */
export default async function ProfessorTimetablePage() {
  const profile = await requireRole("professor");
  const supabase = await createClient();
  const { data } = await supabase
    .from("timetable_slots")
    .select("id, weekday, starts_at, ends_at, room, course:courses!inner(id, title, professor_id, status)")
    .eq("course.professor_id", profile.id)
    .neq("course.status", "archived")
    .order("weekday")
    .order("starts_at");
  const slots = (data ?? []) as any[];

  return (
    <>
      <PageHeader title="Timetable" subtitle="Your classes for the week. The timetable is set by the administration." />
      {!slots.length ? (
        <Empty icon={<CalendarDays size={18} />} title="No classes scheduled">Your classes will appear here once the timetable is set.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WEEKDAYS.map((day, i) => {
            const today = slots.filter((s) => s.weekday === i + 1);
            if (!today.length) return null;
            return (
              <Card key={day}>
                <CardTitle>{day}</CardTitle>
                <ul className="divide-y divide-border text-sm">
                  {today.map((s) => (
                    <li key={s.id} className="flex items-start justify-between gap-3 py-2">
                      <div>
                        <Link href={`/professor/courses/${s.course.id}?tab=attendance`} className="font-medium hover:underline">{s.course.title}</Link>
                        <p className="text-xs text-muted-foreground">{s.room || "Room not set"}</p>
                      </div>
                      <span className="whitespace-nowrap font-mono text-xs">{time(s.starts_at)}–{time(s.ends_at)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
