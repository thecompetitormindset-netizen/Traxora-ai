"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Topbar from "@/app/components/Topbar";

const STORAGE_KEY = "futures_tutorial_v1";

type QuizOption = { label: string; correct: boolean };
type Step = {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  content: { heading: string; body: string }[];
  keyFact: string;
  quiz: { question: string; options: QuizOption[]; explanation: string } | null;
  action: { label: string; href: string; detail: string } | null;
};

const STEPS: Step[] = [
  {
    id: "what-are-futures",
    emoji: "📦",
    title: "What Is a Futures Contract?",
    subtitle: "The simplest explanation possible",
    content: [
      {
        heading: "Think of it like a price bet",
        body: "A futures contract is an agreement between two people: one bets the price goes UP, the other bets it goes DOWN. Whoever is right collects money from the other. You never actually own anything — no stocks, no oil, nothing. You just profit or lose from the price movement.",
      },
      {
        heading: "Real example: ES Futures",
        body: "ES is the E-mini S&P 500 futures contract. It follows the S&P 500 index. If the S&P 500 goes from 5,400 to 5,410 (up 10 points), and you were betting it goes up — you win. If it drops to 5,390 instead, you lose. The size of your win or loss depends on the contract size.",
      },
      {
        heading: "Why not just trade SPY stock instead?",
        body: "You can, but futures have advantages: they trade nearly 24 hours, you can go short (bet on falling prices) easily, and they use leverage — meaning you control a large position with a small deposit. More on leverage in the next step.",
      },
    ],
    keyFact: "Futures trade 23 hours a day, Sunday 6 PM – Friday 5 PM ET. You can trade before the stock market opens and after it closes.",
    quiz: {
      question: "When you trade ES futures, what do you actually own?",
      options: [
        { label: "500 shares of every S&P 500 company", correct: false },
        { label: "Nothing — you're betting on price direction", correct: true },
        { label: "A share of the S&P 500 index fund", correct: false },
        { label: "A contract that pays interest like a bond", correct: false },
      ],
      explanation: "Futures are pure price bets. You never own any stock or asset. You enter a contract, and when you exit it, you collect the profit or pay the loss based purely on price movement.",
    },
    action: {
      label: "See live futures prices on the Dashboard",
      href: "/dashboard",
      detail: "Scroll down past your watchlist — you'll see the Futures section with live ES, NQ, YM, and more.",
    },
  },
  {
    id: "leverage",
    emoji: "⚡",
    title: "Leverage: Small Money, Big Exposure",
    subtitle: "The most important concept in futures",
    content: [
      {
        heading: "What leverage means",
        body: "Leverage lets you control a large position with a small deposit. Example: 1 standard ES contract controls $270,000 of S&P 500 exposure. But you only need about $12,000 as a deposit (called margin). That's 22× leverage — every $1 you put in controls $22 of market exposure.",
      },
      {
        heading: "The math of a 10-point ES move",
        body: "1 point in ES = $50. So if ES moves 10 points in your direction, you make $500. If it moves 10 points against you, you lose $500. That's on a single standard contract. The S&P 500 moves 20–50 points on an average day — so a standard contract can mean $1,000–$2,500 swings per day.",
      },
      {
        heading: "This is why you use MICRO contracts",
        body: "A Micro E-mini S&P 500 (MES) is exactly 1/10th the size of ES. 1 point on MES = $5. A 10-point move = $50 profit or loss. That's the right scale for a $300 account. You get all the same hours, same signals, same markets — just 10× smaller risk.",
      },
    ],
    keyFact: "Leverage cuts both ways. A 10-point move makes you $50 on MES — but it can also cost you $50. This is why a hard stop loss is not optional. It's the only thing standing between you and losing your whole account on one bad trade.",
    quiz: {
      question: "MES moves 15 points in your favour. How much profit is that?",
      options: [
        { label: "$750", correct: false },
        { label: "$150", correct: false },
        { label: "$75", correct: true },
        { label: "$15", correct: false },
      ],
      explanation: "MES = $5 per point. 15 points × $5 = $75. (On standard ES it would be 15 × $50 = $750 — 10× bigger.)",
    },
    action: {
      label: "See an ES signal on the Dashboard",
      href: "/dashboard",
      detail: "Find the Futures section. When ES shows a BUY signal, MES is the micro version you'd trade on your broker.",
    },
  },
  {
    id: "micro-contracts",
    emoji: "🔬",
    title: "The 4 Micro Contracts — Your Toolkit",
    subtitle: "The only futures you need with a $300 account",
    content: [
      {
        heading: "MES — Micro E-mini S&P 500 ($5/pt)",
        body: "Tracks the S&P 500 index — the 500 largest US companies. Most liquid, tightest spreads, most predictable. This is your starting point. On the Traxora dashboard, it appears as ES in the futures section. Your broker equivalent: search 'MES' on Tastytrade.",
      },
      {
        heading: "MNQ — Micro E-mini Nasdaq-100 ($2/pt)",
        body: "Tracks the Nasdaq-100 — mostly tech stocks (Apple, Nvidia, Microsoft). Moves more aggressively than MES. When tech is running or selling off, MNQ amplifies the move. Good for trending tech days, but more volatile. Dashboard shows it as NQ.",
      },
      {
        heading: "MYM and M2K — for later",
        body: "MYM tracks the Dow Jones ($0.50/pt) and M2K tracks the Russell 2000 small-caps ($5/pt). Learn MES first. Add MNQ after 20+ profitable MES trades. MYM and M2K are advanced — you may never need them.",
      },
      {
        heading: "Intraday margin requirement",
        body: "To hold 1 MES contract while the market is open, your broker freezes approximately $40–100 as margin (varies by broker and market conditions). With $300, you can technically hold 3 contracts — but only ever trade 1 until you're consistently profitable.",
      },
    ],
    keyFact: "All micro contracts trade the exact same hours and follow the exact same signals as their standard counterparts. MES signal = ES signal. MNQ signal = NQ signal. The only difference is the dollar amount per point.",
    quiz: {
      question: "Which micro contract tracks the S&P 500 and costs $5 per point?",
      options: [
        { label: "MNQ", correct: false },
        { label: "MYM", correct: false },
        { label: "M2K", correct: false },
        { label: "MES", correct: true },
      ],
      explanation: "MES (Micro E-mini S&P 500) = $5/point, tracks the S&P 500. It's the best starting point for beginners because it's the most liquid and predictable micro contract.",
    },
    action: {
      label: "Open the Intelligence page — Futures tab",
      href: "/intelligence?section=futures",
      detail: "See all 8 futures contracts with live prices, signals, and sparklines. Practice identifying which ones are trending.",
    },
  },
  {
    id: "reading-signals",
    emoji: "📡",
    title: "Reading Traxora's Futures Signals",
    subtitle: "How to turn a dashboard signal into an actual trade",
    content: [
      {
        heading: "Step 1 — Find a High confidence signal",
        body: "On the Dashboard, scroll to the Futures section. Each card shows a BUY (green), HOLD (amber), or SELL (red) badge with a confidence level. Only act on HIGH confidence signals. Medium and Low are too uncertain — the market needs to be clearly trending in one direction.",
      },
      {
        heading: "Step 2 — Check the signal direction",
        body: "BUY = price is trending up → buy a MES contract on your broker (also called going LONG). SELL = price is trending down → sell/short a MES contract (also called going SHORT). HOLD = unclear direction → do nothing. 'Do nothing' is also a valid trade decision.",
      },
      {
        heading: "Step 3 — Click the card for the full trade plan",
        body: "Click any futures card to go to the Analysis page for that symbol. Hit 'Deep Analysis' to get the full trade plan: exact Entry Zone (price range to buy/sell in), Stop Loss price (where you exit if wrong), and Target price (where you take profit). Write these three numbers down before opening your broker.",
      },
      {
        heading: "Step 4 — Time it with the Kill Zone",
        body: "The best time to enter a futures trade is the New York Kill Zone: 9:30–10:30 AM ET. This is when institutional volume is highest and signals have the most follow-through. A High confidence BUY at 10 AM ET is far more reliable than the same signal at 1 PM ET during the slow midday session.",
      },
    ],
    keyFact: "The 3 numbers you always need before entering any trade: Entry Zone (where to get in), Stop Loss (where you're wrong — exit immediately), Target (where to take profit). Never enter without all three written down.",
    quiz: {
      question: "ES shows a High confidence BUY signal at 9:45 AM ET. What's your next step?",
      options: [
        { label: "Buy immediately at market price without checking the trade plan", correct: false },
        { label: "Click the card, get the trade plan (Entry/Stop/Target), then buy MES on your broker", correct: true },
        { label: "Wait until 3 PM ET for more confirmation", correct: false },
        { label: "Buy 3 MES contracts to maximize the move", correct: false },
      ],
      explanation: "Always get the trade plan first: Entry Zone, Stop Loss, Target. Then buy 1 MES contract at your broker within the Entry Zone. The NY Kill Zone (9:30–10:30 AM) is ideal timing — you're already in it.",
    },
    action: {
      label: "Analyse ES futures signal now",
      href: "/analysis?symbol=ES%3DF",
      detail: "Type ES=F in the analysis page to see E-mini S&P 500 — same signal, same trade plan you'd follow on MES.",
    },
  },
  {
    id: "entering-a-trade",
    emoji: "🎯",
    title: "Placing Your First MES Trade",
    subtitle: "Exactly what to do on your broker, step by step",
    content: [
      {
        heading: "Step 1 — Open Tastytrade (or your futures broker)",
        body: "Search for 'MES' in the futures search bar. You'll see 'MES Sep 25' or whichever the front-month contract is — that's the one you want. Front month = the nearest upcoming expiry date. Always trade the front month for most liquidity.",
      },
      {
        heading: "Step 2 — Choose direction",
        body: "Traxora says BUY → click 'Buy' on your broker (Long). Traxora says SELL → click 'Sell' on your broker (Short). Start with Limit orders, not Market orders. A Limit order lets you specify exactly what price to pay and prevents getting filled at a bad price during fast moves.",
      },
      {
        heading: "Step 3 — Set quantity to 1",
        body: "Quantity = 1 contract. Always 1 contract while you're learning — no matter how confident you feel. A $300 account running 2 contracts gets wiped 2× as fast when a trade goes wrong.",
      },
      {
        heading: "Step 4 — Place a stop loss order immediately",
        body: "The moment your buy order fills, immediately place a Stop Loss order at the Stop price from Traxora's trade plan. This is not optional. A stop loss is a waiting sell order — if the price hits that level, your broker automatically closes the position. Without it, a fast move can cost you far more than planned.",
      },
      {
        heading: "Step 5 — Walk away and let it run",
        body: "Once you're in with a stop, let the trade work. The most common beginner mistake is closing a trade early because it looks scary, then watching it hit the original target without you. Set the stop, set an alert at your target price, and wait.",
      },
    ],
    keyFact: "Order types: Market order = fill immediately at whatever price is available (can be bad in fast markets). Limit order = only fill at your exact price or better. Stop order = triggers when price hits a level (used for stop losses). Always use Limit to enter, Stop to exit when wrong.",
    quiz: {
      question: "You buy 1 MES at 5,400. The Traxora trade plan says Stop: 5,393. What do you do next?",
      options: [
        { label: "Watch the price and manually exit if it hits 5,393", correct: false },
        { label: "Wait to place the stop until you see the trade is losing", correct: false },
        { label: "Immediately place a Stop Loss order at 5,393 on your broker", correct: true },
        { label: "Place a stop at 5,350 to give the trade more room", correct: false },
      ],
      explanation: "Place the stop loss immediately after entry — not later. A manual mental stop fails when prices move fast. 5,393 = 7 points risk × $5 = $35 max loss. That's appropriate for a $300 account.",
    },
    action: {
      label: "Paper trade a futures signal right now",
      href: "/paper",
      detail: "Open Paper Trading, select LONG or SHORT, enter the MES price and stop from Traxora's trade plan. No real money — just practice the process.",
    },
  },
  {
    id: "stop-loss",
    emoji: "🛡️",
    title: "Risk Management: The $300 Account Rules",
    subtitle: "The exact numbers that keep your account alive",
    content: [
      {
        heading: "The 8% rule per trade",
        body: "Never risk more than 8% of your account per trade. With $300, that's $24 maximum per trade. On MES ($5/point), $24 = 4.8 points ≈ 5 points. So your stop loss must always be within 5 points of your entry. If the trade plan shows a 20-point stop — that trade is not for a $300 account. Skip it.",
      },
      {
        heading: "Calculating your stop distance",
        body: "Entry price: 5,400. 8% of $300 = $24. $24 ÷ $5 per point = 4.8 points. Stop loss must be at or above 5,395.25 (if long) or at or below 5,404.75 (if short). Write this calculation before every trade — takes 10 seconds and saves your account.",
      },
      {
        heading: "Target must be 2× your stop distance",
        body: "If your stop is 5 points away, your target must be at least 10 points away. This gives you a 2:1 Risk:Reward — you risk $25 to make $50. Even at a 45% win rate, a 2:1 R:R is profitable long-term. Never take a trade with less than 2:1 R:R — it's mathematically losing.",
      },
      {
        heading: "The daily loss limit",
        body: "If you lose $60 in one day (20% of $300), stop trading for that day — full stop. Log off. Three losses in a row usually means the market is choppy and your edge doesn't apply that session. Fighting back by taking more trades is how accounts go to zero in one afternoon.",
      },
    ],
    keyFact: "Losers average losers. A trade that goes against you 10 points is not 'due to come back'. Exit at your stop — no exceptions, no moving the stop further away to avoid taking the loss.",
    quiz: {
      question: "Your account is $300. What is the maximum dollar amount you should risk on one MES trade?",
      options: [
        { label: "$100 (33%)", correct: false },
        { label: "$60 (20%)", correct: false },
        { label: "$24 (8%)", correct: true },
        { label: "$300 (all of it)", correct: false },
      ],
      explanation: "8% of $300 = $24 maximum risk per trade. On MES ($5/point), that's a 4–5 point stop. Anything larger and one losing trade takes out too much capital to recover from.",
    },
    action: {
      label: "Check your Risk Rules on the Dashboard",
      href: "/dashboard",
      detail: "Scroll to the very bottom of the Dashboard — there's a Risk Rules section with your daily loss limit and position sizing guidelines.",
    },
  },
  {
    id: "four-pm-rule",
    emoji: "⏰",
    title: "The 4 PM Rule: Never Hold Overnight",
    subtitle: "The single rule that will save your $300 account",
    content: [
      {
        heading: "Why overnight is dangerous for small accounts",
        body: "When the regular market closes at 4 PM ET, brokers switch from intraday margin to overnight margin. For 1 MES contract, intraday margin is ~$50–100. Overnight margin jumps to ~$500–650. With $300 in your account, your broker will immediately close your position and may issue a margin call that puts your account negative.",
      },
      {
        heading: "How a margin call works",
        body: "If your account doesn't have enough money to cover overnight margin, your broker automatically sells your position at market price — not a good price, whatever's available. This often happens right as the market closes when spreads are wide, meaning you get an especially bad fill. Your $300 could become $200 or less from a single overnight hold.",
      },
      {
        heading: "The exact rule",
        body: "Every trading day, set a phone alarm for 3:45 PM ET. When it goes off, close all futures positions — profit or loss, no exceptions. If you're up $80 — close it. If you're down $15 — close it. The rule applies regardless of how strong your conviction is about tomorrow.",
      },
      {
        heading: "What about overnight news?",
        body: "A company might report earnings after hours, or a central bank might make an announcement. If you're in a futures position, these events move the price while you're asleep — and you have no stop loss protecting you once your overnight margin forces the position closed. This is not a theoretical risk. It happens regularly.",
      },
    ],
    keyFact: "Pre-market and after-hours futures moves of 30–50 points are common on earnings or news events. A 30-point move on 1 MES = $150. On a $300 account, that's losing half your money while you sleep.",
    quiz: {
      question: "It's 3:55 PM ET and your MES trade is up $40. What do you do?",
      options: [
        { label: "Hold overnight since it's going well — it might make $100 tomorrow", correct: false },
        { label: "Close the position now and take the $40 profit", correct: true },
        { label: "Move your stop to breakeven and let it run", correct: false },
        { label: "Buy another contract to double your overnight position", correct: false },
      ],
      explanation: "Close it and take the $40. Overnight margin will either force-close you at a bad price or you'll wake up to a $150 loss from an overnight news event. $40 profit is real money. Overnight hope is not.",
    },
    action: {
      label: "Set a reminder on your phone right now",
      href: "/dashboard",
      detail: "Before your first live futures trade, set a recurring daily weekday alarm at 3:45 PM ET labelled 'CLOSE FUTURES'. This is more important than any signal or strategy.",
    },
  },
  {
    id: "your-first-trade",
    emoji: "🚀",
    title: "Your First Trade Plan",
    subtitle: "A complete checklist for your first real MES trade",
    content: [
      {
        heading: "Pre-trade checklist (do this before every trade)",
        body: "☑ Is it between 9:30–10:30 AM ET (NY Kill Zone)? ☑ Does Traxora show High confidence BUY or SELL on ES? ☑ Did I check the full trade plan — Entry Zone, Stop, Target? ☑ Is the stop within 5 points of entry (max $25 risk)? ☑ Is the target at least 2× the stop distance (2:1 R:R)? ☑ Is my 4 PM alarm set? ☑ Am I trading only 1 MES contract? If any answer is NO — do not enter.",
      },
      {
        heading: "During the trade",
        body: "After entry: stop loss order placed ✓. Now: do nothing. No checking every 30 seconds. No moving the stop. Set an alert on your broker at the target price, then close the app or look at something else. Most bad decisions happen while staring at an open position. The trade plan was made with a clear head — trust it.",
      },
      {
        heading: "After the trade closes",
        body: "Win or loss — log it in the Traxora journal. Note: the signal that triggered it, entry price, exit price, P&L, and one honest sentence about what you did well or what you'll do differently. After 20 trades, request an AI journal review. That review will tell you more about your trading than any YouTube video.",
      },
      {
        heading: "The realistic first-month expectation",
        body: "Your first month will likely be breakeven or slightly negative. That's normal and expected. The goal of month 1 is not profit — it's following the checklist without breaking a rule. Consistency in process comes before consistency in profit. Every professional trader had a losing first month.",
      },
    ],
    keyFact: "You can now paper trade any futures signal on the Traxora Intelligence page without risking real money. Practice the full process — signal → trade plan → entry → stop → exit — at least 20 times before using real money.",
    quiz: {
      question: "You're ready to enter MES but the stop distance is 12 points ($60 risk). Your account is $300. What do you do?",
      options: [
        { label: "Enter anyway — the signal looks very strong", correct: false },
        { label: "Enter with 2 contracts to average down if it goes wrong", correct: false },
        { label: "Skip this trade — $60 risk is 20% of your account, too large", correct: true },
        { label: "Use a market order to get in faster", correct: false },
      ],
      explanation: "$60 risk is 20% of your $300 account — way above the 8% ($24) maximum. No matter how strong the signal looks, if the stop distance doesn't fit your risk rules, you skip the trade. The next setup will come.",
    },
    action: {
      label: "Start your first paper futures trade",
      href: "/intelligence?section=futures",
      detail: "Open Intelligence → Futures tab. Find a BUY or SELL signal. Click through to the trade plan. Practice the full entry on the paper trading page. No real money needed.",
    },
  },
];

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">
          Step {current} of {total}
        </span>
        <span className="text-[10px] font-mono text-[#4B5675]">{pct}% complete</span>
      </div>
      <div className="h-1.5 bg-[#1A1838] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Quiz({
  quiz,
  passed,
  onPass,
}: {
  quiz: NonNullable<Step["quiz"]>;
  passed: boolean;
  onPass: () => void;
}) {
  // Already-passed quizzes render in their solved state when you navigate back
  const [selected, setSelected] = useState<number | null>(() => passed ? quiz.options.findIndex(o => o.correct) : null);
  const [revealed, setRevealed] = useState(passed);

  function choose(idx: number) {
    if (revealed) return;
    setSelected(idx);
  }

  function check() {
    if (selected === null) return;
    setRevealed(true);
    if (quiz.options[selected].correct) {
      setTimeout(onPass, 600);
    }
  }

  function retry() {
    setSelected(null);
    setRevealed(false);
  }

  const isCorrect = revealed && selected !== null && quiz.options[selected].correct;
  const isWrong = revealed && selected !== null && !quiz.options[selected].correct;

  return (
    <div className="mt-6 border border-violet-500/20 bg-violet-500/5 rounded-2xl p-5">
      <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest mb-3">Quick Check</p>
      <p className="text-sm font-semibold text-[#F1F5F9] mb-4 leading-snug">{quiz.question}</p>

      <div className="space-y-2 mb-4">
        {quiz.options.map((opt, i) => {
          let cls = "border border-[#252345] bg-[#13112A] text-[#7B8DB4]";
          if (selected === i && !revealed) cls = "border border-violet-400 bg-violet-500/10 text-[#F1F5F9]";
          if (revealed && opt.correct) cls = "border border-emerald-500 bg-emerald-500/10 text-emerald-300";
          if (revealed && selected === i && !opt.correct) cls = "border border-rose-500 bg-rose-500/10 text-rose-300";
          return (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${cls}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {!revealed && (
        <button
          type="button"
          onClick={check}
          disabled={selected === null}
          className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-30 hover:bg-violet-500 transition-colors"
        >
          Check Answer
        </button>
      )}

      {revealed && (
        <div className={`rounded-xl p-4 ${isCorrect ? "bg-emerald-500/10 border border-emerald-500/25" : "bg-rose-500/10 border border-rose-500/25"}`}>
          <p className={`text-xs font-bold mb-1 ${isCorrect ? "text-emerald-400" : "text-rose-400"}`}>
            {isCorrect ? "Correct!" : "Not quite —"}
          </p>
          <p className="text-xs text-[#7B8DB4] leading-relaxed">{quiz.explanation}</p>
          {isWrong && (
            <div className="mt-3 flex items-center gap-4">
              <button
                type="button"
                onClick={retry}
                className="text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors"
              >
                Try again →
              </button>
              <button
                type="button"
                onClick={onPass}
                className="text-xs font-semibold text-[#7B8DB4] hover:text-[#F1F5F9] transition-colors"
              >
                Got it — continue anyway →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FuturesTutorialPage() {
  const [stepIdx, setStepIdx] = useState(0);
  const [quizPassed, setQuizPassed] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      if (saved.stepIdx != null) setStepIdx(Math.min(saved.stepIdx, STEPS.length - 1));
      if (saved.quizPassed) setQuizPassed(saved.quizPassed);
      if (saved.completed) setCompleted(saved.completed);
    } catch { /* ignore */ }
  }, []);

  function save(idx: number, qp: Record<string, boolean>, done: boolean) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ stepIdx: idx, quizPassed: qp, completed: done }));
    } catch { /* ignore */ }
  }

  const step = STEPS[stepIdx];
  const hasQuiz = !!step.quiz;
  const thisPassed = !hasQuiz || quizPassed[step.id];
  const canGoNext = thisPassed;

  function next() {
    if (!canGoNext) return;
    if (stepIdx === STEPS.length - 1) {
      setCompleted(true);
      save(stepIdx, quizPassed, true);
    } else {
      const next = stepIdx + 1;
      setStepIdx(next);
      save(next, quizPassed, false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function prev() {
    if (stepIdx === 0) return;
    const prev = stepIdx - 1;
    setStepIdx(prev);
    save(prev, quizPassed, false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function markPassed(id: string) {
    const qp = { ...quizPassed, [id]: true };
    setQuizPassed(qp);
    save(stepIdx, qp, false);
  }

  function restart() {
    setStepIdx(0);
    setQuizPassed({});
    setCompleted(false);
    save(0, {}, false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (completed) {
    return (
      <div className="min-h-screen text-[#F1F5F9]">
        <Topbar />
        <main className="app-ambient p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
          <div className="max-w-2xl mx-auto w-full mt-8 text-center">
            <div className="text-6xl mb-6">🎓</div>
            <h1 className="text-3xl font-black tracking-tight text-gradient-green mb-3">
              Tutorial Complete!
            </h1>
            <p className="text-[#7B8DB4] text-sm leading-relaxed mb-8 max-w-md mx-auto">
              You now understand futures contracts, leverage, micro contracts, reading signals,
              entering trades, risk management, and the 4 PM rule. That&apos;s more than most people
              know when they start.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 text-left">
              {[
                { icon: "📊", title: "See live futures signals", href: "/dashboard", desc: "Dashboard → scroll to Futures section" },
                { icon: "🔬", title: "Deep analysis any futures", href: "/intelligence?section=futures", desc: "Intelligence → Futures tab" },
                { icon: "📈", title: "Paper trade to practice", href: "/paper", desc: "Paper Trading → log a futures position" },
                { icon: "📖", title: "Full futures guide", href: "/guide", desc: "Guide → Futures Beginner's Guide" },
              ].map(a => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex gap-3 items-start bg-[#13112A] border border-[#252345] hover:border-violet-500/30 rounded-2xl p-4 transition-colors"
                >
                  <span className="text-xl shrink-0">{a.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-[#F1F5F9]">{a.title}</p>
                    <p className="text-[11px] text-[#4B5675] mt-0.5">{a.desc}</p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-5 mb-6 text-left">
              <p className="text-xs font-bold text-amber-400 mb-2">Your next 3 steps</p>
              {[
                "Practice 20 trades on the Paper Trading page using real Traxora signals — no real money yet.",
                "Open a Tastytrade account and deposit $300. Search MES. Do not place a trade yet.",
                "On your first real trading day: wait for a High confidence ES signal between 9:30–10:30 AM ET. Buy 1 MES. Stop within 5 points. Close by 3:55 PM.",
              ].map((t, i) => (
                <div key={i} className="flex gap-3 items-start mt-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-[11px] text-[#7B8DB4] leading-relaxed">{t}</p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={restart}
              className="text-sm text-[#4B5675] hover:text-[#7B8DB4] transition-colors"
            >
              Restart tutorial from the beginning →
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[#F1F5F9]">
      <Topbar />
      <main className="app-ambient p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
        <div className="max-w-2xl mx-auto w-full">

          {/* Header */}
          <div className="mt-6 mb-5">
            <Link href="/guide" className="text-[10px] text-[#4B5675] hover:text-[#7B8DB4] transition-colors">
              ← Back to Guide
            </Link>
            <h1 className="text-2xl font-black tracking-tight mt-3 mb-1">
              Futures Trading Tutorial
            </h1>
            <p className="text-[11px] text-[#4B5675]">
              Interactive guide — answer each quiz to unlock the next step
            </p>
          </div>

          {/* Progress */}
          <ProgressBar current={stepIdx + 1} total={STEPS.length} />

          {/* Step dots */}
          <div className="flex items-center gap-1.5 mt-3 mb-6">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i < stepIdx ? "bg-violet-500 flex-1" :
                  i === stepIdx ? "bg-violet-400 flex-[2]" :
                  "bg-[#252345] flex-1"
                }`}
              />
            ))}
          </div>

          {/* Step card */}
          <div className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
            {/* Step header */}
            <div className="bg-violet-500/8 border-b border-violet-500/15 px-6 py-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{step.emoji}</span>
                <div>
                  <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest">
                    Step {stepIdx + 1} — {step.subtitle}
                  </p>
                  <h2 className="text-lg font-black text-[#F1F5F9] leading-tight">{step.title}</h2>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-5">
              {step.content.map((c, i) => (
                <div key={i}>
                  <p className="text-xs font-bold text-[#F1F5F9] mb-1.5">{c.heading}</p>
                  <p className="text-sm text-[#7B8DB4] leading-relaxed">{c.body}</p>
                </div>
              ))}

              {/* Key fact */}
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
                <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1.5">Key Fact</p>
                <p className="text-xs text-amber-200/80 leading-relaxed">{step.keyFact}</p>
              </div>

              {/* Quiz */}
              {step.quiz && (
                <Quiz
                  key={step.id}
                  quiz={step.quiz}
                  passed={!!quizPassed[step.id]}
                  onPass={() => markPassed(step.id)}
                />
              )}

              {/* Action CTA */}
              {step.action && (
                <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl px-4 py-3">
                  <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Practice it now</p>
                  <p className="text-xs text-[#7B8DB4] mb-3 leading-snug">{step.action.detail}</p>
                  <Link
                    href={step.action.href}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {step.action.label} →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4 gap-3">
            <button
              type="button"
              onClick={prev}
              disabled={stepIdx === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#252345] text-sm text-[#4B5675] hover:text-[#F1F5F9] hover:border-[#333368] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>

            <button
              type="button"
              onClick={next}
              disabled={!canGoNext}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                canGoNext
                  ? "bg-violet-600 hover:bg-violet-500 text-white"
                  : "bg-[#1A1838] text-[#333368] cursor-not-allowed border border-[#252345]"
              }`}
            >
              {!canGoNext
                ? "Answer the quiz to continue"
                : stepIdx === STEPS.length - 1
                ? "Complete Tutorial 🎓"
                : `Next: ${STEPS[stepIdx + 1].title} →`}
            </button>
          </div>

          {/* Skip quiz note */}
          {hasQuiz && !thisPassed && (
            <p className="text-center text-[10px] text-[#333368] mt-3">
              Answer the quick check to continue — a wrong answer shows the explanation and still lets you move on
            </p>
          )}

        </div>
      </main>
    </div>
  );
}
