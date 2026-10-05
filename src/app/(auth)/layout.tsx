import Image from "next/image";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-secondary via-background to-accent/20 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Image src="/zicon-logo.png" alt="Zicon" width={180} height={104} className="h-auto w-44 rounded" priority />
          <p className="text-sm font-medium text-muted-foreground">Big SMS Learning Management System</p>
        </div>
        {children}
      </div>
    </div>
  );
}
