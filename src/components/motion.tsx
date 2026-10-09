"use client";

import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  domMax,
  LazyMotion,
  m,
  MotionConfig,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from "motion/react";
import { enter, pop, rise, spring, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Loads the animation features once for the whole app (`m` components stay small) and honours
 * the operating system's reduced-motion setting: movement is dropped, fades stay.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={enter}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/** Each route's content: a short rise, then its cards and headers reveal in order. */
export function PageMotion({ children }: { children: ReactNode }) {
  return (
    <m.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0, y: 6 },
        show: { opacity: 1, y: 0, transition: { ...enter, staggerChildren: 0.04, delayChildren: 0.03 } },
      }}
    >
      {children}
    </m.div>
  );
}

const TAGS = { div: m.div, section: m.section, ol: m.ol, ul: m.ul, li: m.li, header: m.header, p: m.p } as const;
type Tag = keyof typeof TAGS;

/**
 * Part of a staggered reveal. Inside PageMotion (or Reveal) it follows its parent; on its own it
 * simply renders. `lift` adds a hover lift for clickable cards.
 */
export function MotionItem({ as = "div", lift, className, ...props }: ComponentProps<"div"> & { as?: Tag; lift?: boolean }) {
  const Tag = TAGS[as] as typeof m.div;
  return (
    <Tag
      variants={rise}
      whileHover={lift ? { y: -2, transition: spring } : undefined}
      className={className}
      {...(props as HTMLMotionProps<"div">)}
    />
  );
}

/** Reveals when scrolled into view (once). With `stagger`, its MotionItem children follow in turn. */
export function Reveal({
  as = "div",
  stagger: staggered,
  delay = 0,
  className,
  children,
  id,
}: {
  as?: Tag;
  stagger?: boolean | number;
  delay?: number;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  const Tag = TAGS[as] as typeof m.div;
  const variants = staggered
    ? stagger(typeof staggered === "number" ? staggered : 0.06, delay)
    : { hidden: rise.hidden, show: { ...(rise.show as object), transition: { ...enter, delay } } };
  return (
    <Tag id={id} className={className} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} variants={variants}>
      {children}
    </Tag>
  );
}

/** Animates on page load instead of on scroll: for what is already on screen (a hero). */
export function Entrance({ as = "div", className, children, step = 0.07 }: { as?: Tag; className?: string; children: ReactNode; step?: number }) {
  const Tag = TAGS[as] as typeof m.div;
  return (
    <Tag className={className} initial="hidden" animate="show" variants={stagger(step, 0.05)}>
      {children}
    </Tag>
  );
}

/** A single block that rises in when it mounts (standalone screens, alerts). */
export function Appear({ className, ...props }: ComponentProps<"div">) {
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
      {...(props as HTMLMotionProps<"div">)}
    />
  );
}

/** Buttons press in with a spring. Disabled buttons don't respond. */
export function MotionButton({ className, disabled, ...props }: ComponentProps<"button">) {
  return (
    <m.button
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={spring}
      disabled={disabled}
      className={className}
      {...(props as HTMLMotionProps<"button">)}
    />
  );
}

const MLink = m.create(Link);

/** Link styled as a button: same spring press as MotionButton. */
export function MotionLink(props: ComponentProps<typeof Link>) {
  return <MLink whileTap={{ scale: 0.97 }} transition={spring} {...(props as ComponentProps<typeof MLink>)} />;
}

/** Tooltip on hover (after a short delay) and on keyboard focus; announced via aria-describedby. */
export function Tooltip({ label, children, side = "top" }: { label: string; children: ReactNode; side?: "top" | "bottom" }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();
  const show = (delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span
      className="relative inline-flex"
      aria-describedby={open ? id : undefined}
      onPointerEnter={() => show(300)}
      onPointerLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
      onKeyDown={(e) => e.key === "Escape" && hide()}
    >
      {children}
      <AnimatePresence>
        {open && (
          <m.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: side === "top" ? 3 : -3, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%", transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, x: "-50%", transition: { duration: 0.1 } }}
            className={cn(
              "pointer-events-none absolute left-1/2 z-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-pop",
              side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            )}
          >
            {label}
          </m.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** A thin reading-progress bar along the top of a long page. */
export function ScrollProgress({ className }: { className?: string }) {
  const { scrollYProgress } = useScroll();
  const reduce = useReducedMotion();
  const smooth = useSpring(scrollYProgress, { stiffness: 220, damping: 32, mass: 0.4 });
  return (
    <m.div
      aria-hidden
      style={{ scaleX: reduce ? scrollYProgress : smooth }}
      className={cn("pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent", className)}
    />
  );
}

/** Soft parallax: the content drifts a few pixels against the scroll. Off with reduced motion. */
export function Parallax({ children, distance = 24, className }: { children: ReactNode; distance?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [distance, -distance]);
  return (
    <m.div ref={ref} style={{ y }} className={className}>
      {children}
    </m.div>
  );
}

/** After moving to another page, puts keyboard and screen-reader focus on the main content. */
export function RouteFocus({ target = "main" }: { target?: string }) {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById(target)?.focus({ preventScroll: true });
  }, [pathname, target]);
  return null;
}

export { AnimatePresence, m, pop };
