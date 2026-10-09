"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { NavLinks, type NavGroup } from "@/components/NavLinks";
import { Crest } from "@/components/Brand";
import { EASE_IN, EASE_OUT } from "@/lib/motion";

/** Slide-in navigation drawer for small screens. Escape, the scrim or a link closes it; focus returns to the menu button. */
export function MobileNav({ groups, title }: { groups: NavGroup[]; title: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) {
      if (wasOpen.current) trigger.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={trigger}
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen(true)}
        className="-ml-2 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Menu size={20} aria-hidden />
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <m.div key="drawer" id="mobile-nav" className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
                <m.div
                  className="absolute inset-0 bg-black/40"
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
                  exit={{ opacity: 0, transition: { duration: 0.16, ease: EASE_IN } }}
                />
                <m.aside
                  className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-pop"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0, transition: { type: "spring", stiffness: 420, damping: 40 } }}
                  exit={{ x: "-100%", transition: { duration: 0.2, ease: EASE_IN } }}
                >
                  <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Crest className="h-9 shrink-0" />
                      <span className="truncate text-sm font-semibold">{title}</span>
                    </span>
                    <button
                      ref={closeButton}
                      type="button"
                      aria-label="Close menu"
                      onClick={() => setOpen(false)}
                      className="flex h-10 w-10 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
                    >
                      <X size={18} aria-hidden />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
                    <Suspense>
                      <NavLinks groups={groups} instance="drawer" onNavigate={() => setOpen(false)} />
                    </Suspense>
                  </div>
                </m.aside>
              </m.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
