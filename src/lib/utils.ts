import { redirect } from "next/navigation";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/** The institute's time zone (Lahore). Pakistan has no daylight saving, so the offset is fixed. */
export const INSTITUTE_TZ = "Asia/Karachi";
const INSTITUTE_OFFSET = "+05:00";

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: INSTITUTE_TZ });
}

/** A datetime-local input value ("2026-10-09T23:59") read as institute time, as an ISO timestamp. */
export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  return new Date(`${value.slice(0, 16)}:00${INSTITUTE_OFFSET}`).toISOString();
}

/** A timestamp as a datetime-local input value in institute time. */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INSTITUTE_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** "just now", "5m ago", "3h ago", "2d ago", then a short date. */
export function timeAgo(value: string) {
  const s = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function pct(value: number | null | undefined) {
  return value == null ? "—" : `${Number(value).toFixed(0)}%`;
}

/** Redirect back with a flash message (?error= / ?ok=). */
export function back(path: string, kind: "error" | "ok", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

export function formatDay(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatMoney(amount: number | string | null | undefined, currency = "PKR") {
  if (amount == null) return "—";
  return `${currency} ${Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Today as YYYY-MM-DD for date inputs. */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

const TITLES = new Set(["prof", "professor", "dr", "mr", "mrs", "ms", "miss", "sir", "madam", "engr", "eng", "hafiz", "syed"]);

/** First name for greetings, skipping titles such as "Prof." or "Dr.". */
export function firstName(fullName: string | null | undefined) {
  const words = (fullName || "").trim().split(/\s+/).filter(Boolean);
  return words.find((w) => !TITLES.has(w.toLowerCase().replace(/\.$/, ""))) ?? words[0] ?? "";
}
