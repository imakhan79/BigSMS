"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { pop } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Minimal accessible menu: click opens; Escape, an outside click or choosing an item closes.
 * Panel content is passed as children so server-rendered links and forms can live inside it.
 * The panel grows from its trigger and closes faster than it opens.
 */
export function Dropdown({
  trigger,
  label,
  children,
  align = "end",
  className,
}: {
  trigger: ReactNode;
  label: string;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={cn("flex min-h-10 items-center rounded-md transition-colors hover:bg-secondary", open && "bg-secondary", className)}
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            role="menu"
            variants={pop}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
            className={cn(
              "absolute top-full z-50 mt-1.5 min-w-56 rounded-lg border border-border bg-surface p-1 shadow-pop",
              align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left",
            )}
          >
            {children}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const menuItemClass =
  "flex w-full min-h-9 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary";
