import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  BellRing,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
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
import { LinkButton } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/types";

const PORTALS = [
  {
    Icon: ShieldCheck,
    title: "Admin",
    text: "Activate accounts, approve courses, configure KPIs, manage alerts and review the full audit trail.",
  },
  {
    Icon: Landmark,
    title: "Principal",
    text: "Approve courses before they go live and oversee every course, student result and KPI across the institution.",
  },
  {
    Icon: BookOpenCheck,
    title: "Professor",
    text: "Build courses with lectures, videos, PDFs and worksheets. Create assignments and quizzes, grade and track progress.",
  },
  {
    Icon: GraduationCap,
    title: "Student",
    text: "Follow assigned courses, mark lectures complete, submit assignments and take quizzes with instant scores.",
  },
  {
    Icon: Users,
    title: "Parent",
    text: "See exactly what your child sees: courses, progress, grades and teacher feedback. Read-only and private.",
  },
];

const FEATURES = [
  { Icon: ListChecks, title: "Approval workflows", text: "Draft, submit, approve or reject. Nothing reaches students without admin sign-off." },
  { Icon: FileStack, title: "Rich course content", text: "Lectures with videos, PDFs, books, notes and worksheets, all stored securely." },
  { Icon: ClipboardCheck, title: "Question bank & quizzes", text: "Shared bank of questions with automatic, tamper-proof grading." },
  { Icon: BarChart3, title: "Analytics & reports", text: "Completion, quiz and submission rates per course, exportable to CSV." },
  { Icon: BellRing, title: "KPI alerts", text: "Set thresholds and alert professors automatically when a course falls behind." },
  { Icon: Lock, title: "Secure by design", text: "Row-level security in the database: every role sees only what it should." },
];

const STEPS = [
  { title: "Professor builds", text: "Create a course, add lectures and materials, then submit it for approval." },
  { title: "Principal approves", text: "Review the outline and content, then publish it or send it back with notes." },
  { title: "Students learn", text: "Assigned students get notified, study, submit work and take quizzes." },
  { title: "Everyone tracks", text: "Professors grade, parents follow along, the principal and admins watch the KPIs." },
];

export default async function Home() {
  const profile = await getProfile();
  if (profile) redirect(profile.status === "active" ? ROLE_HOME[profile.role] : "/pending");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/zicon-logo.png" alt="Zicon" width={96} height={56} className="h-10 w-auto rounded" priority />
            <span className="hidden font-bold text-primary sm:inline">Big SMS</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 text-sm md:flex">
            <a href="#portals" className="hover:text-primary">Portals</a>
            <a href="#features" className="hover:text-primary">Features</a>
            <a href="#workflow" className="hover:text-primary">How it works</a>
            <a href="#demo" className="hover:text-primary">Demo</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ThemeToggle />
            <LinkButton href="/login" size="sm">Sign in</LinkButton>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-secondary via-background to-accent/15">
        <div className="absolute -right-32 top-10 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-primary">
              <CheckCircle2 size={14} className="text-accent" /> Learning management by Zicon
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-primary sm:text-5xl">
              Every course, every learner, <span className="text-accent">one system.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Big SMS connects administrators, principals, professors, students and parents, from course approval to the final grade.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/login#demo" variant="accent" className="h-12 px-6 text-base">Try the live demo</LinkButton>
              <LinkButton href="/signup" variant="outline" className="h-12 px-6 text-base">Create an account</LinkButton>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold text-primary">Introduction to Programming</p>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">Published</span>
            </div>
            {[
              ["Lecture completion", 75],
              ["Average quiz score", 75],
              ["Assignments submitted", 100],
            ].map(([label, value]) => (
              <div key={label} className="mb-4">
                <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-semibold">{value}%</span></div>
                <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-accent" style={{ width: `${value}%` }} /></div>
              </div>
            ))}
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[["3", "Students"], ["4", "Lectures"], ["18/20", "Top grade"]].map(([v, l]) => (
                <div key={l} className="rounded-lg bg-secondary p-3">
                  <p className="text-xl font-bold text-primary">{v}</p>
                  <p className="text-xs text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="portals" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20">
        <h2 className="text-center text-3xl font-bold text-primary">Five portals, one platform</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">Each role gets a focused workspace with exactly the tools and data it needs.</p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {PORTALS.map(({ Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-border bg-background p-6 shadow-sm transition-shadow hover:shadow-md">
              <span className="inline-flex rounded-lg bg-primary p-2.5 text-primary-foreground"><Icon size={22} /></span>
              <h3 className="mt-4 text-lg font-semibold text-primary">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="scroll-mt-16 bg-secondary/50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold text-primary">Everything a modern institution needs</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ Icon, title, text }) => (
              <div key={title} className="flex gap-4 rounded-xl bg-background p-6 shadow-sm">
                <Icon size={24} className="shrink-0 text-accent" />
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20">
        <h2 className="text-center text-3xl font-bold text-primary">How it works</h2>
        <ol className="mt-12 grid gap-6 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-xl border border-border p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground">{i + 1}</span>
              <h3 className="mt-4 font-semibold text-primary">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="demo" className="scroll-mt-16 bg-primary py-20 text-primary-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">See it in action</h2>
            <p className="mt-3 text-primary-foreground/80">
              Sign in instantly as any role, no password needed. The demo is loaded with courses, lectures, assignments, quizzes and grades.
            </p>
          </div>
          <div className="rounded-xl bg-background p-5 text-foreground shadow-xl">
            <DemoLogin />
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <Image src="/zicon-logo.png" alt="Zicon" width={72} height={42} className="h-8 w-auto rounded" />
            <span>Big SMS · © {new Date().getFullYear()} Zicon</span>
          </div>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-primary">Sign in</Link>
            <Link href="/signup" className="hover:text-primary">Create account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
