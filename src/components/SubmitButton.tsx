"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { m } from "motion/react";
import { EASE_OUT } from "@/lib/motion";
import { Button, buttonClass, type ButtonVariant } from "@/components/ui";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  variant,
  size,
  confirm,
  confirmTitle = "Are you sure?",
  className,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  /** When set, a confirmation dialog with this message must be accepted before submitting. */
  confirm?: string;
  confirmTitle?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };

  return (
    <>
      <Button
        ref={button}
        type="submit"
        variant={variant}
        size={size}
        disabled={pending}
        aria-busy={pending || undefined}
        className={cn("relative", className)}
        onClick={(e) => {
          if (!confirm) return;
          e.preventDefault();
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        {/* Keep the label in place so the button never changes width while working. */}
        {/* display:contents keeps the button's own layout; visibility still hides the children. */}
        <span className={cn("contents", pending && "invisible")}>{children}</span>
        {pending && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            <span className="sr-only">Working…</span>
          </span>
        )}
      </Button>

      {confirm && (
        <dialog
          ref={dialog}
          onClose={() => setOpen(false)}
          onClick={(e) => e.target === dialog.current && close()}
          aria-labelledby="confirm-title"
          className="w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-surface p-0 text-left font-normal text-foreground shadow-pop backdrop:bg-black/45 backdrop:backdrop-blur-[2px]"
        >
          {open && (
            <m.div
              className="p-6"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: EASE_OUT } }}
            >
              <div className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger" aria-hidden>
                  <AlertTriangle size={18} />
                </span>
                <div className="min-w-0">
                  <h2 id="confirm-title" className="text-base font-semibold text-foreground">{confirmTitle}</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">{confirm}</p>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" autoFocus onClick={close} className={buttonClass("outline")}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={buttonClass("danger")}
                  onClick={() => {
                    close();
                    // requestSubmit does not fire click, so this cannot reopen the dialog. Re-submit through the original button so its formAction and name/value are kept.
                    button.current?.form?.requestSubmit(button.current);
                  }}
                >
                  {typeof children === "string" ? children : "Confirm"}
                </button>
              </div>
            </m.div>
          )}
        </dialog>
      )}
    </>
  );
}
