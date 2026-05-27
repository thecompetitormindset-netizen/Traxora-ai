export type Theme = "dark" | "light";
export const THEME_KEY   = "traxora-theme";
export const THEME_EVENT = "theme-changed";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem(THEME_KEY) as Theme) ?? "dark";
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}
