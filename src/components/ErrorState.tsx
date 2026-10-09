"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Appear } from "@/components/motion";
import { buttonClass } from "@/components/ui";

/** Rendered by each portal's error.tsx: keeps the shell, explains the failure, offers a retry. */
export function ErrorState({ error, reset, home }: { error: Error & { digest?: string }; reset: () => void; home: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Appear className="mx-auto flex max-w-lg flex-col items-center py-16 text-center" role="alert">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger" aria-hidden>
        <TriangleAlert size={22} />
      </span>
      <h1 className="mt-5 font-display text-2xl font-semibold text-primary">This page couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Something went wrong while loading this page. Your data is safe. Try again, and if it keeps happening, contact your administrator
        {error.digest ? " with the reference below." : "."}
      </p>
      {error.digest && <p className="mt-3 rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className={buttonClass("primary")}>
          <RotateCcw size={15} /> Try again
        </button>
        <Link href={home} className={buttonClass("outline")}>
          Back to dashboard
        </Link>
      </div>
    </Appear>
  );
}
