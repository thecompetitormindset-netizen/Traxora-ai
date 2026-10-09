// The app's font stacks as concrete family names. next/font exposes Geist via
// CSS variables, but canvas-based charts (lightweight-charts) can't resolve
// var(), so they read the resolved value here.

const FALLBACK = {
  sans: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

// One typeface everywhere: "mono" callers (chart axes, price labels) get Geist
// too, so charts match the rest of the app.
export function appFontFamily(kind: "sans" | "mono" = "sans"): string {
  kind = "sans";
  if (typeof document === "undefined") return FALLBACK[kind];
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(kind === "sans" ? "--font-geist" : "--font-mono-custom")
    .trim();
  return v ? `${v}, ${FALLBACK[kind]}` : FALLBACK[kind];
}
