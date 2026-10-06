import type { ReactNode } from "react";

/** Route templates remount on every navigation, so each page gets a short, subtle entrance. */
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
