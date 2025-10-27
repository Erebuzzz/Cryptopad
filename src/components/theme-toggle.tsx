"use client";

import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const icon = theme === "dark" ? "☾" : "☀";
  const nextText = theme === "dark" ? "Contrast" : "Midnight";
  const accessibleLabel = theme === "dark" ? "Switch to high contrast theme" : "Switch to midnight theme";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle fixed right-6 top-6 z-50 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition hover:-translate-y-[1px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
      aria-pressed={theme === "contrast"}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <span aria-hidden>{icon}</span>
      <span aria-hidden>{nextText}</span>
    </button>
  );
}
