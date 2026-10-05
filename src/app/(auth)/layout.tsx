import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <Link href="/" className="relative w-fit rounded-lg bg-white p-2">
          <Image src="/zicon-logo.png" alt="Zicon" width={150} height={86} className="h-12 w-auto" priority />
        </Link>
        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight">
            Big SMS
            <span className="block text-accent">Learning, managed.</span>
          </h2>
          <p className="mt-4 max-w-md text-primary-foreground/80">
            One platform for administrators, principals, professors, students and parents: courses, approvals, assessments and progress in one place.
          </p>
        </div>
        <p className="relative text-sm text-primary-foreground/60">© {new Date().getFullYear()} Zicon. Stand out from the crowd.</p>
      </aside>
      <main className="flex items-center justify-center bg-secondary/40 p-4 sm:p-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-6 flex justify-center lg:hidden">
            <Image src="/zicon-logo.png" alt="Zicon" width={150} height={86} className="h-14 w-auto rounded" priority />
          </Link>
          <div className="rounded-xl border border-border bg-background p-6 shadow-lg sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
