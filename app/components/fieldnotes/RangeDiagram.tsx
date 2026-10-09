"use client";

import { useEffect, useRef, useState } from "react";
import { layoutMarks, textAlternative, type Mark, type MarkKind } from "./rangeLayout";
import { fmtLevel } from "./format";

const ROW_H = 18;
const AXIS_PAD = 14;

const KIND_NAME: Record<MarkKind, string> = {
  price: "Price", target: "Target", invalidation: "Invalidation", support: "Support", resistance: "Resistance",
  short_strike: "Sold strike", long_strike: "Bought strike", em_low: "Expected move low", em_high: "Expected move high",
};

const KIND_COLOR: Record<MarkKind, string> = {
  price: "var(--fn-text)", target: "var(--fn-pos)", invalidation: "var(--fn-neg)",
  support: "var(--fn-text-2)", resistance: "var(--fn-text-2)",
  short_strike: "var(--fn-copper)", long_strike: "var(--fn-copper)",
  em_low: "var(--fn-info)", em_high: "var(--fn-info)",
};

/** Glyph per kind so marks differ by shape, not only color. */
function Glyph({ kind, x, y }: { kind: MarkKind; x: number; y: number }) {
  const c = KIND_COLOR[kind];
  switch (kind) {
    case "price": return <polygon points={`${x},${y - 1} ${x - 6},${y - 11} ${x + 6},${y - 11}`} fill={c} />;
    case "target": return <rect x={x - 5} y={y - 11} width={10} height={10} transform={`rotate(45 ${x} ${y - 6})`} fill="none" stroke={c} strokeWidth={2} />;
    case "invalidation": return <g stroke={c} strokeWidth={2}><line x1={x - 5} y1={y - 11} x2={x + 5} y2={y - 1} /><line x1={x + 5} y1={y - 11} x2={x - 5} y2={y - 1} /></g>;
    case "support": case "resistance": return <line x1={x} y1={y - 10} x2={x} y2={y} stroke={c} strokeWidth={1.5} />;
    case "short_strike": return <rect x={x - 5} y={y + 1} width={10} height={10} fill={c} />;
    case "long_strike": return <rect x={x - 5} y={y + 1} width={10} height={10} fill="none" stroke={c} strokeWidth={2} />;
    case "em_low": case "em_high": return <line x1={x} y1={y - 6} x2={x} y2={y + 6} stroke={c} strokeWidth={2} />;
  }
}

export type RangeInput = {
  price: number | null;
  target: number | null;
  invalidation: { lower: number | null; upper: number | null } | null;
  support: number[];
  resistance: number[];
  legs: { strike: number; action: "BUY" | "SELL"; type: "CALL" | "PUT" }[];
  expectedMove: { lower: number; upper: number } | null;
};

export function buildMarks(r: RangeInput): Mark[] {
  const marks: Mark[] = [];
  if (r.price !== null) marks.push({ kind: "price", value: r.price, label: `Price ${fmtLevel(r.price)}` });
  if (r.target !== null) marks.push({ kind: "target", value: r.target, label: `Target ${fmtLevel(r.target)}` });
  if (r.invalidation?.lower != null) marks.push({ kind: "invalidation", value: r.invalidation.lower, label: `Invalid below ${fmtLevel(r.invalidation.lower)}` });
  if (r.invalidation?.upper != null) marks.push({ kind: "invalidation", value: r.invalidation.upper, label: `Invalid above ${fmtLevel(r.invalidation.upper)}` });
  const used = new Set(marks.map(m => m.value));
  for (const s of r.support) if (!used.has(s)) marks.push({ kind: "support", value: s, label: `Support ${fmtLevel(s)}` });
  for (const s of r.resistance) if (!used.has(s)) marks.push({ kind: "resistance", value: s, label: `Resistance ${fmtLevel(s)}` });
  for (const l of r.legs) {
    marks.push({
      kind: l.action === "SELL" ? "short_strike" : "long_strike", value: l.strike,
      label: `${l.action === "SELL" ? "Sold" : "Bought"} ${l.type === "CALL" ? "call" : "put"} ${fmtLevel(l.strike)}`,
    });
  }
  if (r.expectedMove) {
    marks.push({ kind: "em_low", value: r.expectedMove.lower, label: `EM low ${fmtLevel(r.expectedMove.lower)}` });
    marks.push({ kind: "em_high", value: r.expectedMove.upper, label: `EM high ${fmtLevel(r.expectedMove.upper)}` });
  }
  return marks;
}

export default function RangeDiagram({ input, caption }: { input: RangeInput; caption: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const marks = buildMarks(input);
  const { placed, rows } = layoutMarks(marks, width);
  const axisY = AXIS_PAD + rows.above * ROW_H + 12;
  const height = axisY + 14 + rows.below * ROW_H + 4;
  const em = placed.filter(p => p.kind === "em_low" || p.kind === "em_high");
  const kinds = [...new Set(marks.map(m => m.kind))];

  return (
    <figure style={{ margin: 0 }}>
      <div ref={ref} className="w-full" style={{ minHeight: 60 }}>
        {width > 0 && placed.length > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${caption}. From low to high: ${textAlternative(marks)}`} style={{ display: "block", overflow: "visible" }}>
            {em.length === 2 && (
              <rect x={Math.min(em[0].x, em[1].x)} y={axisY - 4} width={Math.abs(em[1].x - em[0].x)} height={8} fill="var(--fn-tint-info)" stroke="var(--fn-info)" strokeDasharray="3 3" strokeWidth={1} />
            )}
            <line x1={0} y1={axisY} x2={width} y2={axisY} stroke="var(--fn-border)" strokeWidth={1} />
            {placed.map((p, i) => {
              const labelY = p.side === "above" ? AXIS_PAD + p.row * ROW_H : axisY + 26 + p.row * ROW_H;
              return (
                <g key={`${p.kind}-${p.value}-${i}`}>
                  <line x1={p.x} y1={p.side === "above" ? labelY + 4 : axisY + 12} x2={p.x} y2={p.side === "above" ? axisY - 12 : labelY - 12} stroke="var(--fn-rule)" strokeWidth={1} />
                  <Glyph kind={p.kind} x={p.x} y={axisY} />
                  <text
                    x={p.left + 5}
                    y={labelY}
                    textAnchor="start"
                    fill={KIND_COLOR[p.kind]}
                    style={{ font: "600 12px var(--fn-mono)" }}
                  >{p.label}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <figcaption className="fn-meta" style={{ marginTop: 8 }}>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {kinds.map(k => (
            <span key={k} className="inline-flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ overflow: "visible" }}><Glyph kind={k} x={7} y={k === "short_strike" || k === "long_strike" ? 1 : 13} /></svg>
              {KIND_NAME[k]}
            </span>
          ))}
        </span>
        <span className="block" style={{ marginTop: 4 }}>{caption}. Positions are to scale. Only supplied levels and app-calculated values are drawn.</span>
      </figcaption>
    </figure>
  );
}
