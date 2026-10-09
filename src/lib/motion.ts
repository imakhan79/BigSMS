import type { Transition, Variants } from "motion/react";

/**
 * Motion tokens. One rhythm for the whole app: entrances ease out on [0.22, 1, 0.36, 1],
 * exits are shorter than entrances, and interactive feedback uses a spring.
 * Only transform and opacity are animated.
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;

export const DURATION = { fast: 0.18, base: 0.32, slow: 0.5 } as const;

export const enter: Transition = { duration: DURATION.base, ease: EASE_OUT };
export const exit: Transition = { duration: DURATION.fast, ease: EASE_IN };
/** Buttons, nav pills, toggles: quick and settled, no wobble. */
export const spring: Transition = { type: "spring", stiffness: 520, damping: 34, mass: 0.6 };

/** A page or section that reveals its children one after another. */
export const stagger = (step = 0.045, delay = 0.02): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

/** The default reveal: a short rise and fade. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: enter },
};

/** Popovers and menus grow from their trigger. */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: -4 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.98, y: -2, transition: { duration: 0.12, ease: EASE_IN } },
};
