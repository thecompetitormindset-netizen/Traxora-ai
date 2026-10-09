"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ResearchDetail } from "../../lib/optionsAnalysis/display";
import type { AnalysisOutput } from "../../lib/optionsAnalysis/schema";
import { appendNotebook, changesSince, loadNotebook, NOTEBOOK_EVENT, type NotebookEntry } from "../../lib/analysisNotebook";
import { DirectionMark, FnIcon, Notice, ObservationStrip, PaperBadge, Stage, StateBadge, type Observation } from "./primitives";
import { ChecklistList, DataGapList, EstimatePanel, LegLedger, ManagementPanel, NoTradePanel, ThesisPanel } from "./panels";
import RangeDiagram from "./RangeDiagram";
import LevelsChart, { type ChartLevel } from "./LevelsChart";
import { STATE_LABEL, explain, stateOf, type UiState } from "./uiState";
import { EXAMPLE_SYMBOL, UNAVAILABLE, fmtAge, fmtDay, fmtEt, fmtLevel, fmtMoney, fmtSignedPct, strategyName } from "./format";

export type ResearchActions = {
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshMessage?: string | null;
  onSupply?: () => void;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function selectedExpiry(d: ResearchDetail): string | null {
  return d.legs?.[0]?.expiry ?? null;
}

function shownOutput(d: ResearchDetail): AnalysisOutput | null {
  return d.display.output ?? d.historical;
}

function chartLevels(d: ResearchDetail, o: AnalysisOutput | null): ChartLevel[] {
  const out: ChartLevel[] = [];
  const inv = o?.key_levels.invalidation;
  const target = o?.proposed_structure?.profit_plan.target_level ?? null;
  if (target !== null) out.push({ price: target, label: "Target", group: "plan", tone: "pos", style: "solid" });
  if (inv?.lower_price != null) out.push({ price: inv.lower_price, label: "Invalidation", group: "plan", tone: "neg", style: "dashed" });
  if (inv?.upper_price != null) out.push({ price: inv.upper_price, label: "Invalidation", group: "plan", tone: "neg", style: "dashed" });
  const planned = new Set(out.map(l => l.price));
  for (const s of d.levels.support ?? []) if (!planned.has(s.price)) out.push({ price: s.price, label: s.label.replace(/ \d{4}-\d{2}-\d{2}$/, ""), group: "levels", tone: "muted", style: "dotted" });
  for (const s of d.levels.resistance ?? []) if (!planned.has(s.price)) out.push({ price: s.price, label: s.label.replace(/ \d{4}-\d{2}-\d{2}$/, ""), group: "levels", tone: "muted", style: "dotted" });
  for (const l of d.legs ?? []) out.push({ price: l.strike, label: `${l.action === "SELL" ? "Sold" : "Bought"} ${l.type.toLowerCase()}`, group: "strikes", tone: "copper", style: "dashed" });
  const em = d.expiries.find(e => e.expiry === selectedExpiry(d))?.expected_move ?? d.expiries.find(e => e.expected_move)?.expected_move;
  if (em) {
    out.push({ price: em.lower, label: "EM low", group: "expected", tone: "info", style: "dotted" });
    out.push({ price: em.upper, label: "EM high", group: "expected", tone: "info", style: "dotted" });
  }
  return out;
}

function observations(d: ResearchDetail): Observation[] {
  const now = new Date();
  const u = d.underlying;
  const delayedSource = !d.user_supplied;
  const priceSrc = u.price === null ? "unavailable" : u.freshness.status === "FRESH" ? (delayedSource ? "delayed" : "fresh") : "historical";
  const legsWithTimes = (d.legs ?? []).filter(l => l.quote_timestamp);
  // With legs selected, report the oldest leg's quote time; every leg needs one.
  const anyQuoteTime = !!d.legs?.length && legsWithTimes.length === d.legs.length;
  const oldestLeg = anyQuoteTime ? [...legsWithTimes].sort((a, b) => Date.parse(a.quote_timestamp!) - Date.parse(b.quote_timestamp!))[0] : null;
  const em = d.expiries.find(e => e.expiry === selectedExpiry(d))?.expected_move ?? d.expiries.find(e => e.expected_move)?.expected_move ?? null;
  const cboe = d.sources.find(s => /CBOE/.test(s.name));
  return [
    {
      label: "Underlying",
      value: u.price === null ? UNAVAILABLE : fmtLevel(u.price),
      time: u.price === null ? "no timestamp" : fmtEt(u.price_timestamp, now),
      src: priceSrc,
      srcLabel: u.price === null ? "Not received" : `${u.price_timestamp_kind === "QUOTE" ? "Quote" : "Last trade"}${delayedSource ? ", delayed" : ", your data"}${u.freshness.status === "STALE" ? ", out of date" : ""}`,
    },
    {
      label: "Session",
      value: d.session.status === "OPEN" ? "Open" : d.session.status === "CLOSED" ? "Closed" : "Unknown",
      time: d.session.detail,
      src: d.session.status === "OPEN" ? "fresh" : d.session.status === "CLOSED" ? "historical" : "unavailable",
      srcLabel: `${d.session.calendar}${d.session.early_close ? ", early close" : ""}`,
    },
    oldestLeg
      ? {
        label: "Option quote time", value: fmtEt(oldestLeg.quote_timestamp, now),
        time: `oldest leg, ${fmtAge(oldestLeg.quote_timestamp, now) ?? ""}`,
        src: oldestLeg.freshness.status === "FRESH" ? "fresh" : "historical",
        srcLabel: d.user_supplied ? "Your data" : "Quote",
      }
      : d.user_supplied
        ? { label: "Option quote time", value: "Per contract", time: "no legs selected", src: "unavailable", srcLabel: "Your data" }
        : {
          label: "Option quote time", value: UNAVAILABLE, valueClass: "fn-caution",
          time: cboe?.snapshot_timestamp ? `snapshot ${fmtEt(cboe.snapshot_timestamp, now)}` : "no per-quote times",
          src: "unavailable", srcLabel: "CBOE delayed",
        },
    {
      label: "Expected move",
      value: em ? `±${fmtLevel(em.amount)}` : UNAVAILABLE,
      time: em ? `to ${fmtDay(em.expiry)}` : "no matching expiry",
      src: em ? (delayedSource ? "delayed" : "fresh") : "unavailable",
      srcLabel: em ? "App estimate" : "Unavailable",
    },
  ];
}

function notebookEntry(d: ResearchDetail, state: UiState): NotebookEntry {
  const o = shownOutput(d);
  const ps = o?.proposed_structure ?? null;
  const exp = o && o.trade_decision === "NO_TRADE" ? explain(o, d.session.status === "OPEN") : null;
  return {
    id: `${d.display.symbol}-${Date.now()}`,
    saved_at: new Date().toISOString(),
    symbol: d.display.symbol,
    source_as_of: d.display.as_of,
    state,
    state_label: STATE_LABEL[state],
    decision: o?.trade_decision ?? null,
    reason_title: exp?.title ?? null,
    direction: o?.canonical_direction ?? null,
    thesis: o?.thesis ?? null,
    strategy: ps ? strategyName(ps.strategy) : null,
    legs: ps?.legs.map(l => ({ action: l.action, type: l.type, strike: l.strike, expiry: l.expiry })) ?? [],
    invalidation: o?.key_levels.invalidation ? { lower: o.key_levels.invalidation.lower_price, upper: o.key_levels.invalidation.upper_price, condition: o.key_levels.invalidation.condition } : null,
    target: ps?.profit_plan.target_level ?? null,
    time_rule: ps ? (ps.time_rule.type === "REVIEW_AT_DTE" ? `Review at ${ps.time_rule.dte} days to expiry` : `Exit by ${ps.time_rule.date}`) : null,
    max_loss: d.display.status === "PAPER_CANDIDATE" ? d.display.pricing?.max_loss ?? null : null,
    pricing_basis: d.display.status === "PAPER_CANDIDATE" ? "Conservative fill from delayed quotes, per structure" : null,
    user_supplied: d.user_supplied,
  };
}

// ── Decision summary ────────────────────────────────────────────────────────

function DecisionSummary({ d, state, actions }: { d: ResearchDetail; state: UiState; actions: ResearchActions }) {
  const o = shownOutput(d);
  const [saved, setSaved] = useState<"idle" | "saved" | "failed">("idle");
  const sessionOpen = d.session.status === "OPEN";
  const ps = d.display.output?.proposed_structure ?? null;
  const pricing = d.display.pricing;
  const passes = o ? o.checklist.filter(c => c.result === "PASS").length : 0;

  function save() {
    setSaved(appendNotebook(notebookEntry(d, state)) ? "saved" : "failed");
  }

  return (
    <div className="fn-surface fn-elevated">
      <p className="fn-caps">Decision</p>
      <div className="flex flex-wrap gap-2" style={{ margin: "8px 0 12px" }}>
        <StateBadge state={state} />
        <PaperBadge />
      </div>

      {state === "validated" && ps && pricing && o && (
        <>
          <p className="fn-h3" style={{ fontSize: "var(--fn-fs-lg)" }}>{strategyName(ps.strategy)}</p>
          <p className="fn-meta"><DirectionMark direction={o.canonical_direction} /> · expiry {fmtDay(ps.legs[0].expiry)}</p>
          <div className="fn-raised" style={{ padding: 12, marginTop: 12 }}>
            <p className="fn-label">Estimated max loss</p>
            <p className="fn-num fn-neg" style={{ fontSize: "var(--fn-fs-xl)", fontWeight: 700, margin: 0 }}>{fmtMoney(pricing.max_loss)}</p>
            <p className="fn-meta">Per structure, conservative fill, before fees. App-calculated.</p>
          </div>
          <dl className="space-y-2" style={{ marginTop: 12, fontSize: "var(--fn-fs-sm)" }}>
            <div><dt className="fn-label">Evidence strength</dt><dd style={{ margin: 0 }}>{o.confidence_band.charAt(0) + o.confidence_band.slice(1).toLowerCase()} · {passes} of 7 checks pass</dd></div>
            {o.key_levels.invalidation && <div><dt className="fn-label">Invalidation</dt><dd style={{ margin: 0 }}>{o.key_levels.invalidation.condition}</dd></div>}
            <div><dt className="fn-label">Time stop</dt><dd style={{ margin: 0 }}>{ps.time_rule.type === "REVIEW_AT_DTE" ? `Review at ${ps.time_rule.dte} days to expiry` : `Exit by ${ps.time_rule.date}`}</dd></div>
          </dl>
          <p className="fn-meta" style={{ marginTop: 8 }}>Evidence strength describes how much supplied evidence agrees. It is not a chance of success.</p>
        </>
      )}

      {(state === "no_trade" || state === "unavailable") && o && (
        <NoTradePanel
          explanation={explain(o, sessionOpen)}
          observation={o.no_trade_reason?.detail ?? null}
          onRefresh={actions.onRefresh}
          refreshing={actions.refreshing}
          onSupply={actions.onSupply}
        />
      )}

      {state === "expired" && (
        <>
          <p className="fn-h3" style={{ fontSize: "var(--fn-fs-lg)" }}>Freshness window ended</p>
          <p className="fn-text-2" style={{ marginTop: 4 }}>{d.display.note}</p>
          <p className="fn-meta" style={{ marginTop: 6 }}>The thesis, levels and legs below are a historical observation. Estimates and actions are withheld until a fresh run passes every check.</p>
          {actions.onRefresh && (
            <button type="button" className="fn-btn fn-btn-primary fn-btn-block" style={{ marginTop: 12 }} onClick={actions.onRefresh} disabled={actions.refreshing || !sessionOpen} aria-describedby={!sessionOpen ? "fn-exp-why" : undefined}>
              <FnIcon.Refresh /> {actions.refreshing ? "Refreshing…" : "Re-run checks"}
            </button>
          )}
          {!sessionOpen && <p id="fn-exp-why" className="fn-meta" style={{ marginTop: 4 }}>The market is closed, so a re-run can&apos;t produce current quotes.</p>}
        </>
      )}

      {state === "error" && (
        <>
          <p className="fn-h3" style={{ fontSize: "var(--fn-fs-lg)" }}>Analysis not shown</p>
          <p className="fn-text-2" style={{ marginTop: 4 }}>{d.display.note ?? "The result failed the app's checks, so nothing from it is displayed."}</p>
          {actions.onRefresh && (
            <button type="button" className="fn-btn fn-btn-block" style={{ marginTop: 12 }} onClick={actions.onRefresh} disabled={actions.refreshing}>
              <FnIcon.Refresh /> {actions.refreshing ? "Refreshing…" : "Try again"}
            </button>
          )}
        </>
      )}

      {actions.refreshMessage && <p className="fn-meta" role="status" style={{ marginTop: 8 }}>{actions.refreshMessage}</p>}

      <hr className="fn-divider" />
      <div className="flex flex-col gap-2">
        <button type="button" className={`fn-btn fn-btn-block ${state === "validated" ? "fn-btn-primary" : ""}`} onClick={save} disabled={!o}>
          <FnIcon.Notebook /> Save to notebook
        </button>
        {state === "validated" && actions.onRefresh && (
          <button type="button" className="fn-btn fn-btn-block" onClick={actions.onRefresh} disabled={actions.refreshing}>
            <FnIcon.Refresh /> {actions.refreshing ? "Refreshing…" : "Refresh data"}
          </button>
        )}
        <div>
          <button type="button" className="fn-btn fn-btn-block" disabled aria-describedby="fn-paper-why">Preview paper position</button>
          <p id="fn-paper-why" className="fn-meta" style={{ marginTop: 4 }}>
            Not available: the <Link href="/paper" className="underline">paper portfolio</Link>{" "}records stock positions only. Options paper positions aren&apos;t supported yet.
          </p>
        </div>
      </div>
      <div role="status" aria-live="polite">
        {saved === "saved" && <p className="fn-meta" style={{ marginTop: 8 }}>Saved to your notebook on this device. <Link href="/journal#analysis-notebook" className="underline">View in journal</Link></p>}
        {saved === "failed" && <p className="fn-meta fn-neg" style={{ marginTop: 8 }}>Couldn&apos;t save — this browser is blocking local storage.</p>}
      </div>
      <p className="fn-meta" style={{ marginTop: 12 }}>
        Analysis as of {fmtEt(d.display.as_of)} · rules-based, no AI model{d.user_supplied ? " · your data, not stored" : ""}
      </p>
    </div>
  );
}

// ── Notebook history for this symbol ────────────────────────────────────────

function NotebookHistory({ symbol }: { symbol: string }) {
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  useEffect(() => {
    const load = () => setEntries(loadNotebook().filter(e => e.symbol === symbol));
    load();
    window.addEventListener(NOTEBOOK_EVENT, load);
    return () => window.removeEventListener(NOTEBOOK_EVENT, load);
  }, [symbol]);
  if (entries.length === 0) return <p className="fn-meta">Nothing saved for {symbol} yet. Saved analyses keep the evidence exactly as it was.</p>;
  return (
    <ol className="space-y-3">
      {entries.slice(0, 6).map((e, i) => {
        const older = entries[i + 1];
        const changes = older ? changesSince(older, e) : [];
        return (
          <li key={e.id} className="fn-raised" style={{ padding: 12 }}>
            <p style={{ fontSize: "var(--fn-fs-sm)", fontWeight: 650 }}>
              {e.state_label}{e.strategy ? ` · ${e.strategy}` : e.reason_title ? ` · ${e.reason_title}` : ""}
            </p>
            <p className="fn-meta">Saved {fmtEt(e.saved_at)} · source {fmtEt(e.source_as_of)}{e.user_supplied ? " · your data" : ""}</p>
            {changes.length > 0 && <p className="fn-meta fn-caution" style={{ marginTop: 4 }}>Changed since previous save: {changes.join("; ")}</p>}
          </li>
        );
      })}
    </ol>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────

export default function ResearchView({ detail: d, actions }: { detail: ResearchDetail; actions: ResearchActions }) {
  const state = stateOf(d.display);
  const o = shownOutput(d);
  const historical = state === "expired";
  const fictional = d.user_supplied && d.display.symbol === EXAMPLE_SYMBOL;
  const levels = useMemo(() => chartLevels(d, o), [d, o]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(d.display.as_of));
  const bars = d.bars ?? [];
  const inProgress = bars.at(-1)?.date === today && d.session.status === "OPEN";
  const ps = o?.proposed_structure ?? null;
  const expiry = selectedExpiry(d);
  const em = d.expiries.find(e => e.expiry === expiry)?.expected_move ?? null;

  return (
    <div className="fn-research">
      <header className="fn-a-head space-y-3">
        {fictional && (
          <Notice tone="info" title="Fictional example data">This is a synthetic example to show how the analysis works. It is not market data and not a recommendation.</Notice>
        )}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="fn-caps">{d.user_supplied ? "Research · your data" : "Research"}</p>
            <h1 className="fn-title" style={{ overflowWrap: "anywhere" }}>{d.display.symbol}</h1>
          </div>
          <p className="fn-num" style={{ fontSize: "var(--fn-fs-lg)" }}>
            {fmtLevel(d.display.price)}{" "}
            {d.display.change_pct !== null && (
              <span className={d.display.change_pct >= 0 ? "fn-pos" : "fn-neg"} style={{ fontSize: "var(--fn-fs-sm)" }}>
                {fmtSignedPct(d.display.change_pct)} vs prior close
              </span>
            )}
          </p>
        </div>
        <ObservationStrip items={observations(d)} label="Market observations with source time" />
      </header>

      <aside className="fn-a-decision" aria-label="Decision summary">
        <DecisionSummary d={d} state={state} actions={actions} />
      </aside>

      <Stage id="obs" n={1} title="Observation" className="fn-a-thesis">
        {o
          ? <ThesisPanel output={o} historicalAt={historical ? d.display.as_of : null} userSupplied={d.user_supplied} />
          : <Notice tone="caution" title="No thesis to show">The analysis failed the app&apos;s checks, so its reasoning isn&apos;t displayed. The price chart below uses the same source data.</Notice>}
      </Stage>

      <Stage id="levels" n={2} title="Price and levels" className="fn-a-chart">
        <div className="fn-surface space-y-5">
          <LevelsChart bars={bars} levels={levels} todayLabel={inProgress ? "latest bar is today's session in progress" : null} dataLabel={historical ? "Historical" : d.user_supplied ? "Your" : "Delayed"} />
          <div>
            <p className="fn-label" style={{ marginBottom: 6 }}>Range</p>
            <RangeDiagram
              caption={ps ? "Current price, plan levels and strikes" : "Current price and supplied levels"}
              input={{
                price: d.display.price,
                target: ps?.profit_plan.target_level ?? null,
                invalidation: o?.key_levels.invalidation ? { lower: o.key_levels.invalidation.lower_price, upper: o.key_levels.invalidation.upper_price } : null,
                support: ps ? [] : (d.levels.support ?? []).slice(0, 2).map(l => l.price),
                resistance: ps ? [] : (d.levels.resistance ?? []).slice(0, 2).map(l => l.price),
                legs: d.legs?.map(l => ({ strike: l.strike, action: l.action, type: l.type })) ?? [],
                expectedMove: em ? { lower: em.lower, upper: em.upper } : null,
              }}
            />
          </div>
        </div>
      </Stage>

      <Stage id="structure" n={3} title="Candidate structure" muted={!ps} className="fn-a-legs"
        aside={ps ? <span className="fn-meta">{strategyName(ps.strategy)} · {d.legs?.length ?? 0} legs{historical ? " · historical" : ""}</span> : undefined}>
        {ps && d.legs
          ? (
            <div className="space-y-3">
              <LegLedger legs={d.legs} historical={historical} />
              {state === "validated" && d.display.pricing
                ? <EstimatePanel pricing={d.display.pricing} />
                : <p className="fn-meta">Estimates are withheld: they are only shown for a candidate that is current and validated.</p>}
            </div>
          )
          : <p className="fn-meta" style={{ paddingTop: 2 }}>No structure proposed. A candidate appears here only when every gate passes on supplied evidence.</p>}
      </Stage>

      <Stage id="exit" n={4} title="Invalidation and exit" muted={!ps} className="fn-a-manage">
        {ps && o
          ? <ManagementPanel output={o} expiry={expiry} />
          : <p className="fn-meta" style={{ paddingTop: 2 }}>No exit plan without a candidate. Supplied levels are on the chart above.</p>}
      </Stage>

      <section className="fn-a-evidence fn-surface space-y-5" aria-labelledby="evidence-h">
        <h2 id="evidence-h" className="fn-h2">Supporting evidence</h2>
        {o && <ChecklistList checklist={o.checklist} />}
        {o && o.risks.length > 0 && (
          <div>
            <p className="fn-label" style={{ marginBottom: 6 }}>Risks and disagreements</p>
            <ul className="space-y-1" style={{ fontSize: "var(--fn-fs-sm)" }}>
              {o.risks.map(r => <li key={r} className="flex gap-2"><span className="fn-caution" style={{ marginTop: 3 }}><FnIcon.Alert size={12} /></span><span className="fn-text-2">{r}</span></li>)}
            </ul>
          </div>
        )}
        <div>
          <p className="fn-label" style={{ marginBottom: 6 }}>Data gaps</p>
          <DataGapList gaps={o?.data_gaps ?? []} />
        </div>
        <div>
          <p className="fn-label" style={{ marginBottom: 6 }}>Event coverage by expiry</p>
          {d.expiries.length === 0 ? <p className="fn-meta">No eligible expiries in this analysis.</p> : (
            <ul className="space-y-1" style={{ fontSize: "var(--fn-fs-sm)" }}>
              {d.expiries.map(e => (
                <li key={e.expiry} className="flex flex-wrap gap-x-2">
                  <span className="fn-num">{e.expiry}</span>
                  <span className="fn-text-2">
                    {e.event_coverage.status === "UNKNOWN"
                      ? "Event coverage unavailable"
                      : e.event_coverage.events.length
                        ? e.event_coverage.events.map(ev => `${ev.name} on ${ev.date}`).join(", ")
                        : `No events in verified coverage (through ${e.event_coverage.covered_through})`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <details className="fn-details">
          <summary>Sources and rules</summary>
          <ul className="space-y-1" style={{ fontSize: "var(--fn-fs-sm)", marginTop: 4 }}>
            {d.sources.map(s => (
              <li key={s.name}><span style={{ fontWeight: 600 }}>{s.name}</span> <span className="fn-text-2">— {s.note}{s.snapshot_timestamp ? ` · snapshot ${fmtEt(s.snapshot_timestamp)}` : ""}</span></li>
            ))}
            {d.rules && (
              <li className="fn-text-2">
                Rules: {d.rules.min_swing_dte}–{d.rules.max_swing_dte} days to expiry; underlying no older than {Math.round(d.rules.max_underlying_age_seconds / 60)} min;
                open interest at least {d.rules.min_open_interest.toLocaleString("en-US")}; bid/ask spread at most {Math.round(d.rules.max_spread_pct_of_mid * 100)}% of midpoint.
              </li>
            )}
          </ul>
        </details>
        <div>
          <p className="fn-label" style={{ marginBottom: 6 }}>Your notebook for {d.display.symbol}</p>
          <NotebookHistory symbol={d.display.symbol} />
        </div>
        {o && <p className="fn-meta">{o.disclaimer}</p>}
      </section>
    </div>
  );
}
