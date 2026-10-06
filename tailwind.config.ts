import type { Config } from "tailwindcss";

const color = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: color("background"),
        foreground: color("foreground"),
        surface: color("surface"),
        primary: { DEFAULT: color("primary"), foreground: color("primary-foreground") },
        secondary: { DEFAULT: color("secondary"), foreground: color("secondary-foreground") },
        accent: { DEFAULT: color("accent"), foreground: color("accent-foreground") },
        muted: { DEFAULT: color("muted"), foreground: color("muted-foreground") },
        gold: color("gold"),
        success: color("success"),
        warning: color("warning"),
        danger: color("danger"),
        info: color("info"),
        sidebar: {
          DEFAULT: color("sidebar"),
          foreground: color("sidebar-foreground"),
          muted: color("sidebar-muted"),
          border: color("sidebar-border"),
          hover: color("sidebar-hover"),
          active: color("sidebar-active"),
        },
        border: color("border"),
        input: color("input"),
        ring: color("ring"),
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        pop: "0 8px 24px -6px rgb(0 0 0 / 0.14), 0 2px 6px -2px rgb(0 0 0 / 0.08)",
      },
      transitionTimingFunction: { out: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
        "pop-in": { from: { opacity: "0", transform: "translateY(-2px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
        "drawer-in": { from: { transform: "translateX(-100%)" }, to: { transform: "none" } },
        "overlay-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "toast-in": { from: { opacity: "0", transform: "translateY(8px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
        "toast-out": { from: { opacity: "1", transform: "none" }, to: { opacity: "0", transform: "translateX(12px)" } },
        "dialog-in": { from: { opacity: "0", transform: "translateY(6px) scale(0.97)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "fade-in": "fade-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "pop-in": "pop-in 120ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "drawer-in": "drawer-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "overlay-in": "overlay-in 180ms ease-out both",
        "toast-in": "toast-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "toast-out": "toast-out 150ms ease-in both",
        "dialog-in": "dialog-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
