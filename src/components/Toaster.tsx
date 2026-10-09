"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { EASE_IN, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Tone = "success" | "danger" | "warning" | "info";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
  duration: number;
}

/* A tiny module-level store: any client code can call toast(), the single <Toaster /> renders. */
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<(t: Toast[]) => void>();
const emit = () => listeners.forEach((l) => l([...toasts]));

export function toast(t: { tone?: Tone; title: string; description?: string; duration?: number }) {
  const tone = t.tone ?? "success";
  const item: Toast = { id: nextId++, tone, title: t.title, description: t.description, duration: t.duration ?? (tone === "danger" ? 8000 : 4000) };
  toasts = [...toasts.slice(-3), item];
  emit();
  return item.id;
}

/** Removing a toast lets AnimatePresence play its exit; the rest of the stack glides into place. */
function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const ICONS = { success: CheckCircle2, danger: XCircle, warning: AlertTriangle, info: Info };
const ACCENT = { success: "text-success", danger: "text-danger", warning: "text-warning", info: "text-info" };

function ToastItem({ t }: { t: Toast }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => dismiss(t.id), t.duration);
    return () => clearTimeout(timer);
  }, [paused, t.id, t.duration]);
  const Icon = ICONS[t.tone];
  return (
    <m.li
      layout
      role={t.tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: EASE_OUT } }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.16, ease: EASE_IN } }}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-border bg-surface p-3.5 pr-2.5 shadow-pop"
    >
      <Icon size={18} className={cn("mt-px shrink-0", ACCENT[t.tone])} aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-foreground">{t.title}</p>
        {t.description && <p className="mt-0.5 text-muted-foreground">{t.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss notification"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X size={14} aria-hidden />
      </button>
    </m.li>
  );
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    listeners.add(setItems);
    return () => void listeners.delete(setItems);
  }, []);
  return (
    <ol
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:w-[360px]"
    >
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </ol>
  );
}

let lastFlash = "";

/** Turns a server action's ?ok= / ?error= redirect into a toast, then cleans the URL. */
export function FlashToast({ ok, error }: { ok?: string; error?: string }) {
  useEffect(() => {
    const message = error ?? ok;
    if (!message) return;
    const key = `${error ? "e" : "o"}:${message}:${location.search}`;
    if (key !== lastFlash) {
      lastFlash = key;
      toast(error ? { tone: "danger", title: "Something went wrong", description: error } : { tone: "success", title: message });
    }
    const url = new URL(location.href);
    url.searchParams.delete("ok");
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [ok, error]);
  return null;
}
