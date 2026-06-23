export type Theme = "dark" | "light" | "clean" | "ember";
export const THEME_KEY   = "traxora-theme";
export const THEME_EVENT = "theme-changed";

const VALID: Theme[] = ["dark", "light", "clean", "ember"];

export function getTheme(): Theme {
  if (typeof window === "undefined") return "clean";
  const stored = localStorage.getItem(THEME_KEY) as Theme;
  return VALID.includes(stored) ? stored : "clean";
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}
