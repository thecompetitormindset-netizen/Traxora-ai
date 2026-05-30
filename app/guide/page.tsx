"use client";

import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { useState } from "react";

type Step = { step: string; detail: string };
type Section = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  border: string;
  bg: string;
  href?: string;
  badge?: string;
  steps: Step[];
  tips?: string[];
};

const SECTIONS: Section[] = [
  {
    id: "dashboard",
    icon: "📊",
    title: "Dashboard",
    subtitle: "Live prices, AI signals, and your paper portfolio — all in one view.",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    href: "/dashboard",
    steps: [
      {
        step: "Signals load automatically",
        detail: "The moment you open the Dashboard, Traxora fetches live quotes for 9 core stocks (AAPL, MSFT, NVDA, TSLA, AMZN, GOOGL, META, JPM, ES) and fires AI analysis on each one. The cards show a spinner while loading — expect signals in 10–20 seconds per stock.",
      },
      {
        step: "Read the signal cards",
        detail: "Each card shows a BUY (green), HOLD (amber), or SELL (red) badge with a confidence level (High / Medium / Low). Below the badge you'll see the Trade Plan: Entry Zone, Stop Loss, Take Profit, and R:R ratio. High confidence + matching Kill Zone = strongest setup.",
      },
      {
        step: "Trending stocks appear after the watchlist",
        detail: "After all 9 core signals load, Traxora fetches up to 4 trending stocks from the market and runs AI on them too. These appear at the end of the watchlist with a 'TRENDING' badge. They reset each session.",
      },
      {
        step: "Click any card for the full breakdown",
        detail: "Tapping a stock card takes you to the Analysis page for that ticker. There you can see the live chart, run a Deep ICT analysis, and place a paper trade — all from the same screen.",
      },
      {
        step: "Check your paper portfolio summary",
        detail: "The paper portfolio widget below the signal stats shows your Account Value, Realized P&L, open positions, and win rate at a glance. Click it to open the full Paper Trading page.",
      },
      {
        step: "Scroll down for the Futures section",
        detail: "Below the stock watchlist you'll find 8 futures contracts grouped by category — Indices (ES, NQ, YM, RTY), Metals (GC, SI), and Energy (CL, NG). These show live prices and % change. Click any to analyze.",
      },
      {
        step: "Enable push alerts",
        detail: "If you haven't enabled notifications, a banner appears at the top of the Dashboard. Click 'Enable Signal Alerts' and approve the browser prompt. After that, Traxora sends a push notification every time a BUY or SELL signal fires — even if you're on a different tab.",
      },
    ],
    tips: [
      "The Market Status badge (top right of the Dashboard header) tells you if the NYSE is Open, Pre-Market, After-Hours, or Closed. Signals during market hours carry more weight than overnight ones.",
      "The Sentiment Widget above the Dashboard shows the Fear & Greed score (0–100). Below 30 = fear, possible accumulation zone. Above 70 = greed, institutions may be distributing. Use it to calibrate whether to favour BUY or SELL signals that session.",
    ],
  },
  {
    id: "signals",
    icon: "📡",
    title: "Signals (Analysis)",
    subtitle: "Deep ICT analysis, live chart, and a full trade plan in one screen.",
    color: "text-teal-400",
    border: "border-teal-500/20",
    bg: "bg-teal-500/5",
    href: "/analysis",
    steps: [
      {
        step: "Search or navigate to a ticker",
        detail: "Type any symbol into the search bar at the top — AAPL, NVDA, ES, GC, TSLA, or any stock in the market. You can also arrive here by clicking a card on the Dashboard, and the symbol will be pre-filled.",
      },
      {
        step: "A quick signal loads automatically",
        detail: "As soon as the symbol is set, Traxora fetches the live quote (price, open, high, low, previous close) and runs a fast Smart Money analysis. Within 5–10 seconds you'll see the BUY / HOLD / SELL badge, confidence, risk rating, a 2-sentence summary, and 3 key bullet points.",
      },
      {
        step: "Read the live chart",
        detail: "The TradingView-style candlestick chart loads 30 days of OHLCV data. Use it to spot the higher-timeframe structure — where the recent swing high and low are, where price has been ranging, and whether today's price is in Premium or Discount territory.",
      },
      {
        step: "Run Deep ICT Analysis",
        detail: "Click the 'Deep ICT Analysis' button for the full breakdown. Claude Opus 4.7 runs a multi-framework analysis covering: overall bias (BULLISH / BEARISH / NEUTRAL), identified Order Blocks, Fair Value Gaps, Liquidity sweeps, OTE zones, Kill Zone alignment, and a confidence rating. This takes 20–40 seconds.",
      },
      {
        step: "Read the Trade Plan card",
        detail: "Below the deep analysis you'll find the Trade Plan — the most actionable part. It shows the exact Entry Zone (price range to enter), Stop Loss level (where you're wrong), Take Profit target (your exit), and the R:R Ratio. A 2:1 R:R or better is worth taking. Below 1:1 — skip it.",
      },
      {
        step: "Log a paper trade",
        detail: "Once you've read the signal and trade plan, use the paper trade form on the same page to log your entry. Set your direction (LONG/SHORT), entry price, stop loss, target, and share size. The AI scores your setup before you confirm.",
      },
    ],
    tips: [
      "Only act on High confidence signals that fire during NY Kill Zone (9:30–10:30 AM ET) or London Kill Zone (2:00–5:00 AM ET). Low confidence signals outside these windows rarely have clean follow-through.",
      "The quick signal and the Deep ICT Analysis will sometimes contradict each other — trust the Deep analysis. It runs more context and gives the final verdict. The quick signal is just a directional first look.",
    ],
  },
  {
    id: "paper",
    icon: "🎯",
    title: "Paper Trading",
    subtitle: "Simulate real trades with $10,000 virtual cash — zero risk, real lessons.",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    href: "/paper",
    steps: [
      {
        step: "Open a new trade",
        detail: "Click the 'New Trade' button. A modal appears where you set: ticker, LONG or SHORT direction, entry price (auto-filled with live price if available), stop loss, take profit target, and number of shares or contracts.",
      },
      {
        step: "AI scores your setup before you commit",
        detail: "Before the trade is saved, Claude reviews your entry vs. your stop and target. It checks if the Risk:Reward ratio makes sense, whether your stop is too tight or too wide, and gives a 1-line verdict. If it says 'poor setup' — reconsider before confirming.",
      },
      {
        step: "Track open positions",
        detail: "The Open Positions tab shows every live trade: entry price, current price, unrealised P&L in dollars and %, and how many days the position has been open. Positions update to live market prices automatically.",
      },
      {
        step: "Close a position",
        detail: "Click 'Close' on any open position. Enter the exit price (or accept the current market price). The trade closes, your cash balance updates, and the P&L is recorded as realised. Winning trades add to your balance; losing trades subtract.",
      },
      {
        step: "Get AI trade review",
        detail: "After closing a position, Traxora runs an automatic AI review. Claude evaluates the trade across 4 frameworks: ICT (did you follow Smart Money rules?), Wyckoff (supply/demand context), R-Multiple (did you hit your target?), and Risk management. It surfaces your key mistake and biggest strength from that trade.",
      },
      {
        step: "Review your portfolio stats",
        detail: "The top of the page shows your full account snapshot: Cash Balance (uninvested cash), Account Value (cash + open positions at avg price), Net P&L vs. the $10,000 starting capital, and Win Rate % across all closed trades. Track these weekly.",
      },
    ],
    tips: [
      "Paper trade every signal for at least 2 weeks before using real money. If your win rate is consistently above 50% and your average winner is larger than your average loser, you're ready to consider going live.",
      "Your portfolio is saved in your browser's localStorage. It persists between sessions but is device-specific — if you clear your browser data or switch devices, the portfolio resets. Screenshots are your backup.",
    ],
  },
  {
    id: "scanner",
    icon: "🔍",
    title: "Market Scanner",
    subtitle: "AI scans 20 stocks in parallel and surfaces the 3 best live setups.",
    color: "text-cyan-400",
    border: "border-cyan-500/20",
    bg: "bg-cyan-500/5",
    steps: [
      {
        step: "Open the scanner",
        detail: "Press the '📡 Scan' floating button in the bottom-right corner of any page. A slide-up panel appears. You can open it from the Dashboard, Analysis page, or anywhere else in the app.",
      },
      {
        step: "Press 'Run Full Scan'",
        detail: "The scanner simultaneously fetches live quotes for 20 major stocks and futures. It ranks them by today's momentum — biggest movers (up or down) generate the most technical confluence and are the most interesting for Smart Money setups.",
      },
      {
        step: "AI analyzes the top 6",
        detail: "The 6 highest-momentum stocks are sent to Claude Opus 4.7 for full Smart Money analysis. Each runs the same framework as the Signals page — Order Blocks, FVGs, Liquidity, Kill Zone timing, and confidence. This takes 30–60 seconds.",
      },
      {
        step: "Read the top 3 results",
        detail: "The scanner returns the 3 best setups ranked by a composite score (confidence × signal strength × momentum). Each shows: ticker, current price, day change %, BUY / HOLD / SELL signal, confidence level, and the specific setup that triggered it.",
      },
      {
        step: "Tap a result to act on it",
        detail: "Tap any scanner result to go directly to the full Analysis page for that ticker. The symbol is pre-filled and the Deep ICT analysis re-runs so you can see the complete breakdown and log a paper trade.",
      },
    ],
    tips: [
      "Run the scanner right at 9:30 AM ET when the NY Kill Zone opens — this is when institutional volume is highest and smart money setups have the most follow-through.",
      "Big movers in either direction are useful. A stock down 4% today may have swept liquidity below and be setting up a reversal BUY. The scanner catches these too, not just the green runners.",
    ],
  },
  {
    id: "journal",
    icon: "📓",
    title: "Trade Journal",
    subtitle: "Every closed trade gets an AI-written journal entry — automatically.",
    color: "text-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    href: "/journal",
    steps: [
      {
        step: "Nothing to set up",
        detail: "The journal runs entirely in the background. Every time you close a paper trade, Traxora automatically sends the trade details to Claude — symbol, direction, entry price, exit price, P&L — and generates a structured journal entry within seconds.",
      },
      {
        step: "What the AI writes",
        detail: "Each entry has two parts: (1) Setup analysis — what the market structure looked like when you entered and whether the setup was sound. (2) Outcome reflection — whether you hit your target, cut early, or got stopped out, and what the price action said afterward.",
      },
      {
        step: "Read your entries",
        detail: "Open the Journal page from the nav bar. Entries appear newest first, each with a coloured left border (green = winner, red = loser, amber = scratch). The BUY/SELL badge, symbol, share count, price, and P&L are shown above each AI note.",
      },
      {
        step: "Request an AI journal review",
        detail: "At the top of the Journal page you can press 'Review My Journal' to get an AI analysis of your last 20 entries as a batch. Claude identifies patterns: which setups you're repeating, which ones are winners vs. losers, and what rule you're most consistently breaking.",
      },
      {
        step: "Build your edge over time",
        detail: "After 30+ entries you'll see clear patterns in your own trading. Most traders discover they're overtrading one session, using stops that are too tight, or entering before the Kill Zone. The journal makes these invisible habits visible.",
      },
    ],
    tips: [
      "Read your last 10 journal entries before the NY open each morning. It takes 3 minutes and keeps your recent mistakes fresh in your mind, reducing repeat errors.",
      "Journal entries are stored in localStorage — device-specific and session-persistent. Export or screenshot important entries if you want a permanent record.",
    ],
  },
  {
    id: "riskguard",
    icon: "🛡️",
    title: "Risk Guard",
    subtitle: "Automatic stop-loss execution and portfolio alerts — always running silently.",
    color: "text-rose-400",
    border: "border-rose-500/20",
    bg: "bg-rose-500/5",
    steps: [
      {
        step: "It runs automatically — no setup needed",
        detail: "Risk Guard activates on every page load and silently checks your paper portfolio every 5 minutes. You don't configure it or turn it on. It's always watching.",
      },
      {
        step: "Auto stop-loss at 8%",
        detail: "If any open position's current market price falls 8% or more below your average entry price, Risk Guard automatically closes the entire position at the current price. A red alert toast appears in the top-right corner explaining what happened and why.",
      },
      {
        step: "Concentration warning at 28%",
        detail: "If a single holding grows to more than 28% of your total account value, a yellow advisory toast appears suggesting you reduce concentration. No automatic action is taken — this is a reminder, not a forced sell.",
      },
      {
        step: "Portfolio drawdown alert at 15%",
        detail: "If your total account value drops 15% or more below the $10,000 starting capital, a critical-level alert fires. It suggests pausing trading and reviewing your last 5 trades before continuing.",
      },
      {
        step: "Dismiss individual alerts",
        detail: "Every Risk Guard toast has an X to dismiss it. Once dismissed, the same alert won't repeat during that session. Reloading the page resets the dismissed state and Risk Guard runs fresh checks.",
      },
    ],
    tips: [
      "8% is a universal stop-loss and may be too tight for high-volatility names like NVDA or TSLA, which can move 3–5% intraday. Keep position sizes smaller on volatile stocks to avoid being stopped out by normal price action.",
      "Risk Guard checks prices every 5 minutes, not tick-by-tick. A stock that flashes through 8% and recovers may still trigger the auto-sell on the next check cycle.",
    ],
  },
  {
    id: "briefing",
    icon: "🌅",
    title: "Morning Briefing",
    subtitle: "AI pre-market snapshot — auto-shows on weekday mornings, available on demand.",
    color: "text-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    steps: [
      {
        step: "It auto-shows on weekday mornings",
        detail: "Between 9:00 and 10:30 AM ET, Monday through Friday, the Morning Briefing modal opens automatically when you launch the app. It only shows once per calendar day — Traxora stores today's date in your browser to prevent it showing again.",
      },
      {
        step: "Open it any time manually",
        detail: "Press the '☀ Brief' button in the navigation bar at the bottom of any page. This fetches a fresh briefing on demand regardless of the time of day or whether you've already seen today's auto-briefing.",
      },
      {
        step: "Read the 3 live market cards",
        detail: "At the top of the briefing modal you'll see 3 real-time data cards: VIX (current fear index value and direction), SPY (S&P 500 ETF price and day change), and E-mini S&P 500 Futures (ES price and overnight change vs. prior close).",
      },
      {
        step: "Read Claude's 4-sentence brief",
        detail: "Claude Opus 4.7 writes 4 numbered sentences using the live data: (1) VIX reading and what it means for today's risk appetite. (2) SPY/ES overnight bias — are institutions positioned bullish or bearish? (3) Which Kill Zone to focus on and a specific entry tip. (4) One thing to watch or avoid today.",
      },
      {
        step: "Set your daily bias and start trading",
        detail: "Use the briefing to decide your lean for the day before you touch a single trade. If sentence 2 says 'bearish overnight positioning,' be more selective with BUY signals and look for SELL setups on bounces. Press 'Start Trading' to close the modal.",
      },
    ],
    tips: [
      "VIX below 15: calm, trending market — trend-following BUY signals work best. VIX 15–25: normal volatility, use the full framework. VIX above 25: elevated fear, mean-reversion setups are more reliable than momentum. VIX above 35: extreme — only the clearest setups are worth taking.",
      "The briefing pulls live Yahoo Finance data for VIX, SPY, and ES. If the market is closed or data is unavailable overnight, Claude notes this in the brief and adjusts its language accordingly.",
    ],
  },
  {
    id: "coach",
    icon: "🎓",
    title: "Auto-Coach",
    subtitle: "Claude reviews your last 20 trades every 10 closed positions and gives a personalised breakdown.",
    color: "text-teal-400",
    border: "border-teal-500/20",
    bg: "bg-teal-500/5",
    steps: [
      {
        step: "Triggers automatically every 10 closed trades",
        detail: "After your 10th, 20th, 30th closed trade (and every 10 thereafter), the coaching modal appears on screen automatically. You don't need to do anything — just keep trading and it fires when the milestone is reached.",
      },
      {
        step: "Overall performance sentence",
        detail: "The top of the report is a single honest assessment of your overall results. Claude doesn't soften the message — a 35% win rate is called out directly, not framed positively. This gives you a grounded baseline to work from.",
      },
      {
        step: "Your biggest weakness (red card)",
        detail: "The Weakness card identifies a specific, repeating mistake in your trade log. Examples: 'Entering TSLA positions outside Kill Zones 7 out of 10 times' or 'Stop losses placed arbitrarily — no structure reference.' These are pattern-based, not generic.",
      },
      {
        step: "Your genuine strength (green card)",
        detail: "The Strength card finds something real you're doing right. Examples: 'Consistently waiting for High confidence signals before entering' or 'R:R ratios average 2.1:1 — well above minimum threshold.' This reinforces what's working.",
      },
      {
        step: "3 tactical adjustments",
        detail: "Three numbered tips give you specific, structure-based things to change next. Always one for entry timing, one for exit rules or sizing, and one mindset or process adjustment. Apply tip #1 to your very next trade.",
      },
      {
        step: "Close and implement immediately",
        detail: "Screenshot the coaching report. Press 'Keep Trading' and go place a trade that applies tip #1. Don't wait to implement — the best time to apply feedback is the trade right after you read it, while it's fresh.",
      },
    ],
    tips: [
      "The coaching report analyses your last 20 trades from trade history. If you have fewer than 10 closed trades, the report fires anyway but notes the limited sample size — take early reports as directional, not definitive.",
      "After 5 or 6 coaching reports, compare them side by side. If the same weakness appears in report 1 and report 4, it's a structural issue in your process — not a random mistake. That's where your real edge improvement lives.",
    ],
  },
  {
    id: "portfolio",
    icon: "💼",
    title: "Portfolio & History",
    subtitle: "Full account snapshot, trade log, and P&L breakdown — all inside Paper Trading.",
    color: "text-cyan-400",
    border: "border-cyan-500/20",
    bg: "bg-cyan-500/5",
    href: "/paper",
    steps: [
      {
        step: "Portfolio stats at the top of Paper Trading",
        detail: "Open the Paper Trading page. The header shows 4 key numbers: Cash Balance (uninvested cash), Account Value (cash + open positions at average entry price), Net P&L vs. the $10,000 starting capital (green if up, red if down), and total shares held across all open positions.",
      },
      {
        step: "Win Rate tracker",
        detail: "Once you've closed at least one trade, a Win Rate stat appears. It shows your win % across all closed trades, number of wins, number of losses, and total closed trades. Green = 60%+. Amber = 40–59%. Red = below 40%. Target 50%+ with a 2:1 R:R minimum.",
      },
      {
        step: "Open positions table",
        detail: "The Open tab lists every live position: symbol, direction (LONG/SHORT), entry date, shares, average entry price, and current unrealised P&L. Positions use live market prices fetched when the page loads — click the refresh icon to update manually.",
      },
      {
        step: "Trade history",
        detail: "Switch to the History tab to see every closed trade: date opened, date closed, symbol, direction, entry price, exit price, shares, and final P&L. Sort by date or P&L to identify your best and worst trades. Use this table alongside the journal for self-review.",
      },
      {
        step: "Reset the portfolio",
        detail: "To start fresh with a clean $10,000 balance, go to Settings → Danger Zone. Type RESET into the confirmation field and confirm. This wipes all open positions, closed history, and journal entries. There is no undo.",
      },
    ],
    tips: [
      "Account Value uses your average entry prices, not current market prices. The number on screen may differ from what the market is pricing your shares at today — check the unrealised P&L column in the Open tab for the real-time view.",
      "Win Rate is calculated per-trade, not per-share. Closing 50 shares of AAPL at a profit counts as 1 win, same as closing 1 share. Focus on both win rate and average winner size — a 45% win rate with a 3:1 R:R is more profitable than 60% at 1:1.",
    ],
  },
];

function SectionCard({ s }: { s: Section }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border ${s.border} ${s.bg} rounded-2xl overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{s.icon}</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-bold text-sm ${s.color}`}>{s.title}</p>
              {s.badge && (
                <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 uppercase tracking-widest">
                  {s.badge}
                </span>
              )}
              {s.href && (
                <Link
                  href={s.href}
                  onClick={e => e.stopPropagation()}
                  className="text-[9px] font-bold text-[#4B5675] hover:text-[#F1F5F9] border border-[#333368] px-2 py-0.5 rounded-lg transition-colors"
                >
                  Open →
                </Link>
              )}
            </div>
            <p className="text-[10px] text-[#4B5675] mt-0.5">{s.subtitle}</p>
          </div>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4B5675"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-white/[0.04]">
          <div className="mt-4 space-y-3">
            {s.steps.map((step, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className={`w-6 h-6 rounded-full border text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5 ${s.border} ${s.color}`}>
                  {i + 1}
                </span>
                <div>
                  <p className="text-xs font-semibold text-[#F1F5F9] mb-0.5">{step.step}</p>
                  <p className="text-xs text-[#7B8DB4] leading-relaxed">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {s.tips && s.tips.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.04] space-y-2">
              <p className="text-[9px] font-bold text-[#4B5675] uppercase tracking-widest mb-2">Pro Tips</p>
              {s.tips.map((tip, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-amber-400 text-xs shrink-0 mt-0.5">💡</span>
                  <p className="text-[11px] text-[#4B5675] leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-3xl mx-auto w-full">

          {/* Header */}
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-2">Documentation</p>
            <h1 className="text-4xl font-black tracking-tight">How to Use Traxora AI</h1>
            <p className="text-[#7B8DB4] mt-2 text-sm leading-relaxed">
              Step-by-step guides for every feature. Tap any section to expand.
            </p>
          </div>

          {/* Quick start */}
          <div className="mt-6 bg-emerald-600/10 border border-emerald-500/20 rounded-2xl p-5">
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-4">
              First time? Start here — 3 steps
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  n: "1",
                  title: "Read a signal",
                  desc: "Go to Signals → type NVDA → wait for the quick analysis to load. Then press 'Deep ICT Analysis' for the full breakdown with trade plan.",
                },
                {
                  n: "2",
                  title: "Log a paper trade",
                  desc: "Still on the Signals page — use the paper trade form to log the entry from the trade plan. Set your stop and target exactly as shown.",
                },
                {
                  n: "3",
                  title: "Check back at close",
                  desc: "After market close, open the Dashboard, close your paper position, and read the AI trade review. That's one full learning loop.",
                },
              ].map(s => (
                <div key={s.n} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    {s.n}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[#F1F5F9] mb-0.5">{s.title}</p>
                    <p className="text-[11px] text-[#7B8DB4] leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SMC cheatsheet */}
          <div className="mt-4 bg-[#13112A] border border-[#252345] rounded-2xl p-5">
            <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-3">Smart Money concept quick-reference</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { tag: "OB",  label: "Order Block",          desc: "Last opposing candle before a strong move — smart money's buy/sell zone" },
                { tag: "FVG", label: "Fair Value Gap",        desc: "Price imbalance from a fast move — institutions fill these gaps" },
                { tag: "LIQ", label: "Liquidity Sweep",       desc: "Stops hunted above highs or below lows before the real move" },
                { tag: "MSS", label: "Market Structure Shift",desc: "Trend changes: uptrend breaks below last HL, or downtrend above last LH" },
                { tag: "OTE", label: "Optimal Trade Entry",   desc: "61.8–78.6% Fibonacci retracement — highest-probability reversal zone" },
                { tag: "KZ",  label: "Kill Zone",             desc: "London 2–5 AM ET, NY 7–10 AM ET — when 80% of institutional moves happen" },
              ].map(c => (
                <div key={c.tag} className="flex gap-2 items-start">
                  <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded shrink-0 mt-0.5">{c.tag}</span>
                  <div>
                    <p className="text-[10px] font-semibold text-[#F1F5F9]">{c.label}</p>
                    <p className="text-[9px] text-[#4B5675] leading-relaxed">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section guides */}
          <div className="mt-6 space-y-3">
            {SECTIONS.map(s => (
              <SectionCard key={s.id} s={s} />
            ))}
          </div>

          {/* Disclaimer */}
          <div className="mt-8 text-center">
            <p className="text-[11px] text-[#333368] leading-relaxed max-w-md mx-auto">
              Traxora AI is a paper trading simulator and signal research tool for educational purposes only.
              Nothing on this platform constitutes financial advice.
              Always practice with paper money before trading real capital.
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}
