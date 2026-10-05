import { CsvButton } from "@/components/CsvButton";
import { Badge, Card, CardTitle, PageHeader, Progress, Stat, Table, Td } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { CourseStat } from "@/lib/types";
import { pct } from "@/lib/utils";

/** Analytics + report table built on the course_stats() RPC (scoped by role in the database). */
export async function CourseAnalytics({ title, subtitle }: { title: string; subtitle: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("course_stats");
  const stats = (data ?? []) as CourseStat[];
  const live = stats.filter((s) => s.status === "published");
  const avg = (key: keyof CourseStat) => (live.length ? live.reduce((t, s) => t + Number(s[key]), 0) / live.length : null);

  const ranked = [...live].sort((a, b) => Number(b.completion_rate) - Number(a.completion_rate));

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <CsvButton
            filename={`course-report-${new Date().toISOString().slice(0, 10)}.csv`}
            rows={stats.map((s) => ({
              course: s.title,
              professor: s.professor_name,
              status: s.status,
              enrolled: s.enrolled,
              lectures: s.lectures,
              completion_rate: s.completion_rate,
              avg_quiz_score: s.avg_quiz_score,
              submission_rate: s.submission_rate,
            }))}
          />
        }
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Published courses" value={live.length} />
        <Stat label="Enrolments" value={live.reduce((t, s) => t + Number(s.enrolled), 0)} />
        <Stat label="Avg completion" value={pct(avg("completion_rate"))} />
        <Stat label="Avg quiz score" value={pct(avg("avg_quiz_score"))} />
      </div>

      <Card className="mt-6">
        <CardTitle>Completion by course</CardTitle>
        {ranked.length ? (
          <div className="space-y-3">
            {ranked.map((s) => (
              <div key={s.course_id} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3 text-sm sm:grid-cols-[14rem_minmax(0,1fr)_3rem]">
                <span className="truncate font-medium sm:col-auto">{s.title}</span>
                <div className="col-span-2 sm:col-span-1 sm:order-none"><Progress value={Number(s.completion_rate)} /></div>
                <span className="text-right tabular-nums">{pct(s.completion_rate)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No published courses yet.</p>
        )}
      </Card>

      <Card className="mt-6">
        <CardTitle>Course report</CardTitle>
        <Table head={["Course", "Professor", "Status", "Students", "Lectures", "Completion", "Quiz avg", "Submission rate"]} empty={!stats.length}>
          {stats.map((s) => (
            <tr key={s.course_id}>
              <Td className="font-medium">{s.title}</Td>
              <Td>{s.professor_name}</Td>
              <Td><Badge value={s.status} /></Td>
              <Td className="tabular-nums">{s.enrolled}</Td>
              <Td className="tabular-nums">{s.lectures}</Td>
              <Td className="tabular-nums">{pct(s.completion_rate)}</Td>
              <Td className="tabular-nums">{pct(s.avg_quiz_score)}</Td>
              <Td className="tabular-nums">{pct(s.submission_rate)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
