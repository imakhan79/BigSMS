import Image from "next/image";
import { cn } from "@/lib/utils";

/** Single source of truth for the institution's identity. */
export const BRAND = {
  short: "LGITE",
  name: "Lahore Garrison Institute of Technical Education",
  product: "Big SMS",
  logo: "/lgite-logo.png",
} as const;

/** The LGITE crest (transparent background, roughly square). Size it with a height class. */
export function Crest({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={BRAND.logo}
      alt={`${BRAND.name} (${BRAND.short}) crest`}
      width={640}
      height={648}
      priority={priority}
      className={cn("w-auto select-none", className)}
    />
  );
}

/** Crest plus institution name, for headers. `inverse` is for navy backgrounds. */
export function BrandLockup({ className, crestClass = "h-10", inverse, sub }: { className?: string; crestClass?: string; inverse?: boolean; sub?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Crest className={cn("shrink-0", crestClass)} priority />
      <span className="min-w-0 leading-tight">
        <span className={cn("block font-display text-[17px] font-bold tracking-wide", inverse ? "text-white" : "text-primary")}>{BRAND.short}</span>
        <span className={cn("block truncate text-[11px] font-medium", inverse ? "text-sidebar-muted" : "text-muted-foreground")}>{sub ?? BRAND.product}</span>
      </span>
    </span>
  );
}
