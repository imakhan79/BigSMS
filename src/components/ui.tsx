import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const buttonStyles = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  accent: "bg-accent text-accent-foreground hover:bg-accent/90",
  outline: "border border-border bg-background hover:bg-secondary",
  ghost: "hover:bg-secondary",
  danger: "bg-red-600 text-white hover:bg-red-700",
};
export type ButtonVariant = keyof typeof buttonStyles;

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
    buttonStyles[variant],
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

export function LinkButton({ variant, size, className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <Link className={cn(buttonClass(variant, size), className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-border bg-background p-5 shadow-sm", className)} {...props} />;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-primary">{children}</h2>
      {action}
    </div>
  );
}

const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(field, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(field, className)} {...props} />;
}

export function Label({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

const green = "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
const red = "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
const amber = "bg-accent/20 text-amber-800 dark:text-accent";
const grey = "bg-muted text-muted-foreground";

const badgeTones: Record<string, string> = {
  draft: grey,
  archived: grey,
  submitted: amber,
  pending_approval: amber,
  pending: amber,
  acknowledged: amber,
  published: green,
  active: green,
  graded: green,
  resolved: green,
  rejected: red,
  inactive: red,
  open: red,
};

export function Badge({ value, children }: { value: string; children?: ReactNode }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", badgeTones[value] ?? "bg-secondary text-secondary-foreground")}>
      {children ?? value.replace(/_/g, " ")}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
      {empty && <p className="py-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
    </div>
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-3 py-2 align-top", className)} {...props} />;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-primary">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export type FlashParams = { error?: string; ok?: string };

export function Flash({ params }: { params: FlashParams }) {
  if (!params.error && !params.ok) return null;
  return (
    <div
      role="status"
      className={cn(
        "mb-4 rounded-md border px-4 py-3 text-sm",
        params.error
          ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          : "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
      )}
    >
      {params.error ?? params.ok}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="h-2 w-full rounded-full bg-muted" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2 rounded-full bg-accent" style={{ width: `${v}%` }} />
    </div>
  );
}
