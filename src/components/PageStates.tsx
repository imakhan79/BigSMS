import { Card, Skeleton } from "@/components/ui";

/** Shown by each portal's loading.tsx while a page's data loads: mirrors the real page shape. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="mb-6 border-b border-border pb-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2.5 h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-lg border border-border border-t-2 border-t-accent/40 bg-surface p-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-3 h-7 w-14" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Card key={i}>
            <Skeleton className="mb-5 h-5 w-40" />
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, j) => (
                <Skeleton key={j} className="h-4" />
              ))}
            </div>
          </Card>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
