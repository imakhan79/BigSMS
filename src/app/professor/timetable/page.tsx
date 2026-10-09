import { EVENT_SELECT, MonthCalendar, monthParam, SLOT_SELECT, WeekTimetable, type CalendarEvent, type CalendarExam, type Slot } from "@/components/Timetable";
import { PageHeader, Tabs } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** The published timetable of the Faculty member's own classes, as a week and as a calendar. */
export default async function ProfessorTimetablePage({ searchParams }: { searchParams: Promise<{ view?: string; month?: string }> }) {
  const params = await searchParams;
  const profile = await requireRole("professor");
  const view = params.view === "calendar" ? "calendar" : "week";
  const month = monthParam(params.month);
  const supabase = await createClient();
  const [{ data: slots }, { data: events }, { data: exams }] = await Promise.all([
    supabase
      .from("timetable_slots")
      .select(`${SLOT_SELECT}, owner:courses!inner(professor_id, status)`)
      .eq("state", "live")
      .eq("owner.professor_id", profile.id)
      .neq("owner.status", "archived"),
    supabase.from("calendar_events").select(EVENT_SELECT).eq("state", "live"),
    supabase.from("exams").select("id, title, held_on, course:courses!inner(title, professor_id)").eq("course.professor_id", profile.id),
  ]);
  const weekly = (slots ?? []) as unknown as Slot[];

  return (
    <>
      <PageHeader title="Timetable" subtitle="Your classes as published by the Principal or the Admin Manager." />
      <Tabs
        items={[
          { href: "/professor/timetable", label: "Weekly schedule", active: view === "week" },
          { href: `/professor/timetable?view=calendar&month=${month}`, label: "Calendar", active: view === "calendar" },
        ]}
      />
      {view === "week" ? (
        <WeekTimetable slots={weekly} courseHref={(id) => `/professor/courses/${id}?tab=attendance`} empty="Your classes will appear here once the timetable is published." />
      ) : (
        <MonthCalendar
          month={month}
          href={(m) => `/professor/timetable?view=calendar&month=${m}`}
          slots={weekly}
          events={(events ?? []) as unknown as CalendarEvent[]}
          exams={(exams ?? []) as unknown as CalendarExam[]}
        />
      )}
    </>
  );
}
