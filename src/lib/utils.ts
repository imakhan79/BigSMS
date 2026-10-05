import { redirect } from "next/navigation";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function pct(value: number | null | undefined) {
  return value == null ? "—" : `${Number(value).toFixed(0)}%`;
}

/** Redirect back with a flash message (?error= / ?ok=). */
export function back(path: string, kind: "error" | "ok", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}
