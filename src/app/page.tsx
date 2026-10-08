import Link from "next/link";
import { BRAND, BrandLockup, Crest } from "@/components/Brand";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpenCheck,
  ClipboardCheck,
  Crown,
  FileStack,
  GraduationCap,
  Landmark,
  ListChecks,
  Lock,
  ShieldCheck,
  Users,
} from "lucide-react";
import { DemoLogin } from "@/components/DemoLogin";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge, LinkButton, Progress } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/types";

const PORTALS = [
  {
    Icon: Crown,
    title: "Super Admin",
    text: "Full system access: create and onboard users, assign IDs and categories, offboard leavers and configure approval workflows.",
  },
  {
    Icon: ShieldCheck,
    title: "Admin",
    text: "Activate accounts, approve courses, configure KPIs, manage alerts and review the full audit trail.",
  },
  {
    Icon: Users,
    title: "Admin Manager",
    text: "Run admissions, student records and ID cards, fees and payments, enrollment, and certificate lists for the Principal.",
  },
  {
    Icon: Landmark,
    title: "Principal",
    text: "Approve courses before they go live and oversee every course, student result and KPI across the institution.",
  },
  {
    Icon: BookOpenCheck,
    title: "Faculty",
    text: "Build courses with lectures, videos, PDFs and worksheets. Create assignments and quizzes, grade and track progress.",
  },
  {
    Icon: GraduationCap,
    title: "Student",
    text: "Follow assigned courses, mark lectures complete, submit assignments and take quizzes with instant scores.",
  },
];

const FEATURES = [
  { Icon: ListChecks, title: "Approval workflows", text: "Draft, submit, approve or reject through configurable steps such as Admin then Principal. Nothing reaches students unapproved." },
  { Icon: FileStack, title: "Rich course content", text: "Lectures with videos, PDFs, books, notes and worksheets, all stored securely." },
  { Icon: ClipboardCheck, title: "Question bank & quizzes", text: "Shared bank of questions with automatic, tamper-proof grading." },
  { Icon: BarChart3, title: "Analytics & reports", text: "Completion, quiz and submission rates per course, exportable to CSV." },
  { Icon: BellRing, title: "KPI alerts", text: "Set thresholds and alert Faculty automatically when a course falls behind." },
  { Icon: Lock, title: "Secure by design", text: "Row-level security in the database: every role sees only what it should." },
];

const STEPS = [
  { title: "Faculty build", text: "Create a course, add lectures and materials, then submit it for approval." },
  { title: "Principal approves", text: "Review the outline and content, then publish it or send it back with notes." },
  { title: "Students learn", text: "Assigned students get notified, study, submit work and take quizzes." },
  { title: "Everyone tracks", text: "Faculty grade, students follow their progress, the principal and admins watch the KPIs." },
];

const PREVIEW_ROWS = [
  { course: "Introduction to Programming", prof: "Dr. Haddad", status: "published", completion: 75 },
  { course: "Calculus I", prof: "Prof. Mensah", status: "pending_approval", completion: 0 },
  { course: "Modern World History", prof: "Dr. Okafor", status: "published", completion: 62 },
  { course: "Organic Chemistry", prof: "Prof. Lindqvist", status: "draft", completion: 0 },
];

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent"><span className="h-px w-6 bg-accent" aria-hidden />{eyebrow}</p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-primary sm:text-[2.1rem]">{title}</h2>
      {text && <p className="mt-3 text-muted-foreground">{text}</p>}
    </div>
  );
}

export default async function Home() {
  const profile = await getProfile();
  if (profile) redirect(profile.status === "active" ? ROLE_HOME[profile.role] : "/pending");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandLockup crestClass="h-11" />
          </Link>
          <nav className="ml-auto hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {[["#portals", "Portals"], ["#features", "Features"], ["#workflow", "How it works"], ["#demo", "Demo"]].map(([href, label]) => (
              <a key={href} href={href} className="transition-colors hover:text-foreground">{label}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-4">
            <ThemeToggle />
            <LinkButton href="/login" size="sm">Sign in</LinkButton>
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:py-24">
          <div className="animate-fade-in">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Lahore Garrison Institute of Technical Education</p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.1] text-primary sm:text-[3.4rem]">
              Every course, every learner, <span className="text-accent">one system.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Big SMS connects administrators, principals, Faculty and students, from course approval to the final grade.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/login#demo" className="h-10 px-5">
                Try the live demo <ArrowRight size={16} />
              </LinkButton>
              <LinkButton href="/signup" variant="outline" className="h-10 px-5">Create an account</LinkButton>
            </div>
          </div>

          {/* Product preview: a faithful miniature of the admin dashboard, not decoration. */}
          <div className="animate-fade-in overflow-hidden rounded-lg border border-border bg-surface shadow-pop [animation-delay:80ms]" aria-hidden>
            <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="ml-3 text-xs text-muted-foreground">Admin Portal · Dashboard</span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
              {[["Active students", "1,248"], ["Courses to approve", "3"], ["Avg completion", "71%"]].map(([l, v]) => (
                <div key={l} className="px-4 py-3">
                  <p className="text-[11px] text-muted-foreground">{l}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Course</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Faculty</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="w-28 px-4 py-2 font-medium">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PREVIEW_ROWS.map((r) => (
                  <tr key={r.course}>
                    <td className="px-4 py-2.5 font-medium">{r.course}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{r.prof}</td>
                    <td className="px-4 py-2.5"><Badge value={r.status} /></td>
                    <td className="px-4 py-2.5">
                      {r.completion ? <Progress value={r.completion} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="portals" className="mx-auto max-w-6xl scroll-mt-14 px-4 py-16 sm:px-6 lg:py-20">
        <SectionHeading eyebrow="Portals" title="A focused workspace for every role" text="Each role sees exactly the tools and data it needs, and nothing it shouldn't." />
        <div className="mt-10 grid overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 [&>*]:bg-surface" style={{ gap: 1 }}>
          {PORTALS.map(({ Icon, title, text }) => (
            <div key={title} className="p-6">
              <Icon size={20} className="text-accent" aria-hidden />
              <h3 className="mt-4 font-semibold text-primary">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="scroll-mt-14 border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <SectionHeading eyebrow="Features" title="Everything a modern institution needs" />
          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ Icon, title, text }) => (
              <div key={title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Icon size={18} aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-6xl scroll-mt-14 px-4 py-16 sm:px-6 lg:py-20">
        <SectionHeading eyebrow="How it works" title="From draft to final grade" />
        <ol className="mt-10 grid gap-8 md:grid-cols-4 md:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t-2 border-accent pt-5">
              <span className="text-xs font-semibold tabular-nums text-accent">0{i + 1}</span>
              <h3 className="mt-1 font-semibold text-primary">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="demo" className="scroll-mt-14 bg-primary text-primary-foreground [&_.text-accent]:text-gold [&_.bg-accent]:bg-gold [&_h2]:text-primary-foreground [&_p.text-muted-foreground]:text-primary-foreground/80">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
          <SectionHeading
            eyebrow="Live demo"
            title="See it in action"
            text="Sign in instantly as any role, no password needed. The demo is loaded with courses, lectures, assignments, quizzes and grades."
          />
          <div className="rounded-lg bg-surface p-4 text-foreground shadow-pop">
            <DemoLogin />
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <div className="flex items-center gap-3">
            <Crest className="h-10" />
            <span>{BRAND.product} · © {new Date().getFullYear()} {BRAND.name}</span>
          </div>
          <div className="flex gap-5">
            <Link href="/login" className="transition-colors hover:text-foreground">Sign in</Link>
            <Link href="/signup" className="transition-colors hover:text-foreground">Create account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
