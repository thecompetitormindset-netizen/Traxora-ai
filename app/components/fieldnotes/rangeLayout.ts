// Pure layout for the horizontal range diagram: a true linear scale (no
// decorative spacing) plus collision-free label rows.

export type MarkKind = "price" | "target" | "invalidation" | "support" | "resistance" | "short_strike" | "long_strike" | "em_low" | "em_high";

export type Mark = { kind: MarkKind; value: number; label: string };
export type PlacedMark = Mark & { x: number; left: number; row: number; side: "above" | "below" };

export const ABOVE: ReadonlySet<MarkKind> = new Set(["price", "target", "invalidation", "support", "resistance"]);

const CHAR_PX = 7;
const PAD_PX = 10;

export function labelWidth(label: string): number {
  return label.length * CHAR_PX + PAD_PX;
}

export function domainFor(values: number[]): [number, number] | null {
  const v = values.filter(Number.isFinite);
  if (v.length === 0) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  const span = Math.max(hi - lo, Math.abs(hi) * 0.01, 1e-6);
  const pad = span * 0.08;
  return [lo - pad, hi + pad];
}

export function layoutMarks(marks: Mark[], width: number, inset = 12): { placed: PlacedMark[]; domain: [number, number] | null; rows: { above: number; below: number } } {
  const domain = domainFor(marks.map(m => m.value));
  if (!domain || width <= inset * 2) return { placed: [], domain, rows: { above: 0, below: 0 } };
  const [lo, hi] = domain;
  const scale = (v: number) => inset + ((v - lo) / (hi - lo)) * (width - inset * 2);

  const placed: PlacedMark[] = [];
  const rows = { above: 0, below: 0 };
  for (const side of ["above", "below"] as const) {
    const group = marks
      .filter(m => (side === "above") === ABOVE.has(m.kind))
      .map(m => ({ ...m, x: scale(m.value) }))
      .sort((a, b) => a.x - b.x);
    const rowEnds: number[] = [];
    for (const m of group) {
      const w = labelWidth(m.label);
      // Clamp so labels never run off either edge.
      const left = Math.min(Math.max(m.x - w / 2, 0), width - w);
      let row = rowEnds.findIndex(end => left >= end + 6);
      if (row === -1) { row = rowEnds.length; rowEnds.push(0); }
      rowEnds[row] = left + w;
      placed.push({ ...m, left, side, row });
    }
    rows[side] = rowEnds.length;
  }
  return { placed, domain, rows };
}

/** Low-to-high reading order for the text alternative. */
export function textAlternative(marks: Mark[]): string {
  return [...marks].sort((a, b) => a.value - b.value).map(m => m.label).join(" · ");
}
