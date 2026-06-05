import { Resend } from "resend";
import { smartMoneyScore } from "@/app/lib/smartMoney";
import { postToDiscord, buildBriefingEmbed } from "@/app/lib/discord";

export const runtime  = "nodejs";
export const maxDuration = 60;

type PredictionRecord = {
  symbol:   string;
  signal:   "BUY" | "SELL" | "HOLD";
  entryMid: number;
  stop:     number;
  tp:       number;
  price:    number;
};

type BriefHistory = {
  date:        string;
  predictions: PredictionRecord[];
};

// Vercel filesystem is read-only — history not persisted between cron runs
async function loadHistory(): Promise<BriefHistory | null> { return null; }
async function saveHistory(_h: BriefHistory): Promise<void> { /* no-op on Vercel */ }

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "thecompetitormindset@gmail.com";

async function getEmails(): Promise<string[]> {
  const list = new Set<string>([OWNER_EMAIL]);

  // All pro subscribers are automatically enrolled
  try {
    const { supabaseAdmin } = await import("@/app/lib/supabase");
    const db = supabaseAdmin();
    const { data } = await db.from("subscriptions").select("user_email").eq("plan", "pro");
    (data ?? []).forEach((row: { user_email?: string }) => { if (row.user_email) list.add(row.user_email); });
  } catch { /* supabase not configured — owner still gets email */ }

  // Additional recipients from env var (manual override)
  const envList = (process.env.CRON_EMAIL ?? "")
    .split(",").map((e: string) => e.trim()).filter(Boolean);
  envList.forEach((e: string) => list.add(e));

  return [...list];
}

// ── 50-stock watchlist ────────────────────────────────────────────────────────
const WATCHLIST = [
  // Mega-cap tech
  "AAPL","NVDA","MSFT","GOOGL","META","AMZN","TSLA","ORCL","ADBE","CRM",
  // Semiconductors
  "AMD","AVGO","QCOM","MU","INTC","ARM","SMCI","TSM","ASML","MRVL",
  // Financials
  "JPM","BAC","GS","V","MA","WFC","C","MS","SCHW","AXP",
  // Growth / fintech
  "PLTR","SOFI","COIN","HOOD","PYPL","SQ","SHOP","SNOW","RBLX","MSTR",
  // Broad market ETFs
  "SPY","QQQ","IWM",
  // Safe havens
  "GLD","SLV",
  // Consumer / media
  "NFLX","DIS","UBER","ABNB","COST","NKE",
  // Healthcare
  "UNH","LLY",
];

// ── Fetch quote ───────────────────────────────────────────────────────────────
async function fetchQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const r   = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) });
    const d   = await r.json();
    const meta = d?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price  = meta.regularMarketPrice as number;
    const prev   = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
    const open   = (meta.regularMarketOpen ?? price) as number;
    const chg    = prev ? ((price - prev) / prev) * 100 : 0;
    const high   = (meta.regularMarketDayHigh ?? price) as number;
    const low    = (meta.regularMarketDayLow  ?? price) as number;
    const vol    = (meta.regularMarketVolume  ?? 0)     as number;
    const avgVol = (meta.averageDailyVolume10Day ?? meta.averageDailyVolume3Month ?? vol) as number;
    const high52 = (meta.fiftyTwoWeekHigh ?? price) as number;
    const low52  = (meta.fiftyTwoWeekLow  ?? price) as number;
    return { symbol, price, prev, open, chg, high, low, vol, avgVol, high52, low52,
             name: (meta.shortName ?? symbol) as string };
  } catch { return null; }
}

// ── Email-specific analysis wrapper ──────────────────────────────────────────
function analyze(q: NonNullable<Awaited<ReturnType<typeof fetchQuote>>>) {
  const sm = smartMoneyScore({
    price:         q.price,
    previousClose: q.prev,
    open:          q.open,
    high:          q.high,
    low:           q.low,
    volume:        q.vol,
    avgVolume:     q.avgVol,
    high52w:       q.high52,
    low52w:        q.low52,
    changePercent: q.chg,
  });

  const { signal, confidence, score, priceZone: zone, pctPos,
          volRatio: volR, highVol, lowVol, yearPct,
          dayH, dayL, daySpan,
          orderBlock, fairValueGap, liquidity, ote } = sm;

  // Entry zone — discount (BUY) or premium (SELL)
  // Use a minimum span so prices don't collapse to a point
  const span = daySpan > 0.01 ? daySpan : q.price * 0.01;

  let entryLow: number, entryHigh: number;
  if (signal === "BUY") {
    entryLow  = dayL + span * 0.05;   // 5% up from day low
    entryHigh = dayL + span * 0.30;   // 30% up from day low
  } else if (signal === "SELL") {
    entryLow  = dayH - span * 0.30;   // 30% below day high
    entryHigh = dayH - span * 0.05;   // 5% below day high
  } else {
    entryLow  = dayL + span * 0.40;   // equilibrium — not shown
    entryHigh = dayL + span * 0.60;
  }
  const entryMid = (entryLow + entryHigh) / 2;
  const entryZone = `$${entryLow.toFixed(2)} – $${entryHigh.toFixed(2)}`;

  // Structural stop: just beyond the session extreme.
  // Buffer = larger of 3% of day span or 0.1% of price — avoids wick stop-outs.
  const buf = Math.max(span * 0.03, q.price * 0.001);
  const stopVal = signal === "BUY" ? dayL - buf : dayH + buf;
  const riskDist = Math.abs(entryMid - stopVal);
  const tpVal    = signal === "BUY"
    ? entryMid + riskDist * 2     // 2R above entry midpoint
    : entryMid - riskDist * 2;    // 2R below entry midpoint

  const stopLoss   = `$${stopVal.toFixed(2)}`;
  const takeProfit = `$${tpVal.toFixed(2)}`;

  const refH = Math.max(dayH, q.prev);
  const refL = Math.min(dayL, q.prev);
  const bsl  = `$${refH.toFixed(2)}`;
  const ssl  = `$${refL.toFixed(2)}`;
  // Extract "$X.XX–$Y.YY" from "Long OTE: $X.XX–$Y.YY (...)" or "Short OTE: $X.XX–$Y.YY (...)"
  const oteZone = ote ? (ote.match(/\$[\d.]+–\$[\d.]+/)?.[0] ?? null) : null;

  const yearZone = yearPct == null ? "N/A"
    : yearPct <= 15 ? `Near 52-week LOW (${yearPct.toFixed(0)}%) — deep value`
    : yearPct >= 85 ? `Near 52-week HIGH (${yearPct.toFixed(0)}%) — extended`
    :                 `Mid-range (${yearPct.toFixed(0)}% of 52-week range)`;

  const volVerdict = volR == null     ? "Volume data unavailable"
    : volR >= 2.5  ? `${volR.toFixed(1)}x avg — strong institutional move`
    : highVol      ? `${volR.toFixed(1)}x avg — above average activity`
    : lowVol       ? `${volR.toFixed(1)}x avg — low conviction`
    :                `${volR.toFixed(1)}x avg — normal`;

  const whyBuy = signal === "BUY"
    ? `${zone} zone (${pctPos.toFixed(0)}% of day range) with +${q.chg.toFixed(2)}% momentum${highVol ? ` and ${volR?.toFixed(1)}x volume confirming institutional buying` : ""}. ${yearPct != null && yearPct < 30 ? "Also trading near yearly discount." : ""}`
    : signal === "SELL"
    ? `${zone} zone (${pctPos.toFixed(0)}% of day range) with ${q.chg.toFixed(2)}% decline${highVol ? ` and ${volR?.toFixed(1)}x volume confirming institutional selling` : ""}. ${yearPct != null && yearPct > 70 ? "Also extended near yearly premium." : ""}`
    : `Price sitting in ${zone} zone — no clear directional edge yet. Wait for a confirmed move.`;

  return { ...q, signal, confidence, zone, pctPos, volR, highVol, lowVol, yearPct,
           orderBlock, fairValueGap, liquidity, bsl, ssl, oteZone,
           entryZone, stopLoss, takeProfit, riskDist, yearZone, volVerdict, whyBuy, _s: score,
           _entryMid: entryMid, _stop: stopVal, _tp: tpVal };
}

// ── Yesterday's performance HTML ──────────────────────────────────────────────
function buildPerfSection(hist: BriefHistory, currentPrices: Map<string, number>): string {
  type Row = { symbol: string; signal: string; move: number; result: string; color: string };
  const rows: Row[] = [];

  for (const p of hist.predictions) {
    if (p.signal === "HOLD") continue;
    const cur = currentPrices.get(p.symbol);
    if (cur == null) continue;

    const movePct = ((cur - p.entryMid) / p.entryMid) * 100;
    const inFavor = p.signal === "BUY" ? cur > p.entryMid : cur < p.entryMid;
    const hitTp   = p.signal === "BUY" ? cur >= p.tp    : cur <= p.tp;
    const hitStop = p.signal === "BUY" ? cur <= p.stop  : cur >= p.stop;

    const result = hitTp   ? "🎯 Target Hit"
                 : hitStop ? "⚠️ Stop Hit"
                 : inFavor ? "✅ In Favor"
                           : "❌ Against";
    const color  = hitTp || inFavor ? "#10b981" : "#f87171";
    rows.push({ symbol: p.symbol, signal: p.signal, move: movePct, result, color });
  }

  if (rows.length === 0) return "";

  const wins    = rows.filter(r => r.result.startsWith("✅") || r.result.startsWith("🎯")).length;
  const winPct  = Math.round((wins / rows.length) * 100);
  const barColor = winPct >= 60 ? "#10b981" : winPct >= 40 ? "#fbbf24" : "#f87171";

  const rowsHtml = rows.map(r => `
    <tr>
      <td style="padding:5px 8px 5px 0;font-family:monospace;font-size:12px;font-weight:700;color:#f1f5f9;white-space:nowrap">${r.symbol}</td>
      <td style="padding:5px 6px;white-space:nowrap">
        <span style="background:${r.signal === "BUY" ? "#0a1f17" : "#200f0f"};color:${r.signal === "BUY" ? "#10b981" : "#f87171"};border:1px solid ${r.signal === "BUY" ? "#10b98140" : "#f8717140"};padding:2px 7px;border-radius:5px;font-size:10px;font-weight:800;font-family:monospace">${r.signal}</span>
      </td>
      <td style="padding:5px 6px;font-size:11px;color:${r.color};font-family:monospace;white-space:nowrap">${r.move >= 0 ? "+" : ""}${r.move.toFixed(2)}%</td>
      <td style="padding:5px 0;font-size:11px;color:${r.color}">${r.result}</td>
    </tr>`).join("");

  return `
  <!-- Yesterday's Performance -->
  <tr>
    <td style="padding-bottom:20px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#13112A;border:1px solid #252345;border-radius:12px">
        <tr>
          <td style="padding:14px 18px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px">
              <tr>
                <td style="vertical-align:middle">
                  <p style="margin:0;font-size:9px;font-weight:700;color:#4b5675;text-transform:uppercase;letter-spacing:1.5px">Yesterday's Predictions &mdash; ${hist.date}</p>
                </td>
                <td style="text-align:right;vertical-align:middle">
                  <span style="background:${barColor}15;color:${barColor};border:1px solid ${barColor}40;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:900;font-family:monospace">${winPct}% Win Rate &mdash; ${wins}/${rows.length}</span>
                </td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" border="0">${rowsHtml}</table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ── Personalized watchlist section ────────────────────────────────────────────

async function getUserWatchlists(): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  try {
    const { supabaseAdmin } = await import("@/app/lib/supabase");
    const { data } = await supabaseAdmin()
      .from("watchlists")
      .select("user_email, items");
    (data ?? []).forEach((row: { user_email: string; items: Array<{ symbol: string }> | null }) => {
      if (row.items && Array.isArray(row.items)) {
        result.set(row.user_email, row.items.map((i) => i.symbol.replace(/\.(US|COMM)$/, "")));
      }
    });
  } catch { /* fall back to global watchlist */ }
  return result;
}

function buildWatchlistSection(userSyms: string[], analysisMap: Map<string, ReturnType<typeof analyze>>): string {
  const stocks = userSyms.map((s) => analysisMap.get(s)).filter(Boolean) as ReturnType<typeof analyze>[];
  if (stocks.length === 0) return "";
  const sc = (sig: string) => sig === "BUY" ? "#10b981" : sig === "SELL" ? "#f87171" : "#fbbf24";
  const rows = stocks.map((s) => `
    <tr>
      <td style="padding:6px 8px 6px 0;font-family:monospace;font-size:12px;font-weight:700;color:#f1f5f9;white-space:nowrap">${s.symbol}</td>
      <td style="padding:6px 6px">
        <span style="background:${s.signal === "BUY" ? "#0a1f17" : s.signal === "SELL" ? "#200f0f" : "#1f1b09"};color:${sc(s.signal)};border:1px solid ${sc(s.signal)}40;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:800;font-family:monospace">${s.signal}</span>
      </td>
      <td style="padding:6px 6px;font-family:monospace;font-size:11px;color:#f1f5f9;white-space:nowrap">$${s.price.toFixed(2)}</td>
      <td style="padding:6px 0;font-size:11px;color:${s.chg >= 0 ? "#10b981" : "#f87171"};font-family:monospace;white-space:nowrap">${s.chg >= 0 ? "+" : ""}${s.chg.toFixed(2)}%</td>
      <td style="padding:6px 0 6px 8px;font-size:10px;color:${sc(s.signal)}">${s.confidence} conf · ${s.zone}</td>
    </tr>`).join("");
  return `
  <tr>
    <td style="padding-bottom:24px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#13112A;border:1px solid #252345;border-radius:14px">
        <tr><td style="padding:16px 20px;border-bottom:1px solid #252345">
          <p style="margin:0;font-size:9px;font-weight:700;color:#4b5675;text-transform:uppercase;letter-spacing:1.5px">Your Watchlist Today</p>
        </td></tr>
        <tr><td style="padding:12px 20px">
          <table cellpadding="0" cellspacing="0" border="0">${rows}</table>
        </td></tr>
      </table>
    </td>
  </tr>`;
}

// ── Options plays section ──────────────────────────────────────────────────────

import { runOptionsScan } from "@/app/api/market/options-scan/route";

async function fetchOptionsPlays() {
  try {
    const result = await runOptionsScan();
    return (result.plays ?? []).slice(0, 5);
  } catch { return []; }
}

function buildOptionsSection(plays: Awaited<ReturnType<typeof fetchOptionsPlays>>): string {
  if (plays.length === 0) return "";
  const dc = (p: string) => p === "CALLS" ? "#10b981" : "#f87171";
  const rows = plays.map((p, i) => `
    <tr style="border-bottom:1px solid #1a1838">
      <td style="padding:10px 8px 10px 0;font-family:monospace;font-size:12px;font-weight:700;color:#f1f5f9;white-space:nowrap">${i + 1}. ${p.symbol}</td>
      <td style="padding:10px 8px">
        <span style="background:${p.play === "CALLS" ? "#0a1f17" : "#200f0f"};color:${dc(p.play)};border:1px solid ${dc(p.play)}40;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:800;font-family:monospace">${p.play}</span>
      </td>
      <td style="padding:10px 8px;font-family:monospace;font-size:11px;color:#f1f5f9;white-space:nowrap">$${p.price.toFixed(2)}</td>
      <td style="padding:10px 8px;font-size:10px;color:#94a3b8;white-space:nowrap">${p.strike}</td>
      <td style="padding:10px 8px;font-size:10px;color:#94a3b8;white-space:nowrap">${p.expiry ?? "—"}</td>
      <td style="padding:10px 0;font-size:10px;color:${dc(p.play)};white-space:nowrap">${p.rrRatio} R:R${p.premiumEst ? ` · ${p.premiumEst}` : ""}</td>
    </tr>`).join("");
  return `
  <tr>
    <td style="padding-bottom:24px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#13112A;border:1px solid #252345;border-radius:14px">
        <tr><td style="padding:16px 20px;border-bottom:1px solid #252345">
          <p style="margin:0;font-size:9px;font-weight:700;color:#4b5675;text-transform:uppercase;letter-spacing:1.5px">📊 Top 5 Options Plays Today</p>
        </td></tr>
        <tr><td style="padding:12px 20px">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
        </td></tr>
        <tr><td style="padding:0 20px 14px"><p style="margin:0;font-size:9px;color:#333368">Entry zones, stops, and targets on each card at traxora-ai.vercel.app/dashboard</p></td></tr>
      </table>
    </td>
  </tr>`;
}

// ── Futures plays section ──────────────────────────────────────────────────────

function buildFuturesSection(stocks: ReturnType<typeof analyze>[]): string {
  const FUTURES_SYMS = ["ES", "NQ", "GC", "CL", "SI", "YM"];
  const futures = stocks.filter(s => FUTURES_SYMS.includes(s.symbol) && s.signal !== "HOLD").slice(0, 5);
  if (futures.length === 0) return "";
  const sc = (sig: string) => sig === "BUY" ? "#10b981" : "#f87171";
  const POINT_VAL: Record<string, string> = { ES: "$50/pt", NQ: "$20/pt", GC: "$100/pt", CL: "$1000/pt", SI: "$5000/pt", YM: "$5/pt" };
  const MICRO: Record<string, string>     = { ES: "MES", NQ: "MNQ", GC: "MGC", CL: "MCL", YM: "MYM" };
  const rows = futures.map((f, i) => `
    <tr style="border-bottom:1px solid #1a1838">
      <td style="padding:10px 8px 10px 0;font-family:monospace;font-size:12px;font-weight:700;color:#f1f5f9;white-space:nowrap">${i + 1}. ${f.symbol}</td>
      <td style="padding:10px 8px">
        <span style="background:${f.signal === "BUY" ? "#0a1f17" : "#200f0f"};color:${sc(f.signal)};border:1px solid ${sc(f.signal)}40;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:800;font-family:monospace">${f.signal === "BUY" ? "LONG" : "SHORT"}</span>
      </td>
      <td style="padding:10px 8px;font-family:monospace;font-size:11px;color:#f1f5f9;white-space:nowrap">$${f.price.toFixed(2)}</td>
      <td style="padding:10px 8px;font-size:10px;color:#94a3b8;white-space:nowrap">${POINT_VAL[f.symbol] ?? "—"}</td>
      <td style="padding:10px 0;font-size:10px;color:#4b5675;white-space:nowrap">Micro: ${MICRO[f.symbol] ?? "N/A"}</td>
    </tr>`).join("");
  return `
  <tr>
    <td style="padding-bottom:24px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#13112A;border:1px solid #252345;border-radius:14px">
        <tr><td style="padding:16px 20px;border-bottom:1px solid #252345">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td><p style="margin:0;font-size:9px;font-weight:700;color:#4b5675;text-transform:uppercase;letter-spacing:1.5px">⚡ Top Futures Plays Today</p></td>
              <td style="text-align:right"><p style="margin:0;font-size:9px;color:#333368">Always use stops · Consider micro contracts</p></td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:12px 20px">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
        </td></tr>
      </table>
    </td>
  </tr>`;
}

// ── Email builder (fully table-based — no flexbox, works in Gmail/Outlook/Apple Mail) ──
function buildEmail(stocks: ReturnType<typeof analyze>[], date: string, perfSection = "", watchlistSection = "", optionsSection = "", futuresSection = ""): string {
  const sc = (sig: string) => sig === "BUY" ? "#10b981" : sig === "SELL" ? "#f87171" : "#fbbf24";
  const cc = (n: number)   => n >= 0 ? "#10b981" : "#f87171";

  const buys  = stocks.filter(s => s.signal === "BUY").length;
  const sells = stocks.filter(s => s.signal === "SELL").length;
  const holds = stocks.filter(s => s.signal === "HOLD").length;

  const ms = buys > sells + 2
    ? { label: "BULLISH", color: "#10b981", bg: "#0a1f17", border: "#10b98140", desc: `${buys} BUY signals dominate — broad market strength` }
    : sells > buys + 2
    ? { label: "BEARISH", color: "#f87171", bg: "#200f0f", border: "#f8717140", desc: `${sells} SELL signals dominate — broad market weakness` }
    : { label: "MIXED",   color: "#fbbf24", bg: "#1f1b09", border: "#fbbf2440", desc: `${buys} BUY &middot; ${sells} SELL &middot; ${holds} HOLD &mdash; no clear direction` };

  const cards = stocks.map((s, i) => {
    const showEntry = s.signal !== "HOLD";
    const sigColor  = sc(s.signal);
    const sigBg     = s.signal === "BUY" ? "#0a1f17" : s.signal === "SELL" ? "#200f0f" : "#1f1b09";
    const sigBorder = `${sigColor}40`;
    const zoneColor = s.zone === "Discount" ? "#10b981" : s.zone === "Premium" ? "#f87171" : "#fbbf24";

    return `
    <!-- Card ${i + 1}: ${s.symbol} -->
    <tr>
      <td style="padding-bottom:16px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#13112A;border:1px solid #252345;border-radius:16px;overflow:hidden">

          <!-- Card header -->
          <tr>
            <td style="padding:16px 20px;border-bottom:1px solid #252345">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:top">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-right:8px;vertical-align:middle;white-space:nowrap">
                          <span style="font-family:monospace;font-size:18px;font-weight:900;color:#f1f5f9">${s.symbol}</span>
                        </td>
                        <td style="padding-right:8px;vertical-align:middle;white-space:nowrap">
                          <span style="background:${sigBg};color:${sigColor};border:1px solid ${sigBorder};padding:3px 10px;border-radius:6px;font-size:11px;font-weight:900;font-family:monospace">${s.signal}</span>
                        </td>
                        <td style="vertical-align:middle;white-space:nowrap">
                          <span style="font-size:10px;color:${sigColor};font-family:monospace">${s.confidence} Confidence</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="3" style="padding-top:4px">
                          <p style="margin:0;font-size:12px;color:#7b8db4">${s.name}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="text-align:right;vertical-align:top;white-space:nowrap">
                    <p style="margin:0;font-family:monospace;font-size:20px;font-weight:900;color:#f1f5f9">$${s.price.toFixed(2)}</p>
                    <p style="margin:2px 0 0;font-size:12px;color:${cc(s.chg)};font-weight:700">${s.chg >= 0 ? "&#9650;" : "&#9660;"} ${s.chg >= 0 ? "+" : ""}${s.chg.toFixed(2)}% today</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${showEntry ? `
          <!-- Trade setup — 3 bordered cards, perfectly equal width -->
          <tr>
            <td style="padding:14px 20px;border-bottom:1px solid #252345;background:#0a0e18">
              <p style="margin:0 0 10px;font-size:9px;font-weight:700;color:#4b5675;text-transform:uppercase;letter-spacing:1.5px">Trade Setup &mdash; 2:1 Risk/Reward &mdash; Risk per share: $${s.riskDist.toFixed(2)}</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <!-- Entry Zone card -->
                  <td style="width:33%;padding-right:6px;vertical-align:top">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1A1838;border:1px solid ${sigBorder};border-radius:10px">
                      <tr>
                        <td style="padding:10px 12px;text-align:center">
                          <p style="margin:0;font-size:9px;font-weight:700;color:${sigColor};text-transform:uppercase;letter-spacing:1px">${s.signal === "BUY" ? "&#9650; Enter Long" : "&#9660; Enter Short"}</p>
                          <p style="margin:6px 0 0;font-family:monospace;font-size:11px;font-weight:700;color:#f1f5f9">${s.entryZone}</p>
                          <p style="margin:4px 0 0;font-size:9px;color:#4b5675">Entry Zone</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Stop Loss card — always on opposite side of entry from target -->
                  <td style="width:33%;padding-right:6px;vertical-align:top">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#200f0f;border:1px solid #f8717140;border-radius:10px">
                      <tr>
                        <td style="padding:10px 12px;text-align:center">
                          <p style="margin:0;font-size:9px;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:1px">${s.signal === "BUY" ? "&#9660; Below Entry" : "&#9650; Above Entry"}</p>
                          <p style="margin:6px 0 0;font-family:monospace;font-size:13px;font-weight:900;color:#f87171">${s.stopLoss}</p>
                          <p style="margin:4px 0 0;font-size:9px;color:#f87171">Stop Loss</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Take Profit card — always on opposite side from stop -->
                  <td style="width:34%;vertical-align:top">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a1f17;border:1px solid #10b98140;border-radius:10px">
                      <tr>
                        <td style="padding:10px 12px;text-align:center">
                          <p style="margin:0;font-size:9px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:1px">${s.signal === "BUY" ? "&#9650; Above Entry" : "&#9660; Below Entry"}</p>
                          <p style="margin:6px 0 0;font-family:monospace;font-size:13px;font-weight:900;color:#10b981">${s.takeProfit}</p>
                          <p style="margin:4px 0 0;font-size:9px;color:#10b981">Take Profit</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ""}

          <!-- Smart Money analysis -->
          <tr>
            <td style="padding:14px 20px;border-bottom:1px solid #252345">
              <p style="margin:0 0 10px;font-size:9px;font-weight:700;color:#4b5675;text-transform:uppercase;letter-spacing:1.5px">Smart Money Analysis</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px">
                <tr>
                  <td style="padding:4px 0;vertical-align:top;width:50%">
                    <p style="margin:0;font-size:9px;color:#4b5675;text-transform:uppercase">Price Zone</p>
                    <p style="margin:2px 0 0;font-size:12px;font-weight:700;color:${zoneColor}">${s.zone} &mdash; ${s.pctPos.toFixed(0)}% of day range</p>
                  </td>
                  <td style="padding:4px 0;vertical-align:top;width:50%;text-align:right">
                    <p style="margin:0;font-size:9px;color:#4b5675;text-transform:uppercase">52-Week Position</p>
                    <p style="margin:2px 0 0;font-size:12px;font-weight:700;color:#cbd5e1">${s.yearZone}</p>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${s.orderBlock ? `
                <tr>
                  <td style="padding:3px 0;width:36px;vertical-align:top"><span style="font-size:10px;font-weight:800;color:#a78bfa;font-family:monospace">OB</span></td>
                  <td style="padding:3px 0;vertical-align:top"><span style="font-size:11px;color:#cbd5e1">${s.orderBlock}</span></td>
                </tr>` : ""}
                ${s.fairValueGap ? `
                <tr>
                  <td style="padding:3px 0;width:36px;vertical-align:top"><span style="font-size:10px;font-weight:800;color:#60a5fa;font-family:monospace">FVG</span></td>
                  <td style="padding:3px 0;vertical-align:top"><span style="font-size:11px;color:#cbd5e1">${s.fairValueGap}</span></td>
                </tr>` : ""}
                <tr>
                  <td style="padding:3px 0;width:36px;vertical-align:top"><span style="font-size:10px;font-weight:800;color:#fbbf24;font-family:monospace">BSL</span></td>
                  <td style="padding:3px 0;vertical-align:top"><span style="font-size:11px;color:#cbd5e1">Buy-side liquidity above ${s.bsl} &mdash; equal highs / prior high</span></td>
                </tr>
                <tr>
                  <td style="padding:3px 0;width:36px;vertical-align:top"><span style="font-size:10px;font-weight:800;color:#f87171;font-family:monospace">SSL</span></td>
                  <td style="padding:3px 0;vertical-align:top"><span style="font-size:11px;color:#cbd5e1">Sell-side liquidity below ${s.ssl} &mdash; equal lows / prior low</span></td>
                </tr>
                ${s.oteZone ? `
                <tr>
                  <td style="padding:3px 0;width:36px;vertical-align:top"><span style="font-size:10px;font-weight:800;color:#34d399;font-family:monospace">OTE</span></td>
                  <td style="padding:3px 0;vertical-align:top"><span style="font-size:11px;color:#cbd5e1">Optimal Trade Entry: ${s.oteZone} (62&ndash;79% retracement)</span></td>
                </tr>` : ""}
                <tr>
                  <td style="padding:3px 0;width:36px;vertical-align:top"><span style="font-size:10px;font-weight:800;color:#94a3b8;font-family:monospace">VOL</span></td>
                  <td style="padding:3px 0;vertical-align:top"><span style="font-size:11px;color:#cbd5e1">${s.volVerdict}</span></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Why this signal -->
          <tr>
            <td style="padding:12px 20px;background:#0c1120">
              <p style="margin:0 0 4px;font-size:9px;font-weight:700;color:#4b5675;text-transform:uppercase;letter-spacing:1.5px">Why This Signal</p>
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6">${s.whyBuy}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Traxora AI &mdash; Morning Brief ${date}</title>
</head>
<body style="margin:0;padding:0;background:#0D0B1A;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0D0B1A;min-height:100vh">
<tr><td align="center" style="padding:24px 16px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">

  <!-- Masthead -->
  <tr>
    <td style="padding-bottom:16px">
      <table cellpadding="0" cellspacing="0" border="0" style="background:#13112A;border:1px solid #252345;border-radius:12px">
        <tr>
          <td style="padding:10px 18px">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:22px;vertical-align:middle;padding-right:12px">&#127749;</td>
                <td style="vertical-align:middle">
                  <p style="margin:0;font-size:15px;font-weight:900;color:#f1f5f9;letter-spacing:-0.3px">Traxora AI &middot; Morning Brief</p>
                  <p style="margin:0;font-size:10px;color:#4b5675;font-family:monospace">${date} &middot; 7:30 AM MT &middot; Smart Money Analysis</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Title -->
  <tr>
    <td style="padding-bottom:20px">
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:900;color:#f1f5f9;letter-spacing:-0.5px">Today&rsquo;s Top ${stocks.length} Opportunities</h1>
      <p style="margin:0;font-size:12px;color:#4b5675">Live market data &middot; Full institutional analysis &middot; Entry, stop &amp; target for every signal</p>
    </td>
  </tr>

  ${perfSection}

  <!-- Market sentiment banner -->
  <tr>
    <td style="padding-bottom:20px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${ms.bg};border:1px solid ${ms.border};border-radius:12px">
        <tr>
          <td style="padding:14px 18px">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:1%;white-space:nowrap;padding-right:14px;vertical-align:middle">
                  <table cellpadding="0" cellspacing="0" border="0" style="border-radius:8px;background:${ms.bg};border:1px solid ${ms.border}">
                    <tr><td style="padding:6px 12px">
                      <span style="font-size:12px;font-weight:900;color:${ms.color};font-family:monospace">MARKET: ${ms.label}</span>
                    </td></tr>
                  </table>
                </td>
                <td style="vertical-align:middle">
                  <p style="margin:0;font-size:12px;color:#94a3b8">${ms.desc}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Quick stats -->
  <tr>
    <td style="padding-bottom:24px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="width:25%;padding-right:8px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a1f17;border:1px solid #10b98130;border-radius:10px">
              <tr><td style="padding:12px 8px;text-align:center">
                <p style="margin:0;font-size:22px;font-weight:900;color:#10b981">${buys}</p>
                <p style="margin:3px 0 0;font-size:9px;color:#10b981;text-transform:uppercase;letter-spacing:1px">BUY</p>
              </td></tr>
            </table>
          </td>
          <td style="width:25%;padding-right:8px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#200f0f;border:1px solid #f8717130;border-radius:10px">
              <tr><td style="padding:12px 8px;text-align:center">
                <p style="margin:0;font-size:22px;font-weight:900;color:#f87171">${sells}</p>
                <p style="margin:3px 0 0;font-size:9px;color:#f87171;text-transform:uppercase;letter-spacing:1px">SELL</p>
              </td></tr>
            </table>
          </td>
          <td style="width:25%;padding-right:8px">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1f1b09;border:1px solid #fbbf2430;border-radius:10px">
              <tr><td style="padding:12px 8px;text-align:center">
                <p style="margin:0;font-size:22px;font-weight:900;color:#fbbf24">${holds}</p>
                <p style="margin:3px 0 0;font-size:9px;color:#fbbf24;text-transform:uppercase;letter-spacing:1px">HOLD</p>
              </td></tr>
            </table>
          </td>
          <td style="width:25%">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1A1838;border:1px solid #252345;border-radius:10px">
              <tr><td style="padding:12px 8px;text-align:center">
                <p style="margin:0;font-size:22px;font-weight:900;color:#f1f5f9">${stocks.length}</p>
                <p style="margin:3px 0 0;font-size:9px;color:#4b5675;text-transform:uppercase;letter-spacing:1px">TOTAL</p>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Key levels legend -->
  <tr>
    <td style="padding-bottom:24px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#13112A;border:1px solid #252345;border-radius:10px">
        <tr>
          <td style="padding:12px 16px">
            <p style="margin:0 0 8px;font-size:9px;font-weight:700;color:#4b5675;text-transform:uppercase;letter-spacing:1.5px">Key Levels Legend</p>
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:10px;font-size:10px;white-space:nowrap"><span style="color:#a78bfa;font-weight:800">OB</span> <span style="color:#4b5675">Order Block</span></td>
                <td style="padding-right:10px;color:#333368;font-size:10px">&middot;</td>
                <td style="padding-right:10px;font-size:10px;white-space:nowrap"><span style="color:#60a5fa;font-weight:800">FVG</span> <span style="color:#4b5675">Fair Value Gap</span></td>
                <td style="padding-right:10px;color:#333368;font-size:10px">&middot;</td>
                <td style="padding-right:10px;font-size:10px;white-space:nowrap"><span style="color:#fbbf24;font-weight:800">BSL</span> <span style="color:#4b5675">Buy-Side Liq.</span></td>
                <td style="padding-right:10px;color:#333368;font-size:10px">&middot;</td>
                <td style="padding-right:10px;font-size:10px;white-space:nowrap"><span style="color:#f87171;font-weight:800">SSL</span> <span style="color:#4b5675">Sell-Side Liq.</span></td>
                <td style="padding-right:10px;color:#333368;font-size:10px">&middot;</td>
                <td style="font-size:10px;white-space:nowrap"><span style="color:#34d399;font-weight:800">OTE</span> <span style="color:#4b5675">62&ndash;79% Entry</span></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Personalized watchlist -->
  ${watchlistSection}

  <!-- Options plays -->
  ${optionsSection}

  <!-- Futures plays -->
  ${futuresSection}

  <!-- Stock cards -->
  ${cards}

  <!-- CTA -->
  <tr>
    <td style="padding:24px 0;text-align:center">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
        <tr>
          <td style="background:#4f46e5;border-radius:12px">
            <a href="https://traxora-ai.vercel.app/dashboard" style="display:block;padding:14px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:-0.2px">Open Traxora Dashboard &#8594;</a>
          </td>
        </tr>
      </table>
      <p style="margin:10px 0 0;font-size:11px;color:#4b5675">Run a live scan or deep-dive any stock</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding-top:18px;border-top:1px solid #252345;text-align:center">
      <p style="margin:0;font-size:10px;color:#333368">For educational purposes only &middot; Not financial advice &middot; Past signals do not guarantee future results</p>
      <p style="margin:6px 0 0;font-size:10px;color:#252345">Traxora AI &middot; Sent weekdays at 8:30 AM ET</p>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader  = req.headers.get("authorization");
  const querySecret = new URL(req.url).searchParams.get("secret");
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prefer an explicit email passed by the test-email route (session user's email).
  // Otherwise send to all subscribers (file + CRON_EMAIL env var).
  const emailParam = new URL(req.url).searchParams.get("email");
  const recipients = emailParam ? [emailParam] : await getEmails();
  if (recipients.length === 0) {
    return Response.json({ error: "No subscribers — add CRON_EMAIL to Vercel env vars or subscribe in Settings" }, { status: 400 });
  }

  const [quotes, prevHistory, userWatchlists, optionsPlays] = await Promise.all([
    Promise.all(WATCHLIST.map(fetchQuote)).then(r => r.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof fetchQuote>>>[]),
    loadHistory(),
    getUserWatchlists(),
    fetchOptionsPlays(),
  ]);

  // Collect extra symbols needed by user watchlists that aren't in the global set
  const globalSet = new Set(WATCHLIST);
  const extraSyms = [...new Set(
    [...userWatchlists.values()].flat().filter((s) => !globalSet.has(s))
  )].slice(0, 30);
  const extraQuotes = extraSyms.length > 0
    ? (await Promise.all(extraSyms.map(fetchQuote))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof fetchQuote>>>[]
    : [];

  const allQuotes  = [...quotes, ...extraQuotes];
  const analysisMap = new Map(allQuotes.map(q => [q.symbol, analyze(q)]));

  const ranked = [...analysisMap.values()].filter(s => WATCHLIST.includes(s.symbol)).sort((a, b) => Math.abs(b._s) - Math.abs(a._s));
  const top20  = ranked.slice(0, 20);

  const priceMap = new Map(allQuotes.map(q => [q.symbol, q.price]));
  const perfSection = prevHistory ? buildPerfSection(prevHistory, priceMap) : "";

  const today   = new Date();
  const date    = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const dateKey = today.toISOString().slice(0, 10);
  const subject = `🌅 Morning Brief — ${top20.filter(s => s.signal === "BUY").length} BUY · ${top20.filter(s => s.signal === "SELL").length} SELL · ${date}`;

  const optionsSection = buildOptionsSection(optionsPlays);
  const futuresSection = buildFuturesSection(top20);

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    const html = buildEmail(top20, date, perfSection, "", optionsSection, futuresSection);
    return Response.json({ error: "RESEND_API_KEY is not set — add it to .env.local", preview: html }, { status: 500 });
  }

  const resend = new Resend(resendKey);
  const errors: string[] = [];

  // Send individual personalized email to each recipient
  for (const email of recipients) {
    const userSyms         = userWatchlists.get(email) ?? [];
    const watchlistSection = buildWatchlistSection(userSyms, analysisMap);
    const html             = buildEmail(top20, date, perfSection, watchlistSection, optionsSection, futuresSection);
    const { error: sendError } = await resend.emails.send({
      from:    process.env.RESEND_FROM ?? "Traxora AI <onboarding@resend.dev>",
      to:      [email],
      subject,
      html,
    });
    if (sendError) errors.push(`${email}: ${sendError.message}`);
  }

  if (errors.length > 0 && errors.length >= recipients.length) {
    return Response.json({ error: errors[0] }, { status: 500 });
  }

  // Auto-post to Discord if webhook is configured
  const discordUrl = process.env.DISCORD_WEBHOOK_URL;
  if (discordUrl) {
    const topPlay = optionsPlays[0] ?? null;
    const embeds = buildBriefingEmbed(
      top20 as Parameters<typeof buildBriefingEmbed>[0],
      date,
      topPlay ? { symbol: topPlay.symbol, play: topPlay.play, expiry: topPlay.expiry ?? null } : null,
    );
    await postToDiscord(discordUrl, embeds);
  }

  // Save today's predictions for tomorrow's performance review
  await saveHistory({
    date: dateKey,
    predictions: top20.map(s => ({
      symbol:   s.symbol,
      signal:   s.signal,
      entryMid: s._entryMid,
      stop:     s._stop,
      tp:       s._tp,
      price:    s.price,
    })),
  });

  const partialFail = errors.length > 0;
  return Response.json(
    { ok: !partialFail, to: recipients, date, analyzed: allQuotes.length, top20: top20.map(s => `${s.symbol} ${s.signal}`), errors },
    { status: partialFail ? 207 : 200 },
  );
}
