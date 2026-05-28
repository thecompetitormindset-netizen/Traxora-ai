"use client";

import { useEffect } from "react";
import { getTheme, THEME_EVENT, type Theme } from "../lib/theme";

export default function ThemeProvider() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", getTheme());
    const handler = (e: Event) => {
      document.documentElement.setAttribute("data-theme", (e as CustomEvent<Theme>).detail);
    };
    window.addEventListener(THEME_EVENT, handler);
    return () => window.removeEventListener(THEME_EVENT, handler);
  }, []);

  return null;
}
