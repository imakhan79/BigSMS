import Image from "next/image";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

const POINTS = [
  "Course approval workflows with a full audit trail",
  "Dedicated portals for every role, from principal to parent",
  "Progress, grades and KPI alerts in real time",
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="hidden flex-col justify-between border-r border-border bg-primary p-12 text-primary-foreground lg:flex dark:bg-sidebar dark:text-sidebar-foreground">
        <Link href="/" className="w-fit overflow-hidden rounded-md shadow-pop">
          <Image src="/zicon-logo.png" alt="Zicon" width={391} height={228} className="h-24 w-auto" priority />
        </Link>
        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Big SMS</p>
          <h2 className="mt-3 font-display text-[2.1rem] font-semibold leading-tight">The operating system for your institution.</h2>
          <ul className="mt-8 space-y-3 text-sm text-primary-foreground/85 dark:text-muted-foreground">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/55 dark:text-muted-foreground">© {new Date().getFullYear()} Zicon. All rights reserved.</p>
      </aside>
      <main className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-[400px] animate-fade-in">
          <Link href="/" className="mb-8 flex justify-center lg:hidden">
            <Image src="/zicon-logo.png" alt="Zicon" width={391} height={228} className="h-16 w-auto rounded-md" priority />
          </Link>
          <div className="rounded-lg border border-border bg-surface p-6 shadow-xs sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
