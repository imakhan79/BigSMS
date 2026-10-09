import type { ReactNode } from "react";
import { PageMotion } from "@/components/motion";

/** Route templates remount on every navigation: each page rises in and its cards follow in turn. */
export function PageTransition({ children }: { children: ReactNode }) {
  return <PageMotion>{children}</PageMotion>;
}
