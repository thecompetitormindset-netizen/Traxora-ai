"use client";

import Link from "next/link";
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
    subtitle: "Live prices, AI signals, custom watchlist, and price alerts — all in one view.",
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    href: "/dashboard",
    steps: [
      {
        step: "Signals load from your personal watchlist",
        detail: "The Dashboard loads your saved watchlist — by default AAPL, MSFT, NVDA, TSLA, AMZN, GOOGL, META, JPM, and ES. Each card shows a spinner while the quote and AI signal load. Expect results in 10–20 seconds per stock. Your watchlist is saved to your account so it follows you across devices.",
      },
      {
        step: "Customise your watchlist",
        detail: "Click 'Edit' next to the Market Watchlist header. An input row appears — type any ticker (SPY, AMD, BTC-USD) and press Enter or 'Add'. Traxora validates the symbol, looks up the company name, and immediately fetches its quote and signal. To remove a stock, tap the red × badge that appears on each card in edit mode. Click 'Done' to return to normal.",
      },
      {
        step: "Read the signal cards",
        detail: "Each card shows BUY (green), HOLD (amber), or SELL (red) with a confidence level. Below that: a 10-bar sparkline showing the recent price trend, the Trade Plan (Entry Zone, Stop, Target, R:R), and an 'Earns [date]' badge if earnings are within 90 days. High confidence + upcoming Kill Zone = strongest setup.",
      },
      {
        step: "Paper trade directly from the card",
        detail: "When a card shows a BUY or SELL signal, a 'Trade →' link appears in the card footer. Click it to open the paper trading modal pre-filled with the symbol, direction (LONG or SHORT), and current price. You can adjust shares and stop loss before confirming.",
      },
      {
        step: "Set price alerts on any ticker",
        detail: "Click the bell icon in the bottom-right corner of any watchlist card. A small form appears with two fields: 'Above $___' and 'Below $___'. Set either or both, click Save, and Traxora checks the thresholds every 60 seconds. When a price is hit, a push notification fires and the threshold clears automatically so it won't spam you.",
      },
      {
        step: "Trending stocks appear after the watchlist",
        detail: "After all core signals load, Traxora fetches up to 4 trending stocks from the market and runs AI analysis on them too. These appear at the end of the watchlist with a 'TRENDING' badge. They reset each session and can't be manually removed (only your core watchlist entries have the × button in edit mode).",
      },
      {
        step: "Check your portfolio summary",
        detail: "The portfolio widget below the signal stats shows Account Value, Realized P&L, open positions, and win rate at a glance. Click it to open the full Portfolio page.",
      },
      {
        step: "Scroll down for Futures and Options Plays",
        detail: "Below the watchlist: 8 futures contracts (Indices, Metals, Energy) with live prices. Below those: Top Options Plays — click 'Scan now' to surface the best options setups across 30 liquid stocks. Each card shows strike, entry zone, target, stop, premium estimate, and IV.",
      },
      {
        step: "Enable push alerts",
        detail: "Click 'Enable Signal Alerts' in the dashboard header. After approving the browser prompt, Traxora sends a push notification every time a BUY or SELL signal fires or a price alert is triggered — even if you're on a different tab.",
      },
      {
        step: "Discover row & search palette — Sports, Crypto, IPOs",
        detail: "Near the top of the Dashboard, the 'Sports · Crypto · IPO' row previews all three feeds: top game predictions with confidence bars, the biggest crypto movers, and the next rated IPOs. Click any card to open the full page. The search bar doubles as a command palette — click it while empty to see Browse shortcuts, your recent symbols, live AI signals with confidence, top sports picks, crypto movers, and upcoming IPOs in one panel.",
      },
    ],
    tips: [
      "Prices refresh every 60 seconds automatically — no reload needed. The watchlist header shows 'Updated HH:MM' so you always know how fresh the data is.",
      "The Market Status badge tells you if NYSE is Open, Pre-Market, After-Hours, or Closed. Signals during market hours carry more weight than overnight ones.",
      "The Sentiment Widget shows the Fear & Greed score (0–100). Below 30 = fear, possible accumulation. Above 70 = greed, institutions may be distributing. Use it to calibrate BUY vs SELL bias for the session.",
    ],
  },
  {
    id: "signals",
    icon: "📡",
    title: "Signals (Analysis)",
    subtitle: "Deep AI analysis, live chart, and a full trade plan in one screen.",
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
        detail: "As soon as the symbol is set, Traxora fetches the live quote (price, open, high, low, previous close) and runs a fast market analysis. Within 5–10 seconds you'll see the BUY / HOLD / SELL badge, confidence, risk rating, a 2-sentence summary, and 3 key bullet points.",
      },
      {
        step: "Read the live chart",
        detail: "The TradingView-style candlestick chart loads 30 days of OHLCV data. Use it to spot the higher-timeframe structure — where the recent swing high and low are, where price has been ranging, and whether today's price is in Premium or Discount territory.",
      },
      {
        step: "Run Deep Analysis",
        detail: "Click the 'Deep Analysis' button for the full breakdown. Claude Sonnet 4.6 runs a multi-framework analysis covering: overall bias (BULLISH / BEARISH / NEUTRAL), identified Order Blocks, Fair Value Gaps, Liquidity sweeps, OTE zones, Kill Zone alignment, and a confidence rating. This takes 20–40 seconds.",
      },
      {
        step: "Read the Trade Plan card",
        detail: "Below the deep analysis you'll find the Trade Plan — the most actionable part. It shows the exact Entry Zone (price range to enter), Stop Loss level (where you're wrong), Take Profit target (your exit), and the R:R Ratio. A 2:1 R:R or better is worth taking. Below 1:1 — skip it.",
      },
      {
        step: "Read recent news for the ticker",
        detail: "Below the volume profile and above the Deep Analysis button, Traxora shows 6 recent headlines for the current symbol pulled from Google News. Each headline links to the full article in a new tab. Use this to quickly check if there's a fundamental catalyst (earnings surprise, product launch, macro event) behind today's price action before committing to a trade.",
      },
      {
        step: "Log a trade",
        detail: "Once you've read the signal and trade plan, use the trade form on the same page to log your entry. Set your direction (LONG/SHORT), entry price, stop loss, target, and share size. The AI scores your setup before you confirm.",
      },
    ],
    tips: [
      "Only act on High confidence signals that fire during NY Kill Zone (9:30–10:30 AM ET) or London Kill Zone (2:00–5:00 AM ET). Low confidence signals outside these windows rarely have clean follow-through.",
      "The quick signal and the Deep Analysis will sometimes contradict each other — trust the Deep analysis. It runs more context and gives the final verdict. The quick signal is just a directional first look.",
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
        detail: "The scanner simultaneously fetches live quotes for 20 major stocks and futures. It ranks them by today's momentum — biggest movers (up or down) generate the most technical confluence and are the most interesting for high-probability setups.",
      },
      {
        step: "AI analyzes the top 6",
        detail: "The 6 highest-momentum stocks are sent to Claude Sonnet 4.6 for full market analysis. Each runs the same framework as the Signals page — Order Blocks, FVGs, Liquidity, Kill Zone timing, and confidence. This takes 30–60 seconds.",
      },
      {
        step: "Read the top 3 results",
        detail: "The scanner returns the 3 best setups ranked by a composite score (confidence × signal strength × momentum). Each shows: ticker, current price, day change %, BUY / HOLD / SELL signal, confidence level, and the specific setup that triggered it.",
      },
      {
        step: "Tap a result to act on it",
        detail: "Tap any scanner result to go directly to the full Analysis page for that ticker. The symbol is pre-filled and the Deep Analysis re-runs so you can see the complete breakdown and log a trade.",
      },
    ],
    tips: [
      "Run the scanner right at 9:30 AM ET when the NY Kill Zone opens — this is when institutional volume is highest and high-probability setups have the most follow-through.",
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
        detail: "The journal runs entirely in the background. Every time you close a trade, Traxora automatically sends the trade details to Claude — symbol, direction, entry price, exit price, P&L — and generates a structured journal entry within seconds.",
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
      {
        step: "Export your journal to CSV",
        detail: "Click 'Export CSV' at the top of the Journal page. A file downloads instantly with columns for date, symbol, side, qty, price, P&L ($), P&L (%), grade, and entry reasoning. Use it for tax records, backtesting in Excel, or sharing your track record.",
      },
    ],
    tips: [
      "Read your last 10 journal entries before the NY open each morning. It takes 3 minutes and keeps your recent mistakes fresh in your mind, reducing repeat errors.",
      "Journal entries sync automatically to your account via Supabase. They're preserved across devices and browser clears — no need to export for backup.",
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
        detail: "Risk Guard activates on every page load and silently checks your portfolio every 5 minutes. You don't configure it or turn it on. It's always watching.",
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
        detail: "Claude Sonnet 4.6 writes 4 numbered sentences using the live data: (1) VIX reading and what it means for today's risk appetite. (2) SPY/ES overnight bias — are institutions positioned bullish or bearish? (3) Which Kill Zone to focus on and a specific entry tip. (4) One thing to watch or avoid today.",
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
    id: "futures",
    icon: "📈",
    title: "Futures — Beginner's Complete Guide",
    subtitle: "What futures are, how they work, and exactly how to trade with $300 using micro contracts.",
    color: "text-violet-400",
    border: "border-violet-500/20",
    bg: "bg-violet-500/5",
    badge: "START HERE",
    steps: [
      {
        step: "What is a futures contract? (Plain English)",
        detail: "A futures contract is a deal to buy or sell something at a fixed price on a future date. In trading, nobody actually delivers anything — you just enter a trade, then exit it before expiry to capture the price difference. Example: if ES (S&P 500 futures) is at 5,400 and you think it's going up, you buy 1 contract. If it goes to 5,420, you sell and pocket the difference. If it drops to 5,380, you've lost. That's it. No stock ownership, no shares — just the price movement.",
      },
      {
        step: "The big difference: leverage",
        detail: "When you buy 1 share of AAPL at $200, you risk $200. When you trade 1 ES contract, you control $270,000 worth of exposure — but only need about $12,000 in margin (deposit). That's 22x leverage. One point in ES = $50. A typical 10-point move = $500 profit or loss on 1 contract. Leverage magnifies everything — wins AND losses. This is why futures can grow a small account fast, but also destroy it just as fast without strict rules.",
      },
      {
        step: "Standard contracts are too large for $300 — use Micro contracts",
        detail: "Standard ES contract: $50/point, ~$12,000 margin needed. Way too big. Micro E-mini S&P 500 (MES): exactly 1/10th the size — $5/point, ~$40–100 margin intraday. A 10-point move on 1 MES = $50 profit or loss. That's the right scale for a $300 account. All major futures have a micro version: MES (S&P 500), MNQ (Nasdaq), MYM (Dow Jones), M2K (Russell 2000). Always trade the micro version until your account is over $5,000.",
      },
      {
        step: "The 4 micro contracts — which one to start with",
        detail: "MES — Micro E-mini S&P 500: $5/point. Tracks the S&P 500. Most liquid, tightest spreads, most predictable. Best for beginners. MNQ — Micro E-mini Nasdaq-100: $2/point. Tracks tech stocks. Moves more aggressively than MES. MYM — Micro Dow Jones: $0.50/point. Slowest and smallest. M2K — Micro Russell 2000: $5/point. Most volatile. Start with MES only. It behaves exactly like SPY but with leverage. Once you're consistently profitable on MES, try MNQ.",
      },
      {
        step: "Margin: how much you need to hold a position",
        detail: "Margin is a deposit your broker holds while you have an open trade. For 1 MES contract: intraday margin (9:30 AM–4 PM ET) = approximately $40–100 depending on the broker. Overnight margin (if you keep the position past 4 PM) = approximately $500–650. With $300, you have enough for 2–3 MES contracts intraday — but only ever trade 1 contract while you're learning. One contract, strict stop, close by 4 PM every day.",
      },
      {
        step: "Which broker to use with $300",
        detail: "Tastytrade: the best option for small accounts. Intraday micro margin as low as $40 per MES contract. No platform fee. Easy to open online. Webull: also supports micro futures, low minimums. TradeStation: good platform, supports micros. Avoid TD Ameritrade / Schwab for a $300 account — their margin requirements are higher. Search 'Tastytrade micro futures account' and you can open one in 1–2 days. Deposit your $300 and you're ready.",
      },
      {
        step: "How to use Traxora's futures signals with your broker",
        detail: "The Dashboard shows 8 futures with live prices and BUY/HOLD/SELL signals: ES, NQ, YM, RTY (indices), GC (Gold), SI (Silver), CL (Oil), NG (Natural Gas). Step-by-step: (1) See ES showing High confidence BUY in the dashboard. (2) Open Tastytrade, search MES (the micro version of ES). (3) Buy 1 MES contract. (4) Set a stop loss order at the Stop price shown in the trade plan. (5) Target is the Target price. (6) Close before 4 PM ET no matter what.",
      },
      {
        step: "Risk management with $300 — the exact numbers",
        detail: "Rule: never risk more than $25 per trade (about 8% of $300). On MES ($5/point), $25 = 5 points stop distance. So if you enter MES at 5,400, your stop goes at 5,395 (buying) or 5,405 (selling). Target should be at least 10 points away for 2:1 R:R. If the trade plan shows a stop 30+ points away, skip that trade — it risks $150+ which is half your account. Discipline here is the entire game.",
      },
      {
        step: "The one rule that will save your $300 account",
        detail: "Close before 4 PM ET, every single day, no exceptions. With $300, overnight margin requirements (~$500 per MES) will generate an immediate margin call that closes your position at the worst possible price and may leave your account in the negative. Set a phone alarm for 3:45 PM ET labeled 'CLOSE FUTURES'. If you're in profit — great, close it. If you're at a loss — close it anyway. Never let a futures position run overnight on a $300 account.",
      },
      {
        step: "Realistic growth path from $300",
        detail: "Week 1–2: paper trade futures on the app (Intelligence page → Futures) without real money. Learn how MES moves. Week 3+: open 1 real MES contract, 1 trade per day max, strict 5-point stop. Goal: reach $500 before increasing to 2 contracts. $300 → $500 → $1,000 → $2,500. At $2,500 you can run 2 MES contracts comfortably. At $5,000 you can consider 1 standard ES contract. Rushing any stage kills accounts.",
      },
    ],
    tips: [
      "Never trade without a hard stop loss order already placed. Futures can move 20+ points in seconds on news events — a mental stop is not fast enough. The moment you enter, place the stop.",
      "Only trade during the NY Kill Zone (9:30–10:30 AM ET). This is when volume and follow-through are highest. Avoid trading between 12–2 PM ET — that's the lunch chop zone where price moves randomly and signals fail.",
      "A 'point' in ES/MES is 1.00 in price. ES moves in 0.25 increments called ticks. 1 tick on MES = $1.25. 4 ticks = 1 point = $5 on MES. When the dashboard trade plan says 'Target $5,415', count the distance in points from your entry — that's your dollar profit at $5/point on MES.",
    ],
  },
  {
    id: "portfolio",
    icon: "💼",
    title: "Portfolio & History",
    subtitle: "Full account snapshot, trade log, and P&L breakdown — all in one place.",
    color: "text-cyan-400",
    border: "border-cyan-500/20",
    bg: "bg-cyan-500/5",
    href: "/paper",
    steps: [
      {
        step: "Portfolio stats at a glance",
        detail: "Open the Trade page. The header shows 6 key numbers: Account Value, Total P&L, Open Positions count, Win Rate, Closed Trades, and Realized P&L — all updated live from your logged trades.",
      },
      {
        step: "Win Rate tracker",
        detail: "Once you've closed at least one trade, a Win Rate stat appears. It shows your win % across all closed trades, number of wins, number of losses, and total closed trades. Green = 60%+. Amber = 40–59%. Red = below 40%. Target 50%+ with a 2:1 R:R minimum.",
      },
      {
        step: "Open positions table",
        detail: "The Open tab lists every live position: symbol, direction (LONG/SHORT), entry date, shares, average entry price, and current unrealised P&L. Prices refresh automatically every 30 seconds while the page is open.",
      },
      {
        step: "Equity curve",
        detail: "Once you have 2 or more closed trades, an equity curve chart appears between the stats grid and the advanced metrics. It plots your account value over time across every closed trade, with a dashed $10,000 baseline. Green line = net positive. Red line = net negative. The end dot shows your current account value.",
      },
      {
        step: "Trade history and CSV export",
        detail: "Switch to the Closed tab to see every closed trade: date, symbol, direction, entry price, exit price, shares, and final P&L. An 'Export CSV' button appears in the header when you have closed trades — click it to download a spreadsheet with all your trade data for tax records or external analysis. Each closed trade also has an ✦ AI Review button for a multi-framework breakdown.",
      },
      {
        step: "Real Positions tab — your actual Robinhood holdings",
        detail: "The third tab 'Real Positions' lets you log stocks and options you actually hold on Robinhood. Enter your symbol, shares or contracts, average entry price, and optionally a stop loss. Hit 'Get AI Insight' and Claude fetches the live price, calculates your unrealised P&L, and gives you a structured AI analysis: VERDICT (HOLD / CUT / ADD / WAIT), market structure, stop loss recommendation, and two specific price levels to watch over the next 5 days.",
      },
      {
        step: "AI Insight for positions without a stop loss",
        detail: "If you log a position without a stop loss, it gets a ⚠ NO STOP badge and a warning banner appears at the top. When you run AI Insight, Claude specifically identifies the exact structural stop price — the level at which your trade thesis is invalid — based on market structure methodology. This is the most actionable output of the feature.",
      },
      {
        step: "Track AI signal performance",
        detail: "Open the History page from the nav bar and switch to the 'AI Signals' tab. Every BUY and SELL signal that fired on your account is listed here with the price at the time of the signal. Traxora fetches the current price in the background and shows the % move since the signal fired — colour-coded so you can see at a glance how the AI's calls have performed.",
      },
      {
        step: "Reset the portfolio",
        detail: "To start fresh with a clean $10,000 balance, go to Settings → Danger Zone. Type RESET into the confirmation field and confirm. This wipes all open positions, closed history, and journal entries. There is no undo. Real Positions are stored separately and are not affected by a portfolio reset.",
      },
    ],
    tips: [
      "Account Value uses your average entry prices, not current market prices. Check the unrealised P&L column in the Open tab for the real-time view.",
      "Win Rate is calculated per-trade, not per-share. A 45% win rate with a 3:1 R:R is more profitable than 60% at 1:1 — focus on both metrics together.",
      "Real Positions are for research and situational awareness only — not a signal to buy or sell. The AI Insight is a structural read of current market structure, not financial advice. Always manage risk with your own stop levels.",
    ],
  },
  {
    id: "sports",
    icon: "🏆",
    title: "Sports Predictions",
    subtitle: "Free win-probability estimates for NFL, NBA, MLB, NHL and top soccer leagues, from real season records.",
    color: "text-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    href: "/sports",
    badge: "NEW",
    steps: [
      {
        step: "Open the Sports page",
        detail: "Navigate to Sports from the Signals menu, the dashboard's Sports card, or the search palette. Every scheduled game in the next 10 days appears, pulled from ESPN's public schedule data. Each sport has its own tab: NFL, NBA, MLB, NHL, Soccer (World Cup, Premier League, Champions League, La Liga, Serie A, Bundesliga, MLS), College Football, College Basketball, and WNBA.",
      },
      {
        step: "How the prediction is built",
        detail: "Traxora pulls each team's real season win-loss record and runs it through log5 — Bill James' formula for estimating the probability one team beats another purely from their win rates. This is free and real, but it's not the same thing as a betting market: it ignores injuries, matchups, and home-field edge that real odds price in.",
      },
      {
        step: "Read the confidence number",
        detail: "The percentage next to each pick is the log5 win probability for the predicted winner. Games appear without a pick if either team has played fewer than 3 games this season — too small a sample to mean anything. 50–55% is a toss-up; 80%+ means one team has a much better record than the other.",
      },
      {
        step: "Filter to what matters",
        detail: "Use the Today / Tomorrow / All Upcoming filters to narrow the slate, and the confidence filter to hide toss-ups. The list always sorts highest-confidence first once a confidence filter is active.",
      },
      {
        step: "Watchlist a game",
        detail: "Tap the star on any game card to add it to Your Watchlist, pinned at the top of the page and synced across your devices. If you enable kickoff alerts, you'll get a browser notification about 30 minutes before a watched game starts — this only fires while the Sports tab is open, it isn't a background push notification.",
      },
      {
        step: "Build a combo",
        detail: "Tap \"+ Combo\" on any game with a pick to add it to the combo bar. It shows the combined probability of every selected pick hitting — each pick's probability multiplied together, so adding more picks always lowers the combined number, never raises it. This is a probability calculator, not a bet: there's no payout, no stake, no money involved anywhere in this app.",
      },
      {
        step: "Check the track record",
        detail: "The \"See the model's actual track record\" link shows real accuracy: every prediction is logged before its game starts and graded once the game finishes, broken down by confidence tier (does a 70-80% pick actually win 70-80% of the time?) and by league. No cherry-picking — every graded pick counts.",
      },
    ],
    tips: [
      "This is a season-record model, not a betting system — it's meaningfully weaker than real sportsbook odds. A 70% favorite by record still loses often; never treat a pick here as a sure thing.",
      "Most leagues only show games while their season is active — NFL is empty in July, for example. That's normal, not a bug.",
      "The combo probability multiplies, so a 3-pick combo of 70% favorites is only about a 34% chance all three hit — check the track record page if a combo number surprises you.",
    ],
  },
  {
    id: "crypto",
    icon: "🪙",
    title: "Crypto Radar",
    subtitle: "Moving Now & Coiled watch lists across 12 major coins — 24/7.",
    color: "text-violet-400",
    border: "border-violet-500/20",
    bg: "bg-violet-500/5",
    href: "/explore?view=crypto",
    badge: "NEW",
    steps: [
      {
        step: "Open the Crypto tab",
        detail: "Go to Explore → Crypto (or click the dashboard's Crypto Radar card). The board covers 12 majors: BTC, ETH, SOL, BNB, XRP, ADA, AVAX, DOGE, LINK, DOT, MATIC, and UNI — with live prices and day change.",
      },
      {
        step: "'Moving Now' — momentum already in play",
        detail: "Any coin up or down 5% or more in the last 24 hours lands on the Moving Now list. These are the coins where the move has started — useful for momentum entries or for avoiding late chases when RSI is already stretched.",
      },
      {
        step: "'Coiled' — squeezes before the break",
        detail: "The Coiled list flags coins whose Bollinger Band width is in the tightest 20% of its own 90-day history. Unusually tight bands historically precede bigger moves — but they signal energy, not direction, and a squeeze can sit for weeks before anything happens.",
      },
      {
        step: "Use RSI to judge the setup",
        detail: "Each coin shows its 14-day RSI. Above 70 = overbought (late to chase a green candle). Below 30 = oversold (bounce candidates). A Coiled coin with neutral RSI (40–60) breaking out is the cleanest setup on the board.",
      },
      {
        step: "Run AI analysis on any coin",
        detail: "Click any coin for the full AI analysis — the same Smart Money framework used for stocks, applied to the coin's chart, with entry zone, stop, and target. You can also add coins like BTC-USD directly to your dashboard watchlist.",
      },
    ],
    tips: [
      "Crypto trades 24/7, so the 'day change' resets against the prior daily close — a quiet coin at 9 AM can be a Moving Now coin by dinner. Check the radar at different times of day.",
      "Squeeze + breakout + volume is the classic sequence. The radar finds the squeeze; confirm the breakout direction before entering.",
    ],
  },
  {
    id: "ipo",
    icon: "🚀",
    title: "IPO Calendar",
    subtitle: "Upcoming listings rated Strong, Watch, or Speculative — SPACs flagged automatically.",
    color: "text-sky-400",
    border: "border-sky-500/20",
    bg: "bg-sky-500/5",
    href: "/ipo",
    badge: "NEW",
    steps: [
      {
        step: "Open the IPO page",
        detail: "Navigate to IPO from the Signals menu or the dashboard's IPO Calendar card. The page shows two lists: Upcoming (listings that haven't priced yet, sorted by date) and Recent (already trading, with performance vs. the IPO price where available). The calendar refreshes every 30 minutes.",
      },
      {
        step: "What the ratings mean",
        detail: "STRONG (green): major exchange (NYSE/NASDAQ), $200M+ raise, symbol and price range already set — the most institutional-quality listings. WATCH (amber): major exchange with a smaller raise, or a big raise with details still TBD. SPECULATIVE (red): SPACs and blank-check companies — high uncertainty by construction.",
      },
      {
        step: "SPACs are flagged automatically",
        detail: "Any listing whose name signals a blank-check structure ('Acquisition Corp', 'SPAC', etc.) is tagged as a SPAC and rated Speculative regardless of size. These are pools of cash looking for a company to buy — you're betting on the sponsor, not a business.",
      },
      {
        step: "Analyze a new listing after it prices",
        detail: "Once an IPO starts trading, you can run the standard AI analysis on its ticker like any other stock. Keep in mind new listings have no chart history — structure-based signals get more reliable after the first few weeks of price action.",
      },
    ],
    tips: [
      "Most IPOs are volatile in their first month and many trade below their IPO price within a year — the rating is a quality screen, not a buy signal.",
      "The 'quiet period' ends ~25 days after listing, when analyst coverage begins. Expect a volatility bump around that date.",
    ],
  },
];

function SectionCard({ s }: { s: Section }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`reveal card-hover-lift border ${s.border} ${s.bg} rounded-2xl overflow-hidden`}>
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
    <div className="min-h-screen text-[#F1F5F9]">
      <Topbar />
      <main className="app-ambient p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
        <div className="max-w-3xl mx-auto w-full">

          {/* Header */}
          <div className="mt-6">
            <p className="reveal text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-2">Documentation</p>
            <h1 className="reveal reveal-d1 section-header text-4xl font-black tracking-tight text-gradient-green">How to Use Traxora AI</h1>
          </div>

          {/* Quick start */}
          <div className="reveal reveal-d2 mt-6 bg-emerald-600/10 border border-emerald-500/20 rounded-2xl p-5">
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-4">
              First time? Start here — 3 steps
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  n: "1",
                  title: "Read a signal",
                  desc: "Go to Signals → type NVDA → wait for the quick analysis to load. Then press 'Deep Analysis' for the full breakdown with trade plan.",
                },
                {
                  n: "2",
                  title: "Log a trade",
                  desc: "Still on the Signals page — use the trade form to log the entry from the trade plan. Set your stop and target exactly as shown.",
                },
                {
                  n: "3",
                  title: "Check back at close",
                  desc: "After market close, open the Dashboard, close your position, and read the AI trade review. That's one full learning loop.",
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
          <div className="reveal reveal-d3 mt-4 card-shine glass surface-sheen border border-[#252345] rounded-2xl p-5">
            <p className="text-[10px] font-bold text-[#4B5675] uppercase tracking-widest mb-3">Market concept quick-reference</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { tag: "OB",  label: "Order Block",          desc: "Last opposing candle before a strong move — key institutional buy/sell zone" },
                { tag: "FVG", label: "Fair Value Gap",        desc: "Price imbalance from a fast move — institutions fill these gaps" },
                { tag: "LIQ", label: "Liquidity Sweep",       desc: "Stops hunted above highs or below lows before the real move" },
                { tag: "MSS", label: "Market Structure Shift",desc: "Trend changes: uptrend breaks below last HL, or downtrend above last LH" },
                { tag: "OTE", label: "Optimal Trade Entry",   desc: "61.8–78.6% Fibonacci retracement — highest-probability reversal zone" },
                { tag: "KZ",  label: "Kill Zone",             desc: "London 2–5 AM ET, NY 9:30–11 AM ET — when 80% of institutional moves happen" },
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

          {/* Futures interactive tutorial CTA */}
          <Link
            href="/futures-tutorial"
            className="reveal reveal-d3 mt-4 flex items-center gap-4 bg-violet-600/10 border border-violet-500/25 rounded-2xl p-5 hover:bg-violet-600/15 hover:border-violet-500/40 transition-colors group"
          >
            <span className="text-3xl shrink-0">📈</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-violet-300">Futures Interactive Tutorial</p>
                <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30 uppercase tracking-widest">8 steps · quiz each step</span>
              </div>
              <p className="text-[11px] text-[#4B5675] mt-0.5">Step-by-step interactive guide with quizzes. Learn by doing — designed for complete beginners with a $300 account.</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-violet-400 group-hover:text-violet-300 shrink-0 transition-colors">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </Link>

          {/* Futures quick reference */}
          <div className="reveal reveal-d3 mt-4 border border-violet-500/20 bg-violet-500/5 rounded-2xl p-5">
            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-3">Futures quick reference — micro contracts for small accounts</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {[
                { sym: "MES", full: "Micro E-mini S&P 500", per: "$5 / point",  margin: "~$50 intraday", note: "Best for beginners — most liquid" },
                { sym: "MNQ", full: "Micro E-mini Nasdaq-100", per: "$2 / point", margin: "~$50 intraday", note: "More volatile, tracks tech" },
                { sym: "MYM", full: "Micro Dow Jones",       per: "$0.50 / point", margin: "~$50 intraday", note: "Slowest, smallest moves" },
                { sym: "M2K", full: "Micro Russell 2000",    per: "$5 / point",  margin: "~$50 intraday", note: "Most volatile, small-caps" },
              ].map(c => (
                <div key={c.sym} className="flex gap-3 items-start bg-violet-500/5 border border-violet-500/15 rounded-xl p-3">
                  <span className="text-[10px] font-black text-violet-300 bg-violet-500/15 border border-violet-500/25 px-2 py-1 rounded-lg shrink-0 mt-0.5 font-mono">{c.sym}</span>
                  <div>
                    <p className="text-[10px] font-semibold text-[#F1F5F9]">{c.full}</p>
                    <p className="text-[9px] text-violet-400 font-mono mt-0.5">{c.per} · {c.margin}</p>
                    <p className="text-[9px] text-[#4B5675] mt-0.5">{c.note}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-violet-500/15 pt-3">
              {[
                { label: "1 point MES",   value: "$5.00",  sub: "smallest standard move" },
                { label: "1 tick MES",    value: "$1.25",  sub: "0.25 of a point" },
                { label: "$300 max risk", value: "5 pts",  sub: "$25/trade max stop" },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-sm font-black font-mono text-violet-300">{s.value}</p>
                  <p className="text-[9px] font-semibold text-[#F1F5F9] mt-0.5">{s.label}</p>
                  <p className="text-[9px] text-[#4B5675]">{s.sub}</p>
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
              Traxora AI is a signal research and trading tool for educational purposes only.
              Nothing on this platform constitutes financial advice.
              Always manage risk carefully before trading real capital.
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}
