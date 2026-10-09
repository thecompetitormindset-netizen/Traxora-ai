"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";
import { scopedKey, setCurrentUser } from "../lib/userState";
import { haptic } from "../lib/haptics";
import { syncFetch } from "../lib/syncFetch";
import {
  catchUp, closeNow, isMarketOpen, marketStatusText, placeOrder, profit, profitPct, summarize, tick,
  DEFAULT_START, SLIPPAGE, type Bar, type EngineEvent, type OrderType, type PaperOrder, type Quote, type Side,
} from "../lib/paperEngine";

const TraxoraChart = dynamic(() => import("@/app/components/TraxoraChart"), { ssr: false });

// Practice trading. Rules live in app/lib/paperEngine.ts (tested); this page is
// storage, quotes and the UI. Plain language on purpose — see the landing page.

// ── Storage (same keys as before, so saved trades and other pages keep working) ──

const ACCOUNT_KEY  = "traxora_planner_account";
const TAKEN_KEY    = "traxora_taken_trades";
const ACTIVITY_KEY = "traxora_paper_activity";

type Account = { size: number; riskPct: number };
type Activity = { id: string; text: string; at: number };

function readJSON<T>(key: string, fallback: T): T {
  try { return (JSON.parse(localStorage.getItem(scopedKey(key)) ?? "null") as T) ?? fallback; } catch { return fallback; }
}
function writeJSON(key: string, v: unknown) {
  try { localStorage.setItem(scopedKey(key), JSON.stringify(v)); } catch { /* storage full or blocked */ }
}
function persistOrders(list: PaperOrder[]) {
  writeJSON(TAKEN_KEY, list);
  syncFetch("/api/paper-trades", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trades: list }),
  }).catch(() => {});
}

// ── Formatting ──────────────────────────────────────────────────────────────

const usd = (n: number, digits = 2) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
const signedPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });
const tone = (n: number) => (n > 0 ? "text-[var(--mx-up)]" : n < 0 ? "text-[var(--mx-down)]" : "text-[var(--mx-text-2)]");
const unitWord = (sym: string) => (/-USDT?$|USDT$/i.test(sym) ? "units" : "shares");
const clean = (s: string) => s.replace(/\.US$/i, "").replace(/\.COMM$/i, "");
function ago(ms: number) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
const nowMs = () => Date.now();
const num = (s: string) => { const n = parseFloat(s.replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

// ── Quotes ──────────────────────────────────────────────────────────────────

type QuoteInfo = Quote & { prevClose: number | null; fetchedAt: number };

async function fetchQuote(symbol: string): Promise<QuoteInfo | null> {
  try {
    const r = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
    const d = await r.json() as { price?: number | null; previousClose?: number | null; timestamp?: number | null };
    if (typeof d.price !== "number" || !(d.price > 0)) return null;
    const ts = typeof d.timestamp === "number" && d.timestamp > 0 ? (d.timestamp < 1e12 ? d.timestamp * 1000 : d.timestamp) : null;
    return { price: d.price, time: ts, prevClose: d.previousClose ?? null, fetchedAt: Date.now() };
  } catch { return null; }
}

/** Regular-hours price bars since `since` (ms): 5-minute bars for the last few days, hourly beyond that. */
async function fetchBars(symbol: string, since: number): Promise<Bar[]> {
  const days = (Date.now() - since) / 86400_000;
  const [interval, range] = days <= 4 ? ["5m", "5d"] : days <= 55 ? ["1h", "60d"] : ["1d", "1y"];
  try {
    const r = await fetch(`/api/intraday-bars?symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`, { cache: "no-store" });
    const d = await r.json() as { bars?: Bar[] };
    return Array.isArray(d.bars) ? d.bars : [];
  } catch { return []; }
}

// ── Ideas from cached signals (dashboard/analysis store these) ───────────────

type Idea = { symbol: string; side: Side; price: number; stop: number | null; target: number | null; confidence: string };

function loadIdeas(): Idea[] {
  try {
    const alerts = readJSON<Array<{ symbol: string; signal: string; price: number; confidence: string; time: number }>>("traxora_alerts", []);
    const seen = new Set<string>();
    const out: Idea[] = [];
    for (const a of alerts) {
      if (Date.now() - a.time > 8 * 3600_000 || (a.signal !== "BUY" && a.signal !== "SELL") || seen.has(a.symbol)) continue;
      seen.add(a.symbol);
      const cached = readJSON<{ trade?: { stopLoss?: string; takeProfit?: string } } | null>(`sig_${a.symbol}_${Math.round(a.price * 100)}`, null);
      const first = (s?: string) => (s ? num((s.match(/[\d]+\.?\d*/) ?? [""])[0]) : null);
      out.push({ symbol: clean(a.symbol), side: a.signal as Side, price: a.price, stop: first(cached?.trade?.stopLoss), target: first(cached?.trade?.takeProfit), confidence: a.confidence });
      if (out.length >= 6) break;
    }
    return out;
  } catch { return []; }
}

// ── Small UI pieces ─────────────────────────────────────────────────────────

const card = "rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)]";
const input = "w-full h-11 rounded-[10px] border border-[var(--mx-line)] bg-[var(--mx-canvas)] px-3 text-[15px] text-[var(--mx-text)] placeholder:text-[var(--mx-text-3)] focus:outline-none focus:border-[var(--mx-control)]";
const btnPrimary = "h-12 w-full rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[15px] disabled:opacity-35 disabled:cursor-not-allowed transition-opacity";
const btnQuiet = "h-9 px-3.5 rounded-full border border-[var(--mx-line)] text-[13px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)] hover:border-[var(--mx-line-strong)] transition-colors";

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid rounded-full border border-[var(--mx-line)] p-1 bg-[var(--mx-canvas)]" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={`h-9 rounded-full text-[14px] transition-colors ${value === o.v ? "bg-[var(--mx-text)] text-[var(--mx-canvas)]" : "text-[var(--mx-text-2)] hover:text-[var(--mx-text)]"}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] text-[var(--mx-text-2)] mb-1.5">{label}</span>
      {children}
      {hint && <span className="block mt-1.5 text-[12.5px] text-[var(--mx-text-3)]">{hint}</span>}
    </label>
  );
}

function MarketDot({ open }: { open: boolean }) {
  return <span aria-hidden="true" className={`inline-block w-1.5 h-1.5 rounded-full ${open ? "bg-[var(--mx-up)]" : "bg-[var(--mx-text-3)]"}`} />;
}

// ── Order ticket ────────────────────────────────────────────────────────────

type Prefill = { symbol: string; side: Side; stop: number | null; target: number | null; key: number };

function Ticket({ prefill, cash, now, quotes, onQuote, onPlace, onSymbol }: {
  prefill: Prefill;
  now: number;
  cash: number;
  quotes: Record<string, QuoteInfo>;
  onQuote: (s: string, q: QuoteInfo) => void;
  onPlace: (o: PaperOrder, filled: boolean) => void;
  onSymbol: (s: string) => void;
}) {
  const [symbol, setSymbol] = useState(prefill.symbol);
  const [side, setSide] = useState<Side>(prefill.side);
  const [by, setBy] = useState<"dollars" | "shares">("dollars");
  const [amount, setAmount] = useState("1000");
  const [type, setType] = useState<OrderType>("market");
  const [limit, setLimit] = useState("");
  const [protect, setProtect] = useState(true);
  const [stop, setStop] = useState(prefill.stop ? String(prefill.stop) : "");
  const [target, setTarget] = useState(prefill.target ? String(prefill.target) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [missing, setMissing] = useState(false);

  const sym = symbol.trim().toUpperCase();
  const quote = quotes[sym];
  const long = side === "BUY";

  // Look up the price shortly after typing stops.
  useEffect(() => {
    if (!/^[A-Z0-9.\-=]{1,12}$/.test(sym)) return;
    onSymbol(sym);
    let live = true;
    const t = setTimeout(async () => {
      setLoadingQuote(true);
      const q = await fetchQuote(sym);
      if (!live) return;
      setLoadingQuote(false);
      setMissing(!q);
      if (q) onQuote(sym, q);
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [sym]); // eslint-disable-line react-hooks/exhaustive-deps

  const ref = type === "limit" ? num(limit) : quote?.price ?? null;

  // Suggest safety level −5% and goal +10% (mirrored for a short) once a price is known.
  const suggested = useRef<string | null>(null);
  useEffect(() => {
    if (!ref || suggested.current === `${sym}:${side}`) return;
    if (prefill.stop || prefill.target) { suggested.current = `${sym}:${side}`; return; }
    suggested.current = `${sym}:${side}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStop((ref * (long ? 0.95 : 1.05)).toFixed(2));
    setTarget((ref * (long ? 1.1 : 0.9)).toFixed(2));
  }, [ref, sym, side, long, prefill.stop, prefill.target]);

  const amt = num(amount);
  const shares = ref && amt ? (by === "shares" ? amt : amt / (ref * (type === "market" ? 1 + SLIPPAGE : 1))) : null;
  const cost = ref && amt ? (by === "dollars" ? amt : amt * ref * (type === "market" ? 1 + SLIPPAGE : 1)) : null;
  const stopN = protect ? num(stop) : null;
  const targetN = protect ? num(target) : null;
  const loseAt = shares && ref && stopN ? Math.abs(ref - stopN) * shares : null;
  const makeAt = shares && ref && targetN ? Math.abs(targetN - ref) * shares : null;
  const open = sym ? isMarketOpen(sym, now) : true;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = placeOrder({
      symbol: sym, side, type,
      dollars: by === "dollars" ? amt : null, shares: by === "shares" ? amt : null,
      limitPrice: type === "limit" ? num(limit) : null,
      stop: stopN, target: targetN, note,
    }, quote, cash, nowMs());
    if (!r.ok) { setError(r.error); haptic.error?.(); return; }
    setError(null);
    haptic.success();
    onPlace(r.order, r.filled);
    setNote("");
  }

  const verb = long ? "Buy" : "Sell short";
  const summary = (() => {
    if (!sym || !ref || !shares || !cost) return null;
    const when = type === "limit"
      ? `when the price ${long ? "drops to" : "rises to"} ${usd(ref)}`
      : open ? "now, at the market price" : "when the market opens";
    return `${verb} about ${qty(Math.round(shares * 1000) / 1000)} ${unitWord(sym)} of ${sym} for about ${usd(cost)} ${when}.`;
  })();

  return (
    <form onSubmit={submit} className={`${card} p-5 sm:p-6 space-y-5`} aria-labelledby="ticket-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ticket-h" className="text-[18px] tracking-[-0.01em]">Place a practice trade</h2>
        <span className="text-[12.5px] text-[var(--mx-text-3)]">{usd(cash, 0)} cash available</span>
      </div>

      <Field label="Stock or crypto" hint={
        loadingQuote ? "Getting the price…"
        : missing ? "We couldn't find a price for that. Try a ticker like AAPL, TSLA or BTC-USD."
        : quote ? (
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="text-[var(--mx-text)] font-mono">{usd(quote.price)}</span>
            {quote.prevClose ? <span className={tone(quote.price - quote.prevClose)}>{signedPct((quote.price / quote.prevClose - 1) * 100)} today</span> : null}
            <span>· prices can be up to 15 min behind</span>
          </span>
        ) : "Type a ticker, like AAPL"
      }>
        <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL" autoCapitalize="characters" autoComplete="off" spellCheck={false} className={`${input} font-mono uppercase`} aria-label="Ticker" />
      </Field>

      <div className="space-y-2">
        <Segmented label="Buy or sell short" value={side} onChange={v => { setSide(v); suggested.current = null; }} options={[{ v: "BUY", l: "Buy" }, { v: "SELL", l: "Sell short" }]} />
        {!long && <p className="text-[12.5px] text-[var(--mx-text-3)]">Selling short means you make money if the price falls — and lose if it rises. It’s riskier, so start small.</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-[var(--mx-text-2)]">How much?</span>
          <div className="w-[170px]"><Segmented label="Amount in" value={by} onChange={setBy} options={[{ v: "dollars", l: "Dollars" }, { v: "shares", l: "Shares" }]} /></div>
        </div>
        <div className="relative">
          {by === "dollars" && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mx-text-3)]">$</span>}
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className={`${input} font-mono ${by === "dollars" ? "pl-7" : ""}`} aria-label={by === "dollars" ? "Dollar amount" : "Number of shares"} />
        </div>
        {by === "dollars" ? (
          <div className="flex flex-wrap gap-2">
            {[100, 500, 1000, 5000].map(v => (
              <button key={v} type="button" onClick={() => setAmount(String(v))} className={btnQuiet}>{usd(v, 0)}</button>
            ))}
          </div>
        ) : null}
        {shares && cost ? (
          <p className="text-[12.5px] text-[var(--mx-text-3)]">{by === "dollars" ? `About ${qty(Math.round(shares * 1000) / 1000)} ${unitWord(sym)}` : `About ${usd(cost)}`} · partial {unitWord(sym)} are fine</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <span className="block text-[13px] text-[var(--mx-text-2)]">When?</span>
        <Segmented label="When to trade" value={type} onChange={setType} options={[{ v: "market", l: open ? "Now" : "At the open" }, { v: "limit", l: "At my price" }]} />
        {type === "limit" && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mx-text-3)]">$</span>
            <input value={limit} onChange={e => setLimit(e.target.value)} inputMode="decimal" placeholder={quote ? quote.price.toFixed(2) : "0.00"} className={`${input} pl-7 font-mono`} aria-label={long ? "Buy when the price is at or below" : "Sell short when the price is at or above"} />
            <p className="mt-1.5 text-[12.5px] text-[var(--mx-text-3)]">{long ? "We’ll buy only if the price drops to this or lower." : "We’ll sell short only if the price rises to this or higher."}</p>
          </div>
        )}
        {type === "market" && !open && sym && <p className="text-[12.5px] text-[var(--mx-text-3)]">{marketStatusText(sym, now)}.</p>}
      </div>

      <div className="rounded-[12px] border border-[var(--mx-line)] p-4 space-y-3">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span>
            <span className="block text-[14px]">Sell automatically</span>
            <span className="block text-[12.5px] text-[var(--mx-text-3)]">Protects you from big losses and locks in gains.</span>
          </span>
          <input type="checkbox" checked={protect} onChange={e => setProtect(e.target.checked)} className="w-5 h-5 accent-[var(--mx-text)]" />
        </label>
        {protect && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={long ? "If it falls to" : "If it rises to"} hint={loseAt != null ? <span className="text-[var(--mx-down)]">lose about {usd(loseAt)}</span> : "safety level"}>
              <input value={stop} onChange={e => setStop(e.target.value)} inputMode="decimal" className={`${input} font-mono`} />
            </Field>
            <Field label={long ? "If it rises to" : "If it falls to"} hint={makeAt != null ? <span className="text-[var(--mx-up)]">make about {usd(makeAt)}</span> : "goal"}>
              <input value={target} onChange={e => setTarget(e.target.value)} inputMode="decimal" className={`${input} font-mono`} />
            </Field>
          </div>
        )}
      </div>

      <Field label="Why are you making this trade? (optional)">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Strong earnings, buying the dip" className={input} />
      </Field>

      {summary && <p className="text-[14px] leading-relaxed text-[var(--mx-text-2)]">{summary}</p>}
      {error && <p role="alert" className="text-[14px] text-[var(--mx-down)]">{error}</p>}

      <button type="submit" className={btnPrimary} disabled={!sym || !ref || !amt}>
        {type === "limit" ? "Save order" : open ? `${verb} ${sym || ""}`.trim() : "Place order for the open"}
      </button>
      <p className="text-[12px] text-center text-[var(--mx-text-3)]">Practice money only. No fees. Market orders include a tiny price difference ({(SLIPPAGE * 100).toFixed(2)}%), like a real broker.</p>
    </form>
  );
}

// ── Position row ────────────────────────────────────────────────────────────

function Holding({ o, quote, onSell, onLevels }: {
  o: PaperOrder; quote?: QuoteInfo;
  onSell: (o: PaperOrder) => void;
  onLevels: (id: string, stop: number | null, target: number | null) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [stop, setStop] = useState(o.stop != null ? String(o.stop) : "");
  const [target, setTarget] = useState(o.target != null ? String(o.target) : "");
  const long = o.signal === "BUY";
  const price = quote?.price ?? null;
  const pl = price != null ? profit(o, price) : null;
  const pct = price != null ? profitPct(o, price) : null;
  const value = price != null ? o.entry * o.shares + (pl ?? 0) : o.entry * o.shares;

  // Where the price sits between the safety level and the goal.
  const lo = long ? o.stop : o.target, hi = long ? o.target : o.stop;
  const pos = price != null && lo != null && hi != null && hi > lo ? Math.min(1, Math.max(0, (price - lo) / (hi - lo))) : null;

  return (
    <li className={`${card} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="font-mono text-[17px]">{clean(o.symbol)}</span>
            {!long && <span className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--mx-line)] text-[var(--mx-text-3)]">short</span>}
            {o.closeQueued && <span className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--mx-line-strong)] text-[var(--mx-text-2)]">selling at the open</span>}
          </p>
          <p className="mt-1 text-[13px] text-[var(--mx-text-3)]">{qty(o.shares)} {unitWord(o.symbol)} · {long ? "bought" : "sold"} at {usd(o.entry)}{o.filledAt ? ` · ${ago(o.filledAt)}` : ""}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-[17px]">{usd(value)}</p>
          {pl != null && pct != null
            ? <p className={`text-[13px] font-mono ${tone(pl)}`}>{signedUsd(pl)} ({signedPct(pct)})</p>
            : <p className="text-[13px] text-[var(--mx-text-3)]">getting price…</p>}
        </div>
      </div>

      {(o.stop != null || o.target != null) && !editing && (
        <div className="mt-4">
          {pos != null && (
            <div className="relative h-1.5 rounded-full bg-[var(--mx-raised-2)]" aria-hidden="true">
              <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[var(--mx-text)] border-2 border-[var(--mx-surface)]" style={{ left: `${pos * 100}%` }} />
            </div>
          )}
          <p className="mt-2 flex justify-between gap-3 text-[12.5px] text-[var(--mx-text-3)]">
            <span>{o.stop != null ? `Safety: sells at ${usd(o.stop)}` : "No safety level"}</span>
            <span>{o.target != null ? `Goal: sells at ${usd(o.target)}` : "No goal"}</span>
          </p>
        </div>
      )}

      {editing && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Safety level"><input value={stop} onChange={e => setStop(e.target.value)} inputMode="decimal" className={`${input} font-mono`} /></Field>
          <Field label="Goal"><input value={target} onChange={e => setTarget(e.target.value)} inputMode="decimal" className={`${input} font-mono`} /></Field>
        </div>
      )}

      {o.note && <p className="mt-3 text-[13px] text-[var(--mx-text-3)]">“{o.note}”</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {confirm ? (
          <>
            <span className="text-[13px] text-[var(--mx-text-2)] mr-1">
              {long ? "Sell" : "Buy back"} {qty(o.shares)} {unitWord(o.symbol)}{price != null ? ` at about ${usd(price)}` : ""}{pl != null ? ` (${signedUsd(pl)})` : ""}?
            </span>
            <button type="button" onClick={() => { onSell(o); setConfirm(false); }} className="h-9 px-4 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[13px]">Yes, {long ? "sell" : "buy back"}</button>
            <button type="button" onClick={() => setConfirm(false)} className={btnQuiet}>Keep it</button>
          </>
        ) : editing ? (
          <>
            <button type="button" onClick={() => { onLevels(o.id, num(stop), num(target)); setEditing(false); }} className="h-9 px-4 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[13px]">Save levels</button>
            <button type="button" onClick={() => setEditing(false)} className={btnQuiet}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" disabled={o.closeQueued} onClick={() => setConfirm(true)} className="h-9 px-4 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[13px] disabled:opacity-35">{long ? "Sell" : "Buy back"}</button>
            <button type="button" onClick={() => setEditing(true)} className={btnQuiet}>Change auto-sell</button>
          </>
        )}
      </div>
    </li>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function PaperContent() {
  const params = useSearchParams();
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? null;

  const [account, setAccount] = useState<Account>({ size: DEFAULT_START, riskPct: 1 });
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteInfo>>({});
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [chartSymbol, setChartSymbol] = useState(clean(params.get("symbol") ?? ""));
  const [toast, setToast] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [startInput, setStartInput] = useState(String(DEFAULT_START));
  const [confirmReset, setConfirmReset] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [prefill, setPrefill] = useState<Prefill>(() => ({
    symbol: clean(params.get("symbol") ?? "").toUpperCase(),
    side: params.get("side") === "SELL" ? "SELL" : "BUY",
    stop: num(params.get("stop") ?? ""),
    target: num(params.get("target") ?? ""),
    key: 0,
  }));

  // Load once the session is known (storage keys are per user).
  useEffect(() => {
    if (session === undefined) return;
    setCurrentUser(userEmail);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time load from storage */
    const acc = readJSON<Account | null>(ACCOUNT_KEY, null);
    if (acc?.size) { setAccount(acc); setStartInput(String(acc.size)); }
    setOrders(readJSON<PaperOrder[]>(TAKEN_KEY, []));
    setActivity(readJSON<Activity[]>(ACTIVITY_KEY, []));
    setIdeas(loadIdeas());
    /* eslint-enable react-hooks/set-state-in-effect */
    // Cross-device sync: merge by id; the copy that progressed further wins.
    syncFetch("/api/paper-trades")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { trades?: PaperOrder[] }) => {
        const server = Array.isArray(data.trades) ? data.trades : [];
        const local = readJSON<PaperOrder[]>(TAKEN_KEY, []);
        const byId = new Map(server.map(t => [t.id, t]));
        let serverBehind = false;
        for (const t of local) {
          const s = byId.get(t.id);
          const stamp = (x: PaperOrder) => x.closedAt ?? x.filledAt ?? x.time ?? 0;
          if (!s || stamp(t) > stamp(s)) { byId.set(t.id, t); serverBehind = true; }
        }
        const merged = [...byId.values()].sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
        setOrders(merged);
        writeJSON(TAKEN_KEY, merged);
        if (serverBehind) persistOrders(merged);
      })
      .catch(() => { /* signed out or offline: trades stay on this device */ });
  }, [session, userEmail]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const flash = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(t => (t === text ? null : t)), 4500);
  }, []);

  const log = useCallback((events: EngineEvent[]) => {
    if (!events.length) return;
    setActivity(prev => {
      const next = [...events.map(e => ({ id: `${e.id}-${Date.now()}`, text: e.text, at: Date.now() })), ...prev].slice(0, 20);
      writeJSON(ACTIVITY_KEY, next);
      return next;
    });
    flash(events[0].text);
    haptic.medium();
  }, [flash]);

  const saveQuote = useCallback((s: string, q: QuoteInfo) => setQuotes(prev => ({ ...prev, [s]: q })), []);

  // Price updates: every 30s while any market we hold is open, every 2 min otherwise.
  const watched = useMemo(
    () => [...new Set(orders.filter(o => o.status === "OPEN" || o.status === "PENDING" || !o.status).map(o => o.symbol))].sort(),
    [orders],
  );
  const watchedKey = watched.join(",");
  const caughtUp = useRef(new Set<string>());
  useEffect(() => {
    if (!watched.length) return;
    let stop = false;
    async function run() {
      // First time we see a symbol this visit: replay what happened while away.
      for (const s of watched.filter(x => !caughtUp.current.has(x))) {
        caughtUp.current.add(s);
        const mine = orders.filter(o => o.symbol === s && (o.status === "OPEN" || o.status === "PENDING" || !o.status));
        if (!mine.length) continue;
        const since = Math.min(...mine.map(o => o.time));
        const bars = await fetchBars(s, since);
        if (stop) return;
        if (!bars.length) continue;
        setOrders(prev => {
          const r = catchUp(prev, s, bars, Date.now());
          if (!r.changed) return prev;
          persistOrders(r.orders);
          queueMicrotask(() => log(r.events));
          return r.orders;
        });
      }
      const got = await Promise.all(watched.map(async s => [s, await fetchQuote(s)] as const));
      if (stop) return;
      const fresh: Record<string, QuoteInfo> = {};
      for (const [s, q] of got) if (q) fresh[s] = q;
      if (!Object.keys(fresh).length) return;
      setQuotes(prev => ({ ...prev, ...fresh }));
      setNow(Date.now());
      setOrders(prev => {
        const r = tick(prev, fresh, Date.now());
        if (!r.changed) return prev;
        persistOrders(r.orders);
        queueMicrotask(() => log(r.events));
        return r.orders;
      });
    }
    run();
    const anyOpen = watched.some(s => isMarketOpen(s, Date.now()));
    const id = window.setInterval(() => { if (document.visibilityState === "visible") run(); }, anyOpen ? 30_000 : 120_000);
    return () => { stop = true; window.clearInterval(id); };
  }, [watchedKey, log]); // eslint-disable-line react-hooks/exhaustive-deps

  const prices = useMemo(() => Object.fromEntries(Object.entries(quotes).map(([k, v]) => [k, v.price])), [quotes]);
  const sum = useMemo(() => summarize(orders, account.size, prices), [orders, account.size, prices]);
  const holdings = orders.filter(o => o.status === "OPEN" || !o.status);
  const waiting = orders.filter(o => o.status === "PENDING");
  const history = orders.filter(o => o.status === "WIN" || o.status === "LOSS").sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  const stockOpen = isMarketOpen("AAPL", now);

  function update(next: PaperOrder[]) { setOrders(next); persistOrders(next); }

  function onPlace(o: PaperOrder, filled: boolean) {
    update([o, ...orders]);
    const msg = filled
      ? `${o.signal === "BUY" ? "Bought" : "Sold short"} ${qty(o.shares)} ${o.symbol} at ${usd(o.entry)}.`
      : o.orderType === "limit"
        ? `Order saved. We’ll ${o.signal === "BUY" ? "buy" : "sell short"} ${o.symbol} if the price reaches ${usd(o.limitPrice ?? o.entry)}.`
        : `Order saved. It will go through when the market opens.`;
    log([{ id: o.id, symbol: o.symbol, text: msg }]);
    setTimeout(() => document.getElementById("your-stocks")?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
  }

  async function onSell(o: PaperOrder) {
    const q = (await fetchQuote(o.symbol)) ?? quotes[o.symbol];
    if (q) saveQuote(o.symbol, q as QuoteInfo);
    const c = closeNow(o, q, Date.now());
    update(orders.map(x => (x.id === o.id ? c : x)));
    if (c.status === "WIN" || c.status === "LOSS") {
      const p = profit(c, c.closePrice!);
      log([{ id: o.id, symbol: o.symbol, text: `${o.signal === "BUY" ? "Sold" : "Bought back"} ${o.symbol} at ${usd(c.closePrice!)} · ${signedUsd(p)}.` }]);
    } else {
      log([{ id: o.id, symbol: o.symbol, text: `The market is closed. We’ll ${o.signal === "BUY" ? "sell" : "buy back"} ${o.symbol} when it opens.` }]);
    }
  }

  function onLevels(id: string, stop: number | null, target: number | null) {
    update(orders.map(o => {
      if (o.id !== id) return o;
      const next = { ...o, stop, target };
      next.riskDollar = stop != null ? Math.abs(o.entry - stop) * o.shares : 0;
      next.potential = target != null ? Math.abs(target - o.entry) * o.shares : 0;
      return next;
    }));
    flash("Auto-sell levels updated.");
  }

  function cancel(id: string) { update(orders.filter(o => o.id !== id)); flash("Order cancelled."); }
  function removeHistory(id: string) { update(orders.filter(o => o.id !== id)); }

  function saveStart() {
    const size = num(startInput);
    if (!size) return;
    const v = { ...account, size };
    setAccount(v); writeJSON(ACCOUNT_KEY, v); setSettings(false);
    flash(`Starting amount set to ${usd(size, 0)}.`);
  }

  function startOver() {
    update([]);
    setActivity([]); writeJSON(ACTIVITY_KEY, []);
    setConfirmReset(false); setSettings(false);
    flash("Your practice account has been reset.");
  }

  function pickIdea(i: Idea) {
    setPrefill(p => ({ symbol: i.symbol, side: i.side, stop: i.stop, target: i.target, key: p.key + 1 }));
    setChartSymbol(i.symbol);
    document.getElementById("ticket")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex min-h-screen text-[var(--mx-text)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="min-w-0 flex-1 p-4 lg:p-8 !pb-36 page-enter">
          <div className="max-w-6xl mx-auto w-full space-y-6">

            {/* Header */}
            <header className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <p className="mx-label flex items-center gap-2"><MarketDot open={stockOpen} />{stockOpen ? "US market open" : "US market closed"} · practice money</p>
                <h1 className="mt-3 text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em]" style={{ fontWeight: 450 }}>Practice trading</h1>
                <p className="mt-2 text-[15px] text-[var(--mx-text-2)] max-w-[56ch]">Buy and sell with pretend money at real market prices. Learn how it feels — without risking a cent.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/journal" className={btnQuiet + " inline-flex items-center"}>Journal</Link>
                <button type="button" onClick={() => setSettings(s => !s)} className={btnQuiet} aria-expanded={settings}>Account settings</button>
              </div>
            </header>

            {/* Settings */}
            {settings && (
              <section className={`${card} p-5 space-y-4`} aria-label="Account settings">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-48">
                    <Field label="Starting amount">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mx-text-3)]">$</span>
                        <input value={startInput} onChange={e => setStartInput(e.target.value)} inputMode="decimal" className={`${input} pl-7 font-mono`} />
                      </div>
                    </Field>
                  </div>
                  <button type="button" onClick={saveStart} className="h-11 px-5 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px]">Save</button>
                  <div className="flex gap-2">
                    {[10_000, 25_000, 100_000].map(v => <button key={v} type="button" onClick={() => setStartInput(String(v))} className={btnQuiet}>{usd(v, 0)}</button>)}
                  </div>
                </div>
                <p className="text-[13px] text-[var(--mx-text-3)]">Tip: practise with the amount you’d really invest. Trading $100,000 of pretend money doesn’t feel like your real savings.</p>
                <div className="pt-4 border-t border-[var(--mx-line)] flex flex-wrap items-center gap-3">
                  {confirmReset ? (
                    <>
                      <span className="text-[14px]">Delete all practice trades and start fresh?</span>
                      <button type="button" onClick={startOver} className="h-9 px-4 rounded-full bg-[var(--mx-down)] text-black text-[13px]">Yes, start over</button>
                      <button type="button" onClick={() => setConfirmReset(false)} className={btnQuiet}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmReset(true)} className={btnQuiet}>Start over</button>
                  )}
                </div>
              </section>
            )}

            {/* Account summary */}
            <section className={`${card} p-5 sm:p-6`} aria-label="Account summary">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="text-[13px] text-[var(--mx-text-3)]">Total value</p>
                  <p className="mt-1 font-mono text-[36px] sm:text-[44px] leading-none tracking-[-0.02em]">{usd(sum.total)}</p>
                  <p className={`mt-2 text-[14px] ${tone(sum.gain)}`}>
                    {sum.gain === 0 ? "No change yet" : `${sum.gain > 0 ? "Up" : "Down"} ${usd(Math.abs(sum.gain))} (${signedPct(sum.gainPct)})`}
                    <span className="text-[var(--mx-text-3)]"> since you started with {usd(account.size, 0)}</span>
                  </p>
                </div>
                <dl className="grid grid-cols-3 gap-6 sm:gap-10">
                  {[
                    ["Cash", usd(sum.cash, 0), "ready to invest"],
                    ["Invested", usd(sum.invested, 0), `${sum.openCount} ${sum.openCount === 1 ? "stock" : "stocks"}`],
                    ["Results", sum.closedCount ? `${sum.wins}/${sum.closedCount}` : "—", sum.closedCount ? "trades made money" : "no finished trades"],
                  ].map(([k, v, s]) => (
                    <div key={k}>
                      <dt className="text-[13px] text-[var(--mx-text-3)]">{k}</dt>
                      <dd className="mt-1 font-mono text-[18px] sm:text-[20px]">{v}</dd>
                      <dd className="text-[12px] text-[var(--mx-text-3)]">{s}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>

            <div className="grid xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6 items-start">
              {/* Ticket + ideas */}
              <div id="ticket" className="space-y-6 scroll-mt-20">
                <Ticket key={prefill.key} prefill={prefill} cash={sum.cash} now={now} quotes={quotes} onQuote={saveQuote} onPlace={onPlace}
                  onSymbol={s => setChartSymbol(s)} />

                {ideas.length > 0 && (
                  <section className={`${card} p-5`} aria-labelledby="ideas-h">
                    <h2 id="ideas-h" className="text-[15px]">Ideas from your signals</h2>
                    <p className="mt-1 text-[12.5px] text-[var(--mx-text-3)]">Tap one to fill in the trade. Always decide for yourself.</p>
                    <ul className="mt-3 space-y-2">
                      {ideas.map(i => (
                        <li key={i.symbol}>
                          <button type="button" onClick={() => pickIdea(i)} className="w-full flex items-center justify-between gap-3 rounded-[10px] border border-[var(--mx-line)] px-3 py-2.5 text-left hover:border-[var(--mx-line-strong)] transition-colors">
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-[14px]">{i.symbol}</span>
                              <span className={`text-[12px] ${i.side === "BUY" ? "text-[var(--mx-up)]" : "text-[var(--mx-down)]"}`}>{i.side === "BUY" ? "Buy idea" : "Sell idea"}</span>
                            </span>
                            <span className="text-[12px] text-[var(--mx-text-3)]">{i.confidence} confidence →</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              {/* Chart + positions */}
              <div className="space-y-6 min-w-0">
                {chartSymbol && (
                  <section className="rounded-[14px] overflow-hidden border border-[var(--mx-line)]" aria-label={`${chartSymbol} chart`}>
                    <TraxoraChart symbol={chartSymbol} height={380} />
                  </section>
                )}

                <section id="your-stocks" className="space-y-3 scroll-mt-20" aria-labelledby="hold-h">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 id="hold-h" className="text-[18px] tracking-[-0.01em]">Your stocks</h2>
                    {holdings.length > 0 && <span className="text-[12.5px] text-[var(--mx-text-3)]">Prices update every {stockOpen ? "30 seconds" : "2 minutes"}</span>}
                  </div>
                  {holdings.length === 0 ? (
                    <div className="rounded-[14px] border border-dashed border-[var(--mx-line-strong)] px-6 py-10 text-center">
                      <p className="text-[15px]">You don’t own anything yet.</p>
                      <p className="mt-1 text-[13px] text-[var(--mx-text-3)]">Try buying {usd(1000, 0)} of a company you know, like Apple (AAPL).</p>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {holdings.map(o => <Holding key={o.id} o={o} quote={quotes[o.symbol]} onSell={onSell} onLevels={onLevels} />)}
                    </ul>
                  )}
                </section>

                {waiting.length > 0 && (
                  <section className="space-y-3" aria-labelledby="wait-h">
                    <h2 id="wait-h" className="text-[18px] tracking-[-0.01em]">Waiting orders</h2>
                    <ul className="space-y-2">
                      {waiting.map(o => {
                        const q = quotes[o.symbol];
                        const what = o.orderType === "limit"
                          ? `${o.signal === "BUY" ? "Buy" : "Sell short"} ${qty(o.shares)} ${o.symbol} if the price ${o.signal === "BUY" ? "drops to" : "rises to"} ${usd(o.limitPrice ?? o.entry)}`
                          : `${o.signal === "BUY" ? "Buy" : "Sell short"} ${o.amount != null ? usd(o.amount) + " of" : qty(o.shares)} ${o.symbol} when the market opens`;
                        return (
                          <li key={o.id} className={`${card} px-4 py-3 flex items-center justify-between gap-3`}>
                            <div className="min-w-0">
                              <p className="text-[14px]">{what}</p>
                              <p className="text-[12.5px] text-[var(--mx-text-3)]">{q ? `Now ${usd(q.price)} · ` : ""}placed {ago(o.time)}</p>
                            </div>
                            <button type="button" onClick={() => cancel(o.id)} className={btnQuiet}>Cancel</button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {activity.length > 0 && (
                  <section className="space-y-3" aria-labelledby="act-h">
                    <h2 id="act-h" className="text-[18px] tracking-[-0.01em]">What happened</h2>
                    <ul className={`${card} divide-y divide-[var(--mx-line)]`}>
                      {activity.slice(0, 6).map(a => (
                        <li key={a.id} className="px-4 py-3 flex items-start justify-between gap-3 text-[14px]">
                          <span className="text-[var(--mx-text-2)]">{a.text}</span>
                          <span className="shrink-0 text-[12px] text-[var(--mx-text-3)]">{ago(a.at)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {history.length > 0 && (
                  <section className="space-y-3" aria-labelledby="hist-h">
                    <h2 id="hist-h" className="text-[18px] tracking-[-0.01em]">Finished trades</h2>
                    <ul className={`${card} divide-y divide-[var(--mx-line)]`}>
                      {history.map(o => {
                        const p = o.closePrice != null ? profit(o, o.closePrice) : o.status === "WIN" ? o.potential : -o.riskDollar;
                        const pc = o.closePrice != null ? profitPct(o, o.closePrice) : null;
                        const why = o.exitReason === "stop" ? "Sold at your safety level" : o.exitReason === "target" ? "Reached your goal" : "You sold";
                        return (
                          <li key={o.id} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[14px]"><span className="font-mono">{clean(o.symbol)}</span> <span className="text-[var(--mx-text-3)]">· {why}</span></p>
                              <p className="text-[12.5px] text-[var(--mx-text-3)]">
                                {o.signal === "BUY" ? "Bought" : "Shorted"} at {usd(o.entry)}{o.closePrice != null ? `, closed at ${usd(o.closePrice)}` : ""} · {ago(o.closedAt ?? o.time)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`font-mono text-[14px] ${tone(p)}`}>{signedUsd(p)}{pc != null ? ` (${signedPct(pc)})` : ""}</span>
                              <button type="button" aria-label={`Remove ${o.symbol} from history`} onClick={() => removeHistory(o.id)} className="w-7 h-7 grid place-items-center rounded-full text-[var(--mx-text-3)] hover:text-[var(--mx-text)]">×</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                <details className={`${card} p-5 group`}>
                  <summary className="cursor-pointer list-none flex items-center justify-between text-[15px]">
                    How practice trading works here
                    <span aria-hidden="true" className="text-[var(--mx-text-3)] transition-transform group-open:rotate-45 text-[18px]">+</span>
                  </summary>
                  <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-[var(--mx-text-2)]">
                    <li><b className="font-normal text-[var(--mx-text)]">Real prices, pretend money.</b> Prices come from public sources and can be up to 15 minutes behind.</li>
                    <li><b className="font-normal text-[var(--mx-text)]">Market hours matter.</b> US stocks trade 9:30 AM–4:00 PM ET on weekdays. Orders placed outside those hours wait for the open. Crypto trades all the time.</li>
                    <li><b className="font-normal text-[var(--mx-text)]">No perfect fills.</b> Buying “now” costs a tiny bit more than the price you see, and selling gets a tiny bit less — just like a real broker.</li>
                    <li><b className="font-normal text-[var(--mx-text)]">Auto-sell works for you.</b> If the price reaches your safety level or goal, we sell for you. If the price jumps past it, you get the next price — this happens in real trading too.</li>
                    <li><b className="font-normal text-[var(--mx-text)]">Cash is limited.</b> You can only spend the cash you have. Money in open trades and waiting orders isn’t available.</li>
                    <li><b className="font-normal text-[var(--mx-text)]">It keeps working while you’re away.</b> When you come back, we look at what prices did in the meantime and fill your orders and auto-sells the way a broker would have.</li>
                  </ul>
                </details>
              </div>
            </div>
          </div>
        </main>
      </div>

      {toast && (
        <div role="status" className="fixed z-50 left-1/2 -translate-x-1/2 bottom-24 lg:bottom-8 max-w-[92vw] rounded-full bg-[var(--mx-text)] text-[var(--mx-canvas)] px-5 py-3 text-[14px] shadow-[var(--mx-shadow)]">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function PaperPage() {
  return (
    <PaywallGuard>
      <Suspense>
        <PaperContent />
      </Suspense>
    </PaywallGuard>
  );
}
