// Generates app/monochrome.generated.css — the bridge from the legacy
// hard-coded hex utility classes (bg-[#13112A], text-[#4B5675], …) to the
// monochrome design tokens in app/monochrome.css. Re-run after adding a new
// hex class:  node scripts/gen-monochrome.mjs
//
// It also re-points the legacy light-theme accent overrides in globals.css
// (which hard-code hex values like #7C3AED) back to the palette variables, so
// the monochrome palette wins in every theme.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const APP = join(ROOT, "app");

// ── Hex → token role, per property group ─────────────────────────────────────
const BG = {
  "0A0815": "canvas",
  "0D0B1A": "well", "0D0C1F": "well", "0B091A": "well", "080E1B": "well", "0B0F19": "well", "0D1420": "well",
  "13112A": "surface",
  "1A1838": "raised", "1C1933": "raised", "1E1C42": "raised", "232F46": "raised",
  "252345": "raised-2",
  "333368": "line-strong",
  "4B5675": "control",
  "7B8DB4": "text-3",
};
const LINE = {
  "252345": "line", "1C1933": "line", "1A1838": "line", "1E1C42": "line", "13112A": "line", "0A0815": "line", "0D0B1A": "line",
  "333368": "line-strong",
  "7B8DB4": "control", "4B5675": "control",
};
const TEXT = {
  "F1F5F9": "text", "E2E8F0": "text",
  "CBD5E1": "text-2", "94A3B8": "text-2", "7B8DB4": "text-2",
  "4B5675": "text-3", "333368": "text-3", "2D3A52": "text-3", "3D4F6B": "text-3", "252345": "text-3", "1C1A3A": "text-3",
};

const GROUP = {
  bg: [BG, v => `background-color: ${v}`],
  text: [TEXT, v => `color: ${v}`],
  placeholder: [TEXT, v => `color: ${v}`],
  fill: [TEXT, v => `fill: ${v}`],
  stroke: [TEXT, v => `stroke: ${v}`],
  caret: [TEXT, v => `caret-color: ${v}`],
  border: [LINE, v => `border-color: ${v}`],
  "border-t": [LINE, v => `border-top-color: ${v}`],
  "border-b": [LINE, v => `border-bottom-color: ${v}`],
  "border-l": [LINE, v => `border-left-color: ${v}`],
  "border-r": [LINE, v => `border-right-color: ${v}`],
  "border-x": [LINE, v => `border-left-color: ${v}; border-right-color: ${v}`],
  "border-y": [LINE, v => `border-top-color: ${v}; border-bottom-color: ${v}`],
  divide: [LINE, v => `border-color: ${v}`],
  ring: [LINE, v => `--tw-ring-color: ${v}`],
  outline: [LINE, v => `outline-color: ${v}`],
  from: [BG, v => `--tw-gradient-from: ${v}`],
  via: [BG, v => `--tw-gradient-via: ${v}`],
  to: [BG, v => `--tw-gradient-to: ${v}`],
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ([".tsx", ".ts"].includes(extname(p))) out.push(p);
  }
  return out;
}

const TOKEN = /((?:[a-z-]+:)*)(bg|text|placeholder|fill|stroke|caret|border(?:-[trblxy])?|divide|ring|outline|from|via|to)-\[#([0-9A-Fa-f]{3,8})\](?:\/(\d+|\[[0-9.]+\]))?/g;
const found = new Set();
for (const f of walk(APP)) {
  for (const m of readFileSync(f, "utf8").matchAll(TOKEN)) found.add(m[0]);
}

const esc = s => s.replace(/"/g, '\\"');
const S = `html[data-theme]`; // (0,1,1): with *[class~=…] this outranks the legacy :is(html[…]) rules and comes later

function colorExpr(role, opacity) {
  const v = `var(--mx-${role})`;
  if (!opacity) return v;
  const pct = opacity.startsWith("[") ? Math.round(parseFloat(opacity.slice(1, -1)) * 100) : Number(opacity);
  return `color-mix(in srgb, ${v} ${pct}%, transparent)`;
}

const rules = [];
const skipped = [];
for (const tok of [...found].sort()) {
  TOKEN.lastIndex = 0;
  const m = TOKEN.exec(tok);
  const prefixes = (m[1] || "").split(":").filter(Boolean);
  const util = m[2], hex = m[3].toUpperCase(), opacity = m[4];
  const [map, decl] = GROUP[util];
  const role = map[hex];
  if (!role) { skipped.push(tok); continue; }

  let sel = `${S} *[class~="${esc(tok)}"]`;
  let pseudo = "";
  for (const p of prefixes) {
    if (p === "hover") pseudo += ":hover";
    else if (p === "focus") pseudo += ":focus";
    else if (p === "focus-visible") pseudo += ":focus-visible";
    else if (p === "active") pseudo += ":active";
    else if (p === "disabled") pseudo += ":disabled";
    else if (p === "group-hover") sel = `${S} .group:hover *[class~="${esc(tok)}"]`;
    else if (p === "placeholder") pseudo += "::placeholder";
  }
  if (util === "placeholder") pseudo += "::placeholder";
  sel += pseudo;
  if (util === "divide") sel = `${sel} > :not(:last-child)`;
  rules.push(`${sel} { ${decl(colorExpr(role, opacity))} !important; }`);
}

// ── Legacy light-theme accent overrides in globals.css → palette variables ──
const globals = readFileSync(join(APP, "globals.css"), "utf8");
const ACCENT = /\*\[class~="((?:hover:)?)(text|bg|border)-([a-z]+)-(\d{2,3})(?:\/(\d+))?"\](:hover)?/g;
const accentRules = new Set();
for (const m of globals.matchAll(ACCENT)) {
  const [, hoverPrefix, util, family, shade, opacity] = m;
  if (!["emerald", "green", "lime", "rose", "red", "pink", "amber", "yellow", "orange", "violet", "purple", "indigo", "fuchsia", "sky", "cyan", "teal", "blue"].includes(family)) continue;
  const tok = `${hoverPrefix}${util}-${family}-${shade}${opacity ? "/" + opacity : ""}`;
  const v = opacity ? `color-mix(in srgb, var(--color-${family}-${shade}) ${opacity}%, transparent)` : `var(--color-${family}-${shade})`;
  const prop = util === "text" ? "color" : util === "bg" ? "background-color" : "border-color";
  accentRules.add(`${S} *[class~="${tok}"]${hoverPrefix ? ":hover" : ""} { ${prop}: ${v} !important; }`);
}

const out = `/* GENERATED by scripts/gen-monochrome.mjs — do not edit by hand.
   Maps legacy hex utility classes to monochrome tokens (app/monochrome.css). */

${rules.join("\n")}

/* Legacy light-theme accent overrides re-pointed to the (monochrome) palette variables */
${[...accentRules].sort().join("\n")}
`;
writeFileSync(join(APP, "monochrome.generated.css"), out);
console.log(`hex rules: ${rules.length}, accent rules: ${accentRules.size}, skipped: ${skipped.length ? skipped.join(" ") : "none"}`);
