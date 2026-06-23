"use client";

import { useEffect, useState } from "react";
import { THEME_EVENT, getTheme, setTheme, type Theme } from "../lib/theme";

const CYCLE: Theme[] = ["clean", "ember", "dark"];

const LABELS: Record<string, string> = {
  clean: "Clean",
  ember: "Ember",
  dark:  "Dark",
  light: "Light",
};

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
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
  ember: <FlameIcon />,
  dark:  <MoonIcon />,
  light: <SunIcon />,
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
      className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-[#252345] hover:border-[#333368] bg-[#0D0B1A] hover:bg-[#1A1838] text-[#7B8DB4] hover:text-[#F1F5F9] transition-all duration-100"
    >
      {icon}
      <span className="hidden sm:block text-[11px] font-medium">{label}</span>
    </button>
  );
}
