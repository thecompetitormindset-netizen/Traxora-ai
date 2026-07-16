"use client";

import { useEffect, useState } from "react";
import { THEME_EVENT, getTheme, setTheme, type Theme } from "../lib/theme";

const CYCLE: Theme[] = ["clean", "dark"];

const LABELS: Record<string, string> = {
  clean: "Light",
  light: "Light",
  ember: "Light",
  dark:  "Dark",
};

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  clean: <SunIcon />,
  light: <SunIcon />,
  ember: <SunIcon />,
  dark:  <MoonIcon />,
};

export default function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>("clean");

  useEffect(() => {
    setLocal(getTheme());
    function handler(e: Event) {
      setLocal((e as CustomEvent<Theme>).detail);
    }
    window.addEventListener(THEME_EVENT, handler);
    return () => window.removeEventListener(THEME_EVENT, handler);
  }, []);

  function cycle() {
    const idx  = CYCLE.indexOf(theme);
    const next = CYCLE[idx === -1 ? 0 : (idx + 1) % CYCLE.length];
    setTheme(next);
    setLocal(next);
  }

  const label = LABELS[theme] ?? "Theme";
  const icon  = ICONS[theme]  ?? <SunIcon />;

  return (
    <button
      onClick={cycle}
      title={`Theme: ${label} — click to cycle`}
      className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-[var(--border)] hover:border-[var(--border-hover)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-100"
    >
      {icon}
      <span className="hidden sm:block text-[11px] font-medium">{label}</span>
    </button>
  );
}
