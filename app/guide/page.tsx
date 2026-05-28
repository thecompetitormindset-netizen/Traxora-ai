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
  steps: Step[];
  tips?: string[];
};

const SECTIONS: Section[] = [
  {
    id: "dashboard",
    icon: "📊",
    title: "Dashboard",
    subtitle: "Your mission control — live prices, signals, and AI concepts.",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    href: "/dashboard",
    steps: [
      { step: "Open the Dashboard", detail: "This is your home base. You'll see 9 live stock cards (AAPL, NVDA, TSLA, etc.) and 8 futures contracts (ES, NQ, GC, CL, etc.) with real-time prices updating automatically." },
      { step: "Read the signal badges", detail: "Each card shows a BUY (green), HOLD (amber), or SELL (red) badge. These are updated whenever the market is fetched. Green = AI detected a bullish Smart Money setup. Red = bearish." },
      { step: "Click any card to go deeper", detail: "Tapping a stock card takes you to the full Signals page for that ticker, where Claude Opus 4.7 runs a complete ICT analysis with Order Blocks, FVGs, Liquidity, and OTE zones." },
      { step: "Enable AutoTrader", detail: "Press the green 'Auto' button in the bottom-right corner. It starts scanning your watchlist every 3 minutes and automatically places paper trades. You'll see live toasts in the bottom-left as it works." },
      { step: "Watch the ICT concepts panel", detail: "Scroll down past the stock cards to see the 6 Smart Money concepts (OB, FVG, Liquidity, MSS, OTE, Kill Zone) explained with diagrams. This teaches you what the AI is looking for." },
    ],
    tips: [
      "The market status badge at the top shows whether the NYSE is Open, Pre-Market, After-Hours, or Closed — always check this before acting on a signal.",
      "The Sentiment Widget shows the Fear & Greed score (0–100) based on live VIX and SPY data. Below 30 = fear (possible buy zone). Above 70 = greed (be cautious).",
    ],
  },
  {
    id: "signals",
    icon: "📡",
    title: "Signals (Analysis)",
    subtitle: "Get a full ICT breakdown and execute trades from one screen.",
    color: "text-teal-400",
    border: "border-teal-500/20",
    bg: "bg-teal-500/5",
    href: "/analysis",
    steps: [
      { step: "Search any ticker", detail: "Type a symbol into the search bar at the top (AAPL, NVDA, TSLA for stocks — ES, NQ, GC for futures). Select from the dropdown. The page loads a live chart and price data instantly." },
      { step: "Press 'Analyze'", detail: "Hit the blue Analyze button. Claude Opus 4.7 receives the live price, open, high, low, previous close, and day change — then applies all 6 ICT concepts and returns a verdict in 5–10 seconds." },
      { step: "Read the signal card", detail: "You'll see: the main signal (BUY / HOLD / SELL), confidence level (High / Medium / Low), risk rating, a 2-sentence summary, and 3 key observations. Below that are the ICT details — market structure, daily bias, order block, fair value gap, liquidity, and OTE." },
      { step: "Execute on Robinhood (manual)", detail: "Scroll down to the step-by-step Robinhood guide below the signal. It tells you exactly which order type to use, how to set a stop-loss, how many shares to consider, and when to exit." },
      { step: "Execute on Alpaca (automated)", detail: "If you've connected Alpaca in Settings, enter the number of shares in the Trade box and press BUY or SELL. Your paper (or live) order fires instantly via the Alpaca API." },
      { step: "Share the signal", detail: "Press the 'Share Signal' button to copy the signal to your clipboard — ready to paste into Discord, Twitter, or a group chat." },
    ],
    tips: [
      "Only act on High confidence signals during NY Kill Zone (9:30–10:30 AM ET) or London Kill Zone (2:00–5:00 AM ET). Low confidence signals during random hours have poor follow-through.",
      "BUY in Discount zone (price below 50% of daily range) and SELL in Premium zone (above 50%). The Traxora signal card shows you which zone you're in.",
    ],
  },
  {
    id: "paper",
    icon: "🎯",
    title: "Practice (Paper Trading)",
    subtitle: "Simulate real trades with $10,000 of virtual cash — zero risk.",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    href: "/paper",
    steps: [
      { step: "Pick a stock", detail: "Use the quick-pick buttons (AAPL, NVDA, TSLA, MSFT, ES, Gold, NQ, Oil) or type any symbol into the search box. The page fetches the live price automatically." },
      { step: "Choose BUY or SELL", detail: "Toggle between the BUY and SELL tabs. BUY adds shares to your holdings. SELL closes an existing position. You can't sell shares you don't own." },
      { step: "Set quantity and confirm", detail: "Enter the number of shares. The total cost is calculated live (quantity × current price). Press the green BUY or red SELL button to execute. Your cash balance updates immediately." },
      { step: "Track your holdings", detail: "Switch to the Holdings tab to see every position: symbol, quantity, average buy price, and total value. All holdings use real-time prices from the market." },
      { step: "Review trade history", detail: "The History tab shows every trade you've made — symbol, side, quantity, price, and timestamp. Use this to learn from your past decisions." },
      { step: "Monitor P&L", detail: "Your running P&L (profit/loss) is shown at the top: Cash Balance, Account Value, P&L vs. starting $10,000, and total shares held." },
    ],
    tips: [
      "Try paper trading every Signals page recommendation for 2 weeks before using real money. If your win rate stays above 50%, you're ready to consider going live.",
      "To reset your portfolio back to $10,000, go to Settings → Danger Zone and type RESET to confirm.",
    ],
  },
  {
    id: "scanner",
    icon: "📡",
    title: "Market Scanner",
    subtitle: "AI scans 20 top stocks and surfaces the 3 best setups right now.",
    color: "text-cyan-400",
    border: "border-cyan-500/20",
    bg: "bg-cyan-500/5",
    steps: [
      { step: "Open the scanner", detail: "Press the '📡 Scan' floating button in the bottom-right corner of any page (just to the left of the 'Auto' button)." },
      { step: "Press 'Run Full Scan'", detail: "The scanner fetches live quotes for 20 major stocks in parallel. It ranks them by today's momentum (biggest price moves = most interesting) and selects the top 6 for AI analysis." },
      { step: "Wait for AI analysis", detail: "Claude Opus 4.7 analyzes each of the 6 most active stocks using the same ICT framework as the Signals page. This takes 30–60 seconds depending on market conditions." },
      { step: "Read the top 3 results", detail: "You'll see the 3 best setups ranked by a composite score (confidence × signal strength × momentum). Each shows: ticker, price, day change, BUY/HOLD/SELL signal, confidence level, and the key ICT setup that triggered it." },
      { step: "Act on the best setup", detail: "Tap any result to go to the full Signals page for that ticker, where you can see the complete analysis and execute a trade." },
    ],
    tips: [
      "Run the scanner during NY Kill Zone (9:30–10:30 AM ET) for the highest-probability setups — this is when institutional volume is highest.",
      "The scanner picks stocks by momentum, not by fundamentals. A stock with a big move today (up or down) has more ICT confluence than one that's flat.",
    ],
  },
  {
    id: "autotrader",
    icon: "🤖",
    title: "AutoTrader",
    subtitle: "Fully autonomous paper trading — runs every 3 minutes on its own.",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    steps: [
      { step: "Open the AutoTrader panel", detail: "Press the 'Auto' button in the bottom-right corner of any page. A control panel slides up showing status, last action, and a countdown to the next scan." },
      { step: "Press 'Start AutoTrader'", detail: "Click the green button. The bot immediately scans the first stock (Apple) and begins rotating through the 8-stock watchlist every 3 minutes." },
      { step: "Watch the toast notifications", detail: "Live pop-ups appear in the bottom-left corner for every action: scanning, getting a quote, receiving a signal, buying shares, selling shares, or skipping (HOLD or low cash)." },
      { step: "Monitor the panel", detail: "The Auto panel shows: current status, your last executed trade, and a progress bar counting down to the next scan. The green pulsing dot means the bot is running." },
      { step: "Let it run", detail: "You don't need to do anything. The bot rotates: AAPL → NVDA → MSFT → TSLA → AMZN → GOOGL → META → JPM → repeat. Position size is ~12% of available cash per trade." },
      { step: "Press 'Stop AutoTrader' to pause", detail: "The bot stops immediately. All existing paper positions are kept. You can restart anytime — it picks up from where it left off." },
    ],
    tips: [
      "AutoTrader also drives the 3 rival bots on the Compete page — Apex, Delta, and Vera. They receive the same signals but apply different position sizing and confidence thresholds.",
      "AutoTrader works best during active market hours. Running it overnight or on weekends will still scan but market data may be delayed or unavailable for some providers.",
    ],
  },
  {
    id: "journal",
    icon: "📓",
    title: "Trade Journal",
    subtitle: "AI writes a journal entry for every trade — automatically.",
    color: "text-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    href: "/journal",
    steps: [
      { step: "No setup needed", detail: "The journal runs in the background on every page. Every time you execute a paper trade — manually or via AutoTrader — the journal listener detects it automatically." },
      { step: "AI writes the entry", detail: "Within seconds of a trade executing, Claude Opus 4.7 is called with the trade details (symbol, side, quantity, price) and writes a 2-sentence ICT-focused journal entry. Sentence 1 explains the setup. Sentence 2 gives the target or exit condition." },
      { step: "Read your entries", detail: "Open the Journal page from the nav bar. Entries appear newest first. Each shows the trade details (BUY/SELL badge, symbol, shares, price, total cost) and the AI-written note below a teal left border." },
      { step: "Study the patterns", detail: "Read your journal regularly. After 20+ entries, you'll start to see patterns — which setups you're trading most, which ones result in wins vs. losses, and what the AI consistently flags as a concern." },
      { step: "Use it before the coaching report", detail: "Before your Auto-Coach milestone fires (every 10 trades), skim your last 10 journal entries. This gives you your own view of your trading before Claude gives its assessment." },
    ],
    tips: [
      "Journal entries are stored in your browser (localStorage). They persist between sessions but are device-specific. If you clear your browser data, entries are lost.",
      "The journal captures manual AND AutoTrader trades equally. If the bot placed 50 trades overnight, you'll have 50 journal entries waiting in the morning.",
    ],
  },
  {
    id: "compete",
    icon: "🏆",
    title: "Compete",
    subtitle: "Your portfolio vs 3 AI rival bots — all starting at $10,000.",
    color: "text-rose-400",
    border: "border-rose-500/20",
    bg: "bg-rose-500/5",
    href: "/compete",
    steps: [
      { step: "Enable AutoTrader first", detail: "The rival bots (Apex, Delta, Vera) only trade when AutoTrader is scanning. Start AutoTrader from any page, then open the Compete page to watch them trade in real time." },
      { step: "Read the leaderboard", detail: "The table ranks all 4 accounts (You, Apex, Delta, Vera) by current account value. Your position is highlighted in blue. The leader gets a gold #1 badge." },
      { step: "Understand each bot", detail: "Apex (red) is aggressive — buys on any signal, 20% of cash per trade. Delta (emerald) is balanced — Medium+ confidence, 12% per trade. Vera (green) is conservative — High confidence only, 8% per trade." },
      { step: "Beat the bots manually", detail: "You can outperform the bots by trading manually on the Practice page or using the Signals page. Your manual trades count toward your total account value on the leaderboard." },
      { step: "Check win rate and trade count", detail: "The leaderboard also shows trades placed and win rate for each competitor. A bot with many trades but a low win rate is gambling. One with few trades but a high win rate is selective — like Vera." },
      { step: "Reset any bot to restart the contest", detail: "Inside the bot profile cards below the leaderboard, press 'Reset bot' to wipe that bot's portfolio back to $10,000. Useful if a bot has blown up or if you want to restart the competition." },
    ],
    tips: [
      "Vera (conservative) often wins over long timeframes because she avoids low-confidence losses. Apex often wins short-term but can blow up during choppy markets.",
      "Your own trading style shows up on the leaderboard. If you only trade manually on High confidence signals, your win rate should beat all 3 bots over time.",
    ],
  },
  {
    id: "riskguard",
    icon: "🛡️",
    title: "Risk Guard",
    subtitle: "Auto-sell stop-loss + concentration alerts — always running in the background.",
    color: "text-rose-400",
    border: "border-rose-500/20",
    bg: "bg-rose-500/5",
    steps: [
      { step: "Always on — no setup", detail: "Risk Guard activates automatically on every page load. It checks your portfolio silently every 5 minutes. You don't need to do anything." },
      { step: "Stop-loss trigger (8%)", detail: "If any position falls 8% or more below your average buy price (based on live market price), Risk Guard auto-sells the entire position and shows a red alert toast in the top-right corner." },
      { step: "Concentration alert (28%)", detail: "If a single stock grows to more than 28% of your total account value, a yellow warning toast appears reminding you to diversify. No action is taken automatically — it's advisory." },
      { step: "Portfolio drawdown alert (15%)", detail: "If your total account drops 15% below the starting $10,000 balance, a critical alert fires suggesting you pause trading and reassess." },
      { step: "Dismiss individual alerts", detail: "Each Risk Guard toast has an X button to dismiss it. Once dismissed, the same warning won't repeat in the same session (it resets when you reload the page)." },
    ],
    tips: [
      "Risk Guard only checks live prices when it runs (every 5 min). If a position drops sharply between checks, it may not catch it at exactly 8% — it will act on the next check cycle.",
      "A 8% stop-loss is tight for volatile stocks like TSLA or NVDA. Risk Guard applies it universally. If a position is volatile, consider keeping position sizes smaller to avoid constant stop-outs.",
    ],
  },
  {
    id: "briefing",
    icon: "🌅",
    title: "Morning Briefing",
    subtitle: "AI pre-market brief — auto-shows on weekday mornings, always on-demand.",
    color: "text-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    steps: [
      { step: "Auto-shows on weekday mornings", detail: "Between 9:00 and 10:30 AM ET, Monday–Friday, the briefing modal pops up automatically when you open the app. It only shows once per day (stores today's date in your browser)." },
      { step: "Open it anytime manually", detail: "Press the '☀ Brief' button in the navigation bar at the bottom of any page. This triggers a fresh briefing fetch regardless of the time of day." },
      { step: "Read the market snapshot", detail: "At the top of the briefing you'll see 3 live data cards: VIX (fear index), SPY (S&P 500 ETF price and day change), and E-mini S&P 500 Futures (ES) with its change." },
      { step: "Read the 4-sentence brief", detail: "Claude Opus 4.7 writes 4 numbered sentences: (1) VIX interpretation and sentiment, (2) SPY/ES institutional bias today, (3) which Kill Zone to focus on and an entry tip, (4) one specific thing to watch or avoid." },
      { step: "Act on it", detail: "Use the briefing to set your trading bias for the day. If sentence 2 says 'bearish institutional bias,' be more selective with BUY signals and look for SELL setups instead. Press 'Start Trading' to close." },
    ],
    tips: [
      "VIX below 15 = calm market, smart money is buying. VIX above 25 = elevated fear, smart money may be distributing. VIX above 35 = extreme fear, potential reversal zones form.",
      "The briefing uses real Yahoo Finance data for VIX, SPY, and ES futures. If the market is closed or data is unavailable, Claude will note this in the brief.",
    ],
  },
  {
    id: "coach",
    icon: "🎯",
    title: "Auto-Coach",
    subtitle: "Claude reviews your trade history every 10 trades and gives you a personalized breakdown.",
    color: "text-teal-400",
    border: "border-teal-500/20",
    bg: "bg-teal-500/5",
    steps: [
      { step: "Trigger is automatic — every 10 trades", detail: "After your 10th trade, 20th trade, 30th trade, etc., the coaching modal appears automatically on screen. You don't need to do anything to trigger it." },
      { step: "Read the assessment", detail: "The top section is an honest 1-sentence summary of your overall performance. Claude doesn't sugarcoat — if your win rate is poor, it says so directly." },
      { step: "Study your weakness", detail: "The Weakness card (red) identifies a specific pattern in your trade log — e.g., 'You're overtrading low-confidence signals during off-hours' or 'Frequent TSLA sells too early before full target reached.'" },
      { step: "Build on your strength", detail: "The Strength card (green) finds something genuine you're doing right — e.g., 'You consistently wait for the NY session before entering, which improves Kill Zone alignment.'" },
      { step: "Apply the 3 tactical tips", detail: "Three numbered tips give you specific things to change next. These are always ICT-methodology based — entry timing, exit rules, position sizing, or mindset adjustments." },
      { step: "Close and implement", detail: "Press 'Keep Trading' and immediately apply the #1 tip to your next trade. Come back to the other two tips the following day." },
    ],
    tips: [
      "The coaching report uses your last 20 trades from history. If you only paper trade via AutoTrader, make sure you also place some manual trades so Claude sees your decision-making, not just the bot's.",
      "Screenshot your coaching report and save it. After 5–6 reports, you can compare them and see if you've improved on the same weaknesses or if new ones are appearing.",
    ],
  },
  {
    id: "portfolio",
    icon: "💼",
    title: "Portfolio",
    subtitle: "Your full account snapshot — cash, holdings, win rate, and overall P&L.",
    color: "text-cyan-400",
    border: "border-cyan-500/20",
    bg: "bg-cyan-500/5",
    href: "/portfolio",
    steps: [
      { step: "Open the Portfolio page", detail: "Find it in the main nav or go to /portfolio directly. This is a read-only summary — you can't execute trades from here. It's for reviewing your current state." },
      { step: "Read the 4 stat cards", detail: "Cash Balance = uninvested cash remaining. Account Value = cash + all holdings at avg buy price. Total P&L = account value minus starting $10,000. Total Shares = all shares across all positions." },
      { step: "Check the Win Rate banner", detail: "This only appears once you've closed at least one trade (sold shares). It shows your win rate %, number of wins, losses, and total closed trades. Green = ≥60%. Amber = 40–59%. Red = below 40%." },
      { step: "Review your holdings table", detail: "The table lists every current position: symbol, number of shares, average buy price (weighted if you bought multiple times), and total invested value. Use this to see where your money is deployed." },
      { step: "Use it before making new trades", detail: "Before buying a new stock, check if you're already overexposed to a similar sector. If you hold AAPL, MSFT, NVDA, and GOOGL, adding TSLA means 100% tech exposure — Risk Guard will warn you but you should notice this yourself." },
    ],
    tips: [
      "The win rate calculation pairs each SELL with the average BUY price for that symbol. A sell above the avg buy price = win. A sell below = loss. Partial sells aren't tracked separately.",
      "Account Value uses avg buy price, not current market price. Your real P&L may differ from what the market is pricing your shares at today.",
    ],
  },
];

function SectionCard({ s }: { s: Section }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border ${s.border} ${s.bg} rounded-2xl overflow-hidden`}>
      {/* Header — always visible, clickable to expand */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{s.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <p className={`font-bold text-sm ${s.color}`}>{s.title}</p>
              {s.href && (
                <Link
                  href={s.href}
                  onClick={e => e.stopPropagation()}
                  className="text-[9px] font-bold text-[#4B5675] hover:text-[#F1F5F9] border border-[#2D3A50] px-2 py-0.5 rounded-lg transition-colors"
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

      {/* Expanded content */}
      {open && (
        <div className="px-5 pb-5 border-t border-white/[0.04]">
          {/* Steps */}
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

          {/* Tips */}
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
  function expandAll() {
    // Not needed — individual toggles work fine
  }

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-3xl mx-auto w-full">

          {/* Header */}
          <div className="mt-6">
            <h1 className="text-4xl font-bold">How to Use Traxora</h1>
            <p className="text-[#7B8DB4] mt-2">
              Step-by-step execution guides for every feature. Tap any section to expand.
            </p>
          </div>

          {/* Quick start */}
          <div className="mt-6 bg-emerald-600/10 border border-emerald-500/20 rounded-2xl p-5">
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3">Quick Start — 3 Steps</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { n: "1", title: "Practice first", desc: "Go to Practice → buy 1 share of AAPL → watch your portfolio update. Get comfortable with the interface before using real money." },
                { n: "2", title: "Read a signal", desc: "Go to Signals → type NVDA → press Analyze. Read the ICT breakdown. If it says BUY with High confidence, that's a valid paper trade." },
                { n: "3", title: "Start AutoTrader", desc: "Press the 'Auto' button bottom-right → Start AutoTrader. Watch it scan every 3 minutes and place trades automatically while you learn." },
              ].map(s => (
                <div key={s.n} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{s.n}</span>
                  <div>
                    <p className="text-xs font-bold text-[#F1F5F9] mb-0.5">{s.title}</p>
                    <p className="text-[11px] text-[#7B8DB4] leading-relaxed">{s.desc}</p>
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

          {/* Footer note */}
          <div className="mt-8 text-center">
            <p className="text-[11px] text-[#2D3A50] leading-relaxed max-w-md mx-auto">
              Traxora is a paper trading and AI signal platform for educational purposes only.
              Nothing here constitutes financial advice. Always practice with paper money before trading real capital.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
