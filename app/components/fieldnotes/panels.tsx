"use client";

import type { ReactNode } from "react";
import type { AnalysisOutput } from "../../lib/optionsAnalysis/schema";
import type { CandidatePricing } from "../../lib/optionsAnalysis/pricing";
import type { ResearchLeg } from "../../lib/optionsAnalysis/display";
import { CHECK_LABEL, UNAVAILABLE, fmtAge, fmtDay, fmtEt, fmtLevel, fmtMoney, fmtNum, signalName } from "./format";
import { checkReasonCopy, gapCopy, type Explanation } from "./uiState";
import { DirectionMark, FnIcon } from "./primitives";

type Output = AnalysisOutput;

// ── Thesis (warm paper) ─────────────────────────────────────────────────────

export function ThesisPanel({ output, historicalAt, userSupplied }: { output: Output; historicalAt?: string | null; userSupplied?: boolean }) {
  const signals = output.signals_breakdown;
  return (
    <div className="fn-thesis">
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 8 }}>
        <p className="fn-label">
          Thesis{historicalAt ? ` · historical observation from ${fmtEt(historicalAt)}` : ""}{userSupplied ? " · from your data" : ""}
        </p>
        <span className="fn-meta inline-flex items-center gap-2">
          <DirectionMark direction={output.canonical_direction} />
          {output.regime && <span>· {output.regime}</span>}
        </span>
      </div>
      <p className="fn-thesis-text">{output.thesis}</p>
      {signals.length > 0 && (
        <details className="fn-details" style={{ marginTop: 12 }}>
          <summary>Observations and inferences ({signals.length})</summary>
          <ul className="space-y-2" style={{ marginTop: 6 }}>
            {signals.map(s => (
              <li key={s.signal} className="flex items-start gap-2 flex-wrap" style={{ fontSize: "var(--fn-fs-sm)" }}>
                <span className={`fn-tag ${s.evidence === "INFERRED" ? "fn-tag-inferred" : ""}`}>
                  {s.evidence === "INFERRED" ? "Inferred" : "Observed"}
                </span>
                <span className="min-w-0 flex-1">
                  <span style={{ fontWeight: 600 }}>{signalName(s.signal)}</span>
                  {" — "}{s.reading}
                  <span className="fn-meta"> · {s.supports_direction === true ? "supports the read" : s.supports_direction === false ? "against the read" : "not directional"}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="fn-meta" style={{ marginTop: 8 }}>Observed: a supplied value. Inferred: an interpretation of supplied values, which can be wrong.</p>
        </details>
      )}
    </div>
  );
}

// ── Leg ledger ──────────────────────────────────────────────────────────────

export function LegLedger({ legs, historical }: { legs: ResearchLeg[]; historical: boolean }) {
  const now = new Date();
  return (
    <div className="fn-surface" style={{ padding: 0 }}>
      <div className="fn-scroll-x" tabIndex={0} role="region" aria-label="Option legs table, scrolls horizontally">
        <table className="fn-ledger">
          <caption className="fn-sr-only">All proposed option legs{historical ? " (historical quotes)" : ""}</caption>
          <thead>
            <tr>
              <th scope="col">Side</th>
              <th scope="col" className="fn-r">Qty</th>
              <th scope="col">Type</th>
              <th scope="col" className="fn-r">Strike</th>
              <th scope="col">Expiry</th>
              <th scope="col" className="fn-r">Bid</th>
              <th scope="col" className="fn-r">Ask</th>
              <th scope="col">Quote time</th>
              <th scope="col" className="fn-r">IV</th>
              <th scope="col" className="fn-r">Delta</th>
              <th scope="col" className="fn-r">Open int.</th>
            </tr>
          </thead>
          <tbody>
            {legs.map(l => (
              <tr key={l.contract_id}>
                <td>
                  <span className="fn-side" data-side={l.action}>
                    {l.action === "BUY" ? <FnIcon.ArrowUp size={12} /> : <FnIcon.ArrowDown size={12} />}
                    {l.action === "BUY" ? "Buy" : "Sell"}
                  </span>
                  <div className="fn-meta fn-num" style={{ whiteSpace: "nowrap" }}>{l.contract_id}</div>
                </td>
                <td className="fn-r">{l.quantity}</td>
                <td>{l.type === "CALL" ? "Call" : "Put"}</td>
                <td className="fn-r" style={{ fontWeight: 700 }}>{fmtLevel(l.strike)}</td>
                <td className="fn-numcell">{l.expiry}<div className="fn-meta">{l.dte} days</div></td>
                <td className="fn-r">{fmtNum(l.bid)}</td>
                <td className="fn-r">{fmtNum(l.ask)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {l.quote_timestamp
                    ? <><span className="fn-num">{fmtEt(l.quote_timestamp, now)}</span><div className="fn-meta">{fmtAge(l.quote_timestamp, now)}</div></>
                    : <><span className="fn-caution">{UNAVAILABLE}</span><div className="fn-meta">Last trade {fmtEt(l.last_trade_timestamp, now)}</div></>}
                </td>
                <td className="fn-r">{l.iv === null ? UNAVAILABLE : `${(l.iv * 100).toFixed(1)}%`}</td>
                <td className="fn-r">{l.delta === null ? UNAVAILABLE : l.delta.toFixed(2)}</td>
                <td className="fn-r">{l.open_interest === null ? UNAVAILABLE : l.open_interest.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {legs[0]?.spec && (
        <p className="fn-meta" style={{ padding: "8px 16px 12px", borderTop: "1px solid var(--fn-rule)" }}>
          Contract terms: {legs[0].spec.deliverable}, {legs[0].spec.multiplier}× multiplier, {legs[0].spec.exercise_style === "AMERICAN" ? "American" : "European"}-style, {legs[0].spec.settlement === "PHYSICAL" ? "physical" : "cash"} settlement.
          {legs.some(l => l.action === "SELL") && legs[0].spec.exercise_style === "AMERICAN" && " Sold legs can be assigned early."}
        </p>
      )}
    </div>
  );
}

// ── Application-calculated estimates ────────────────────────────────────────

export function EstimatePanel({ pricing }: { pricing: CandidatePricing }) {
  const perShare = pricing.natural_net;
  return (
    <div className="fn-surface">
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div>
          <p className="fn-label">Estimated max loss</p>
          <p className="fn-num fn-neg" style={{ fontSize: "var(--fn-fs-xl)", fontWeight: 700, margin: 0 }}>{fmtMoney(pricing.max_loss)}</p>
          <p className="fn-meta">Per structure (1 of each leg × {pricing.multiplier})</p>
        </div>
        <div>
          <p className="fn-label">Estimated max gain</p>
          <p className="fn-num fn-pos" style={{ fontSize: "var(--fn-fs-xl)", fontWeight: 700, margin: 0 }}>{pricing.max_gain === null ? "Uncapped" : fmtMoney(pricing.max_gain)}</p>
          <p className="fn-meta">Per structure</p>
        </div>
        <div>
          <p className="fn-label">Breakeven at expiry</p>
          <p className="fn-num" style={{ fontSize: "var(--fn-fs-xl)", fontWeight: 700, margin: 0 }}>{pricing.breakevens.map(fmtLevel).join(" / ")}</p>
          <p className="fn-meta">Underlying price</p>
        </div>
      </div>
      <hr className="fn-divider" />
      <dl className="fn-kv" style={{ fontSize: "var(--fn-fs-sm)" }}>
        <dt className="fn-text-2">Net {pricing.net_type === "DEBIT" ? "debit" : "credit"}, conservative</dt>
        <dd className="fn-num" style={{ margin: 0 }}>{fmtNum(perShare)} per share · {fmtMoney(perShare * pricing.multiplier)} per structure</dd>
        <dt className="fn-text-2">Net at midpoints</dt>
        <dd className="fn-num" style={{ margin: 0 }}>{fmtNum(pricing.mid_net)} per share (reference only)</dd>
      </dl>
      <p className="fn-meta" style={{ marginTop: 10 }}>
        Calculated by the app, not the analyst. Basis: conservative fill — pay the ask on bought legs, receive the bid on sold legs — from delayed quotes.
        Excludes fees and commissions. Real fills, early assignment and gaps can change results. No position size or account balance is assumed.
      </p>
    </div>
  );
}

// ── Management: invalidation + time stop + profit plan ──────────────────────

function invalidationKind(condition: string): string {
  if (/daily close/i.test(condition)) return "Daily candle close";
  if (/cross/i.test(condition)) return "Price crossing";
  return "Supplied condition";
}

export function ManagementPanel({ output, expiry }: { output: Output; expiry: string | null }) {
  const inv = output.key_levels.invalidation;
  const ps = output.proposed_structure;
  if (!inv || !ps) return null;
  const tr = ps.time_rule;
  const reviewDate = tr.type === "REVIEW_AT_DTE" && tr.dte !== null && expiry
    ? new Date(Date.parse(expiry + "T12:00:00Z") - tr.dte * 86_400_000).toISOString().slice(0, 10)
    : null;
  const rows: { k: string; v: ReactNode; meta?: ReactNode }[] = [
    {
      k: "Invalidation",
      v: (
        <span className="fn-num">
          {inv.lower_price !== null && <>below <strong className="fn-neg">{fmtLevel(inv.lower_price)}</strong></>}
          {inv.lower_price !== null && inv.upper_price !== null && " or "}
          {inv.upper_price !== null && <>above <strong className="fn-neg">{fmtLevel(inv.upper_price)}</strong></>}
        </span>
      ),
      meta: <>{invalidationKind(inv.condition)} — {inv.condition}</>,
    },
    {
      k: "Time stop",
      v: tr.type === "REVIEW_AT_DTE" ? <>Review at <span className="fn-num">{tr.dte}</span> days to expiry</> : <>Exit by <span className="fn-num">{tr.date}</span></>,
      meta: reviewDate ? <>Around {fmtDay(reviewDate)} · expiry {expiry ? fmtDay(expiry) : UNAVAILABLE}</> : expiry ? <>Expiry {fmtDay(expiry)}</> : undefined,
    },
    {
      k: "Profit plan",
      v: ps.profit_plan.target_level !== null
        ? <>Toward <span className="fn-num fn-pos" style={{ fontWeight: 700 }}>{fmtLevel(ps.profit_plan.target_level)}</span></>
        : <>Time-based</>,
      meta: ps.profit_plan.note,
    },
  ];
  return (
    <div className="fn-surface">
      <dl className="space-y-3">
        {rows.map(r => (
          <div key={r.k} className="grid gap-x-4" style={{ gridTemplateColumns: "minmax(96px, 120px) minmax(0, 1fr)" }}>
            <dt className="fn-label">{r.k}</dt>
            <dd style={{ margin: 0 }}>
              <div>{r.v}</div>
              {r.meta && <div className="fn-meta">{r.meta}</div>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="fn-meta" style={{ marginTop: 12 }}>A plan can&apos;t guarantee a fill at a level — prices can gap past it.</p>
    </div>
  );
}

// ── Checklist, risks, gaps ──────────────────────────────────────────────────

export function ChecklistList({ checklist }: { checklist: Output["checklist"] }) {
  const passes = checklist.filter(c => c.result === "PASS").length;
  return (
    <div>
      <p className="fn-label" style={{ marginBottom: 6 }}>{passes} of 7 checks pass</p>
      <ul className="space-y-2">
        {checklist.map(c => (
          <li key={c.item} className="flex items-start gap-2" style={{ fontSize: "var(--fn-fs-sm)" }}>
            <span className={c.result === "PASS" ? "fn-pos" : undefined} style={{ marginTop: 3, color: c.result === "PASS" ? undefined : "var(--fn-muted)" }}>
              {c.result === "PASS" ? <FnIcon.Check /> : <FnIcon.Cross />}
            </span>
            <span className="min-w-0">
              <span style={{ fontWeight: 650 }}>{CHECK_LABEL[c.item] ?? c.item}</span>
              <span className="fn-meta"> · {c.result === "PASS" ? "Pass" : "Fail"}</span>
              <span className="block fn-text-2" style={{ overflowWrap: "anywhere" }}>{checkReasonCopy(c.reason)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DataGapList({ gaps }: { gaps: string[] }) {
  if (gaps.length === 0) return <p className="fn-meta">No data gaps recorded.</p>;
  return (
    <ul className="space-y-2">
      {gaps.map(g => (
        <li key={g} className="flex items-start gap-2" style={{ fontSize: "var(--fn-fs-sm)" }}>
          <span className="fn-caution" style={{ marginTop: 3 }}><FnIcon.Minus /></span>
          <span className="fn-text-2">{gapCopy(g)}</span>
        </li>
      ))}
    </ul>
  );
}

// ── No-trade panel: calm, complete, with a real next step ───────────────────

export function NoTradePanel({ explanation, observation, onRefresh, refreshing, onSupply }: {
  explanation: Explanation;
  observation: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  onSupply?: () => void;
}) {
  const { title, body, next, refreshBlockedReason } = explanation;
  return (
    <div>
      <p className="fn-h3" style={{ fontSize: "var(--fn-fs-lg)" }}>{title}</p>
      <p className="fn-text-2" style={{ marginTop: 4 }}>{body}</p>
      {observation && observation !== body && <p className="fn-meta" style={{ marginTop: 6, overflowWrap: "anywhere" }}>Observed: {observation}</p>}
      <div style={{ marginTop: 12 }}>
        <p className="fn-label">Next step</p>
        <p style={{ fontSize: "var(--fn-fs-sm)" }}>{next.label}. <span className="fn-text-2">{next.help}</span></p>
      </div>
      <div className="flex flex-col gap-2" style={{ marginTop: 12 }}>
        {next.kind === "supply" && onSupply && (
          <button type="button" className="fn-btn fn-btn-primary fn-btn-block" onClick={onSupply}>{next.label}</button>
        )}
        {onRefresh && (
          <div>
            <button
              type="button"
              className={`fn-btn fn-btn-block ${next.kind === "refresh" ? "fn-btn-primary" : ""}`}
              onClick={onRefresh}
              disabled={!!refreshBlockedReason || refreshing}
              aria-describedby={refreshBlockedReason ? "fn-refresh-why" : undefined}
            >
              <FnIcon.Refresh /> {refreshing ? "Refreshing…" : "Refresh data"}
            </button>
            {refreshBlockedReason && <p id="fn-refresh-why" className="fn-meta" style={{ marginTop: 4 }}>{refreshBlockedReason}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
