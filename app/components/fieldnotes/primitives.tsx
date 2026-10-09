"use client";

import "./fieldnotes.css";
import type { ReactNode } from "react";
import { STATE_HELP, STATE_LABEL, type UiState } from "./uiState";

// ── Icons (simple strokes, currentColor) ────────────────────────────────────

type IconProps = { size?: number };
const svg = (size: number, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const FnIcon = {
  Check: ({ size = 14 }: IconProps) => svg(size, <polyline points="20 6 9 17 4 12" />),
  Cross: ({ size = 14 }: IconProps) => svg(size, <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  Pause: ({ size = 14 }: IconProps) => svg(size, <><line x1="9" y1="5" x2="9" y2="19" /><line x1="15" y1="5" x2="15" y2="19" /></>),
  Clock: ({ size = 14 }: IconProps) => svg(size, <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>),
  Minus: ({ size = 14 }: IconProps) => svg(size, <><circle cx="12" cy="12" r="9" /><line x1="8" y1="12" x2="16" y2="12" /></>),
  Alert: ({ size = 14 }: IconProps) => svg(size, <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
  Dots: ({ size = 14 }: IconProps) => svg(size, <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>),
  Circle: ({ size = 14 }: IconProps) => svg(size, <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />),
  Notebook: ({ size = 14 }: IconProps) => svg(size, <><rect x="5" y="3" width="14" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="12" y1="8" x2="16" y2="8" /></>),
  ArrowUp: ({ size = 14 }: IconProps) => svg(size, <><line x1="7" y1="17" x2="17" y2="7" /><polyline points="8 7 17 7 17 16" /></>),
  ArrowDown: ({ size = 14 }: IconProps) => svg(size, <><line x1="7" y1="7" x2="17" y2="17" /><polyline points="17 8 17 17 8 17" /></>),
  Range: ({ size = 14 }: IconProps) => svg(size, <><line x1="4" y1="12" x2="20" y2="12" /><polyline points="7 9 4 12 7 15" /><polyline points="17 9 20 12 17 15" /></>),
  Refresh: ({ size = 14 }: IconProps) => svg(size, <><polyline points="23 4 23 10 17 10" /><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10" /></>),
  Search: ({ size = 16 }: IconProps) => svg(size, <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>),
};

const STATE_ICON: Record<UiState, ReactNode> = {
  analyzing: <FnIcon.Dots />,
  candidate: <FnIcon.Circle />,
  validated: <FnIcon.Check />,
  paper: <FnIcon.Notebook />,
  no_trade: <FnIcon.Pause />,
  expired: <FnIcon.Clock />,
  unavailable: <FnIcon.Minus />,
  error: <FnIcon.Alert />,
};

export function StateBadge({ state, label }: { state: UiState; label?: string }) {
  return (
    <span className="fn-badge" data-state={state} title={STATE_HELP[state]}>
      {STATE_ICON[state]}
      <span>{label ?? STATE_LABEL[state]}</span>
    </span>
  );
}

export function PaperBadge() {
  return <StateBadge state="paper" />;
}

export function DirectionMark({ direction }: { direction: "BULLISH" | "BEARISH" | "NEUTRAL" }) {
  const cls = direction === "BULLISH" ? "fn-pos" : direction === "BEARISH" ? "fn-neg" : "fn-info";
  const icon = direction === "BULLISH" ? <FnIcon.ArrowUp /> : direction === "BEARISH" ? <FnIcon.ArrowDown /> : <FnIcon.Range />;
  const word = direction === "BULLISH" ? "Bullish" : direction === "BEARISH" ? "Bearish" : "Neutral";
  return <span className={`inline-flex items-center gap-1 font-semibold ${cls}`}>{icon}{word}</span>;
}

// ── Observation strip ───────────────────────────────────────────────────────

export type SourceState = "fresh" | "delayed" | "unavailable" | "historical";
export type Observation = {
  label: string;
  value: ReactNode;
  valueClass?: string;
  time: string;              // already formatted ("15:59 ET", "Unavailable")
  src: SourceState;
  srcLabel: string;          // "Delayed", "Last trade", "Quote time unavailable", …
};

export function ObservationStrip({ items, label }: { items: Observation[]; label: string }) {
  return (
    <dl className="fn-strip" aria-label={label}>
      {items.map(o => (
        <div key={o.label} className="fn-obs">
          <dt className="fn-meta">{o.label}</dt>
          <dd className={`fn-obs-value ${o.valueClass ?? ""}`}>{o.value}</dd>
          <dd className="fn-obs-meta">
            <span className="fn-src" data-src={o.src} aria-hidden="true" />
            <span>{o.srcLabel} · {o.time}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── Evidence rail stage ─────────────────────────────────────────────────────

export function Stage({ id, n, title, aside, children, muted, className = "" }: {
  id: string; n: number; title: string; aside?: ReactNode; children: ReactNode; muted?: boolean; className?: string;
}) {
  return (
    <section className={`fn-stage ${className}`} aria-labelledby={`${id}-h`}>
      <span className="fn-stage-node" data-muted={muted ? "" : undefined} aria-hidden="true">{n}</span>
      <div className="fn-stage-head">
        <h2 id={`${id}-h`} className="fn-h2">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Notice({ tone, title, children, icon }: { tone: "paper" | "caution" | "error" | "info"; title?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="fn-notice" data-tone={tone} role={tone === "error" ? "alert" : undefined}>
      {icon && <span className={tone === "paper" ? "fn-copper" : tone === "caution" ? "fn-caution" : tone === "error" ? "fn-neg" : "fn-info"} style={{ marginTop: 2 }}>{icon}</span>}
      <div className="min-w-0">
        {title && <p className="fn-h3" style={{ marginBottom: 2 }}>{title}</p>}
        <div className="fn-text-2">{children}</div>
      </div>
    </div>
  );
}

export function PaperNotice() {
  return (
    <Notice tone="paper" icon={<FnIcon.Notebook size={16} />} title="Paper trading only">
      Educational analysis, not financial advice. Nothing here is an instruction to place a live trade. Options involve risk of loss, including the full amount invested.
    </Notice>
  );
}
