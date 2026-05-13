"use client";

import { useEffect, useState } from "react";

// Two-state theme toggle: default (dark/amber) ↔ "nfl" (red/white/blue).
// Persists to localStorage under "fdf-theme" and writes to
// <html data-theme>. The pre-paint script in layout.tsx applies the
// stored value before first paint so this component never causes a
// flash.
type Theme = "default" | "nfl";
const STORAGE_KEY = "fdf-theme";

function readStored(): Theme {
  if (typeof window === "undefined") return "default";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "nfl" ? "nfl" : "default";
}

function applyTheme(t: Theme) {
  const html = document.documentElement;
  if (t === "nfl") html.setAttribute("data-theme", "nfl");
  else html.removeAttribute("data-theme");
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("default");

  // Hydrate from whatever the pre-paint script already applied.
  useEffect(() => {
    setTheme(readStored());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "default" ? "nfl" : "default";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage disabled — toggle still works for the session.
    }
  };

  const label = theme === "nfl" ? "NFL" : "DARK";

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch theme (currently ${label})`}
      aria-label={`Switch theme (currently ${label})`}
      className="inline-flex h-[30px] items-center gap-1.5 rounded-[var(--r-8)] border border-[var(--color-line)] bg-[var(--color-bench)] px-2.5 transition-colors hover:border-[var(--accent-line)] hover:text-[var(--accent-soft)]"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
      }}
    >
      <span aria-hidden className="flex items-center gap-1">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: theme === "nfl" ? "#D50A0A" : "var(--accent)" }}
        />
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: theme === "nfl" ? "#013369" : "var(--color-line-strong)" }}
        />
      </span>
      {label}
    </button>
  );
}
