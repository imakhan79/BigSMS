import Link from "next/link";
import { Card, Empty, Progress } from "@/components/ui";
import type { StudentProgress } from "@/lib/types";
import { pct } from "@/lib/utils";

/** Course cards built from student_progress(); used by the student portal. */
export function ProgressCards({ rows, hrefBase }: { rows: StudentProgress[]; hrefBase?: string }) {
  if (!rows.length) return <Empty>No assigned courses yet.</Empty>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((c) => {
        const body = (
          <Card className="h-full transition-colors duration-150 hover:border-foreground/20">
            <h3 className="font-semibold text-foreground">{c.title}</h3>
            <p className="text-xs text-muted-foreground">{c.professor_name}</p>
            <div className="mt-4 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Lectures {c.lectures_done}/{c.lectures_total}</span>
                <span className="font-medium tabular-nums text-foreground">{pct(c.completion_rate)}</span>
              </div>
              <Progress value={c.completion_rate} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border px-3 py-2 text-muted-foreground">Quiz avg <span className="block text-base font-semibold tabular-nums text-foreground">{pct(c.quiz_avg)}</span></div>
              <div className="rounded-md border border-border px-3 py-2 text-muted-foreground">Assignment avg <span className="block text-base font-semibold tabular-nums text-foreground">{pct(c.assignment_avg)}</span></div>
            </div>
          </Card>
        );
        return hrefBase ? <Link key={c.course_id} href={`${hrefBase}/${c.course_id}`}>{body}</Link> : <div key={c.course_id}>{body}</div>;
      })}
    </div>
  );
}
