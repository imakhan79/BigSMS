import { EVENT_SELECT, MonthCalendar, monthParam, SLOT_SELECT, WeekTimetable, type CalendarEvent, type CalendarExam, type Slot } from "@/components/Timetable";
import { PageHeader, Tabs } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** The student's own timetable: their courses' classes (and their class's), the calendar and their exams. */
export default async function StudentTimetablePage({ searchParams }: { searchParams: Promise<{ view?: string; month?: string }> }) {
  const params = await searchParams;
  await requireRole("student");
  const view = params.view === "calendar" ? "calendar" : "week";
  const month = monthParam(params.month);
  const supabase = await createClient();
  // Row level security limits these to the student's own classes, calendar and exams.
  const [{ data: slots }, { data: events }, { data: exams }] = await Promise.all([
    supabase.from("timetable_slots").select(SLOT_SELECT).eq("state", "live"),
    supabase.from("calendar_events").select(EVENT_SELECT).eq("state", "live"),
    supabase.from("exams").select("id, title, held_on, course:courses(title)"),
  ]);
  const weekly = (slots ?? []) as unknown as Slot[];

  return (
    <>
      <PageHeader title="My timetable" subtitle="Your classes for the week and the academic calendar." />
      <Tabs
        items={[
          { href: "/student/timetable", label: "Weekly schedule", active: view === "week" },
          { href: `/student/timetable?view=calendar&month=${month}`, label: "Calendar", active: view === "calendar" },
        ]}
      />
      {view === "week" ? (
        <WeekTimetable slots={weekly} courseHref={(id) => `/student/courses/${id}`} empty="Your classes will appear here once the timetable is published." />
      ) : (
        <MonthCalendar
          month={month}
          href={(m) => `/student/timetable?view=calendar&month=${m}`}
          slots={weekly}
          events={(events ?? []) as unknown as CalendarEvent[]}
          exams={(exams ?? []) as unknown as CalendarExam[]}
        />
      )}
    </>
  );
}
