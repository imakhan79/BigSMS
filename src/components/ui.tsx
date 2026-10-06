import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Inbox, XCircle } from "lucide-react";
import { FlashToast } from "@/components/Toaster";
import { cn } from "@/lib/utils";

/* ─── Buttons ──────────────────────────────────────────────────────────── */

const buttonStyles = {
  primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
  accent: "bg-accent text-accent-foreground shadow-xs hover:bg-accent/90",
  outline: "border border-input bg-surface text-foreground shadow-xs hover:bg-secondary",
  ghost: "text-foreground hover:bg-secondary",
  success: "bg-success text-white shadow-xs hover:bg-success/90 dark:text-background",
  danger: "bg-danger text-white shadow-xs hover:bg-danger/90 dark:text-background",
};
export type ButtonVariant = keyof typeof buttonStyles;

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
    buttonStyles[variant],
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

export function LinkButton({ variant, size, className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <Link className={cn(buttonClass(variant, size), className)} {...props} />;
}

/** Inline text link used for secondary navigation inside cards and headers. */
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cn("text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline", className)} {...props} />;
}

/* ─── Surfaces ─────────────────────────────────────────────────────────── */

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("ui-card rounded-lg border border-border bg-surface p-5 shadow-xs", className)} {...props} />;
}

export function CardTitle({ children, action, description }: { children: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-6 text-primary">{children}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, eyebrow }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</p>}
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight text-primary">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/* ─── Forms ────────────────────────────────────────────────────────────── */

const field =
  "w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/80 hover:border-foreground/25 focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(field, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-24 py-2", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(field, "h-9 cursor-pointer pr-8", className)} {...props} />;
}

export function Label({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("block space-y-1.5 text-sm", className)}>
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/* ─── Badges ───────────────────────────────────────────────────────────── */

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const toneStyles: Record<Tone, { badge: string; dot: string }> = {
  neutral: { badge: "bg-muted text-muted-foreground ring-border", dot: "bg-muted-foreground/60" },
  success: { badge: "bg-success/10 text-success ring-success/20", dot: "bg-success" },
  warning: { badge: "bg-warning/10 text-warning ring-warning/25", dot: "bg-warning" },
  danger: { badge: "bg-danger/10 text-danger ring-danger/20", dot: "bg-danger" },
  info: { badge: "bg-info/10 text-info ring-info/20", dot: "bg-info" },
  brand: { badge: "bg-primary/10 text-primary ring-primary/20", dot: "bg-primary" },
};

/** Workflow and account states get a status dot; everything else (roles, material types) is a plain label. */
const statusTones: Record<string, Tone> = {
  draft: "neutral",
  archived: "neutral",
  offboarded: "neutral",
  submitted: "warning",
  pending_approval: "warning",
  pending: "warning",
  acknowledged: "info",
  published: "success",
  active: "success",
  graded: "success",
  approved: "success",
  resolved: "success",
  completed: "success",
  rejected: "danger",
  inactive: "danger",
  open: "danger",
  overdue: "danger",
  under_review: "info",
  accepted: "success",
  verified: "success",
  issued: "success",
  revoked: "danger",
  unpaid: "warning",
  partial: "info",
  paid: "success",
  cancelled: "neutral",
};

export function Badge({ value, children, tone }: { value: string; children?: ReactNode; tone?: Tone }) {
  const status = statusTones[value];
  const t = toneStyles[tone ?? status ?? "neutral"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset", t.badge)}>
      {status && <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden />}
      {children ?? value.replace(/_/g, " ")}
    </span>
  );
}

/* ─── Data display ─────────────────────────────────────────────────────── */

export function Stat({ label, value, hint, icon, href }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode; href?: string }) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col rounded-lg border border-border border-t-2 border-t-gold bg-surface p-4 shadow-xs",
        href && "transition-colors duration-150 group-hover:border-foreground/20 group-hover:bg-secondary/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon && <span className="text-accent">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-primary">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="group block rounded-lg">{body}</Link> : body;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border [.ui-card>&:last-child]:-mb-5 [.ui-card>&:last-child]:rounded-b-lg [.ui-card>&:last-child]:border-b-0 [.ui-card>&:first-child]:-mt-5 [.ui-card>&:first-child]:rounded-t-lg [.ui-card>&:first-child]:border-t-0 [.ui-card>&]:-mx-5 [.ui-card>&]:rounded-none [.ui-card>&]:border-x-0">
      <table className="w-full text-left text-sm tabular-nums">
        <thead className="bg-secondary/70 text-xs text-secondary-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-5 py-2.5 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border [&>tr]:transition-colors [&>tr]:duration-100 [&>tr:hover]:bg-muted/50">{children}</tbody>
      </table>
      {empty && <p className="py-10 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
    </div>
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-5 py-3 align-middle", className)} {...props} />;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground", className)} aria-hidden>
      {initials || "?"}
    </span>
  );
}

/* ─── Feedback ─────────────────────────────────────────────────────────── */

const alertIcons = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle, info: Info } as const;
const alertStyles = {
  success: "border-success/25 bg-success/[0.06] [&>svg]:text-success",
  warning: "border-warning/30 bg-warning/[0.07] [&>svg]:text-warning",
  danger: "border-danger/25 bg-danger/[0.06] [&>svg]:text-danger",
  info: "border-info/25 bg-info/[0.06] [&>svg]:text-info",
};

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof alertIcons; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = alertIcons[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex animate-fade-in gap-3 rounded-lg border px-4 py-3 text-sm", alertStyles[tone], className)}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5 text-foreground">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "text-muted-foreground" : undefined}>{children}</div>}
      </div>
    </div>
  );
}

export type FlashParams = { error?: string; ok?: string };

/**
 * Server actions redirect back with ?ok= or ?error=. Successes become a toast; errors also stay
 * inline above the form, where the person is looking, until they navigate away.
 */
export function Flash({ params }: { params: FlashParams }) {
  if (!params.error && !params.ok) return null;
  return (
    <>
      <FlashToast ok={params.ok} error={params.error} />
      {params.error && (
        <Alert tone="danger" title="Something went wrong" className="mb-5">
          {params.error}
        </Alert>
      )}
    </>
  );
}

export function Empty({
  children,
  title,
  icon,
  action,
  compact,
}: {
  children?: ReactNode;
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-lg border border-dashed border-border bg-muted/30 text-center", compact ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-10")}>
      <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary/70" aria-hidden>
        {icon ?? <Inbox size={18} />}
      </span>
      {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Skeleton block for loading states; pulses gently unless reduced motion is on. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-secondary/80", className)} aria-hidden />;
}

/* ─── Navigation ───────────────────────────────────────────────────────── */

/** Link-driven tabs: the active tab lives in the URL so it survives reloads and server actions. */
export function Tabs({ items }: { items: { href: string; label: string; active: boolean; count?: number }[] }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Sections">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "relative -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150",
            t.active ? "border-accent text-primary" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
          )}
        >
          {t.label}
          {t.count != null && <span className="rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Segmented filter chips for list pages (role, status...). */
export function Filters({ label, items }: { label?: string; items: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {label && <span className="mr-1 text-xs font-medium text-muted-foreground">{label}</span>}
      <div className="inline-flex flex-wrap gap-0.5 rounded-md border border-border bg-muted/60 p-0.5">
        {items.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            aria-current={f.active ? "true" : undefined}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-[13px] font-medium capitalize transition-colors duration-150",
              f.active ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** CSS-only tooltip: shows on hover and keyboard focus after a short delay, no JS. */
export function Tooltip({ label, children, side = "top" }: { label: string; children: ReactNode; side?: "top" | "bottom" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-pop transition-opacity duration-100 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100 group-hover/tip:delay-300",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {label}
      </span>
    </span>
  );
}
