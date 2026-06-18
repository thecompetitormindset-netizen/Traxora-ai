import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Futures Trading for Beginners — Interactive Tutorial",
  description:
    "Learn futures trading from zero with an interactive 8-step tutorial. Covers micro contracts (MES, MNQ), leverage, stop loss rules, how to trade with $300, and how to use Traxora AI's futures signals. Free.",
  keywords: [
    "futures trading for beginners", "how to trade futures", "micro futures tutorial",
    "MES futures trading", "MNQ futures", "futures trading $300",
    "micro e-mini s&p 500", "futures leverage explained", "futures stop loss",
    "learn futures trading", "interactive futures tutorial",
  ],
  alternates: {
    canonical: "https://traxora-ai.vercel.app/futures-tutorial",
  },
  openGraph: {
    title:       "Futures Trading for Beginners — Interactive Tutorial | Traxora AI",
    description: "8-step interactive tutorial with quizzes. Learn micro futures (MES, MNQ), leverage, $300 account rules, and how to use AI signals. Free.",
    url:         "https://traxora-ai.vercel.app/futures-tutorial",
    type:        "article",
  },
};

export default function FuturesTutorialLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to Trade Futures for Beginners with $300",
    "description": "A complete beginner's guide to trading micro futures (MES, MNQ) with a small account. Covers leverage, margin, risk management, and how to use AI signals.",
    "totalTime": "PT30M",
    "step": [
      { "@type": "HowToStep", "name": "Understand Futures Contracts", "text": "Learn what a futures contract is — an agreement to bet on price direction. No actual ownership of assets." },
      { "@type": "HowToStep", "name": "Learn How Leverage Works", "text": "Understand that futures use leverage — MES ($5/point) controls large exposure with small margin." },
      { "@type": "HowToStep", "name": "Choose Micro Contracts for Small Accounts", "text": "Use MES (Micro E-mini S&P 500) instead of standard ES. Requires ~$50 intraday margin vs ~$12,000 for ES." },
      { "@type": "HowToStep", "name": "Read AI Trading Signals", "text": "Use Traxora AI dashboard to find High confidence BUY or SELL signals on ES/NQ futures during NY Kill Zone (9:30–10:30 AM ET)." },
      { "@type": "HowToStep", "name": "Place Your First Trade", "text": "Buy 1 MES contract on Tastytrade within the Entry Zone shown in the trade plan. Immediately place a stop loss order." },
      { "@type": "HowToStep", "name": "Apply $300 Risk Rules", "text": "Never risk more than $24 (8%) per trade. On MES that means a 5-point maximum stop distance." },
      { "@type": "HowToStep", "name": "Close Before 4 PM ET", "text": "Close all futures positions before 4 PM ET every day. Overnight margin on a $300 account causes automatic liquidation." },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
