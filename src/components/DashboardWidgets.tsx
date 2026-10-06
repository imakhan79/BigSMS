import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, ArrowUpRight, GraduationCap } from "lucide-react";
import { Avatar, Card, CardTitle, Empty, Progress, TextLink } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/utils";

/* ─── Quick actions ───────────────────────────────────────────────────── */

export interface QuickAction {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <section aria-labelledby="quick-actions" className="mb-6">
      <h2 id="quick-actions" className="sr-only">Quick actions</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-xs transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:border-primary/30 hover:bg-secondary/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
              {a.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{a.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
            </span>
            <ArrowUpRight size={16} className="shrink-0 text-muted-foreground transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─── Recent activity (admins: audit log) ─────────────────────────────── */

const NOUN: Record<string, string> = {
  profiles: "user",
  parent_students: "parent link",
  course_categories: "category",
  courses: "course",
  enrollments: "enrollment",
  kpi_definitions: "KPI",
  alerts: "alert",
  system_settings: "setting",
  approval_steps: "approval step",
};

type Log = { id: number; actor_id: string | null; action: string; table_name: string; old_data: any; new_data: any; created_at: string };

function describe(l: Log) {
  const row = l.new_data ?? l.old_data ?? {};
  const subject = row.title ?? row.full_name ?? row.name ?? row.key ?? row.email ?? null;
  const noun = NOUN[l.table_name] ?? l.table_name.replace(/_/g, " ");
  if (l.action === "UPDATE" && l.old_data && l.new_data) {
    if (l.old_data.status !== l.new_data.status && l.new_data.status) {
      return { verb: `set ${noun} status to ${String(l.new_data.status).replace(/_/g, " ")}`, subject };
    }
    if (l.old_data.role !== l.new_data.role && l.new_data.role) {
      return { verb: `changed role to ${String(l.new_data.role).replace(/_/g, " ")}`, subject };
    }
  }
  const verb = l.action === "INSERT" ? "created" : l.action === "DELETE" ? "deleted" : "updated";
  return { verb: `${verb} ${noun}`, subject };
}

export async function RecentActivity({ limit = 7 }: { limit?: number }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, actor_id, action, table_name, old_data, new_data, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  const logs = (data ?? []) as Log[];
  const ids = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[];
  const { data: actors } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const name = (id: string | null) => {
    if (!id) return "System";
    const a = actors?.find((p) => p.id === id);
    return a ? a.full_name || a.email : "Unknown user";
  };

  return (
    <Card>
      <CardTitle action={<TextLink href="/admin/audit-logs">View all</TextLink>}>Recent activity</CardTitle>
      {!logs.length ? (
        <Empty compact icon={<Activity size={18} />} title="No activity yet">Changes to users, courses and settings will appear here.</Empty>
      ) : (
        <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-4 before:top-2 before:w-px before:bg-border">
          {logs.map((l) => {
            const { verb, subject } = describe(l);
            const who = name(l.actor_id);
            return (
              <li key={l.id} className="relative flex gap-3">
                <Avatar name={who} className="relative h-8 w-8 ring-4 ring-surface" />
                <div className="min-w-0 pt-0.5 text-sm">
                  <p className="text-foreground">
                    <span className="font-medium">{who}</span> <span className="text-muted-foreground">{verb}</span>
                    {subject && <span className="font-medium"> {String(subject)}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={l.created_at}>{timeAgo(l.created_at)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/* ─── Student performance (overseers: quiz + graded assignment scores) ─── */

export async function StudentPerformance({ reportHref }: { reportHref: string }) {
  const supabase = await createClient();
  const [{ data: attempts }, { data: graded }, { data: students }] = await Promise.all([
    supabase.from("quiz_attempts").select("student_id, score, total"),
    supabase.from("submissions").select("student_id, score, assignments(max_score)").eq("status", "graded"),
    supabase.from("profiles").select("id, full_name, email").eq("role", "student").eq("status", "active"),
  ]);

  const scores = new Map<string, number[]>();
  const add = (id: string, value: number) => {
    if (!Number.isFinite(value)) return;
    scores.set(id, [...(scores.get(id) ?? []), value]);
  };
  attempts?.forEach((a) => a.total > 0 && add(a.student_id, (a.score / a.total) * 100));
  graded?.forEach((s: any) => s.assignments?.max_score > 0 && s.score != null && add(s.student_id, (Number(s.score) / s.assignments.max_score) * 100));

  const ranked = (students ?? [])
    .map((s) => {
      const list = scores.get(s.id);
      return { id: s.id, name: s.full_name || s.email, avg: list?.length ? list.reduce((t, v) => t + v, 0) / list.length : null, count: list?.length ?? 0 };
    })
    .filter((s) => s.avg != null)
    .sort((a, b) => b.avg! - a.avg!);

  const bands = [
    { label: "Excellent", hint: "80% and above", count: ranked.filter((s) => s.avg! >= 80).length, tone: "bg-success" },
    { label: "On track", hint: "60–79%", count: ranked.filter((s) => s.avg! >= 60 && s.avg! < 80).length, tone: "bg-accent" },
    { label: "Needs support", hint: "below 60%", count: ranked.filter((s) => s.avg! < 60).length, tone: "bg-danger" },
  ];
  const total = ranked.length;
  const overall = total ? ranked.reduce((t, s) => t + s.avg!, 0) / total : null;

  return (
    <Card>
      <CardTitle description="Average of quiz and graded assignment scores" action={<TextLink href={reportHref}>Full report</TextLink>}>
        Student performance
      </CardTitle>
      {!total ? (
        <Empty compact icon={<GraduationCap size={18} />} title="No scores yet">Performance appears once students take quizzes or get assignments graded.</Empty>
      ) : (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-primary">{overall!.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground">overall average · {total} {total === 1 ? "student" : "students"} assessed</p>
            </div>
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={bands.map((b) => `${b.label}: ${b.count}`).join(", ")}>
            {bands.map((b) => b.count > 0 && <div key={b.label} className={b.tone} style={{ width: `${(b.count / total) * 100}%` }} />)}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {bands.map((b) => (
              <div key={b.label}>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${b.tone}`} aria-hidden />
                  {b.label}
                </dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {b.count} <span className="text-xs font-normal text-muted-foreground">{b.hint}</span>
                </dd>
              </div>
            ))}
          </dl>
          <ul className="mt-5 divide-y divide-border border-t border-border">
            {ranked.slice(0, 5).map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-4 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                <div className="hidden w-28 shrink-0 sm:block">
                  <Progress value={s.avg!} />
                </div>
                <span className="w-10 text-right tabular-nums font-medium">{s.avg!.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
