import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to Use Traxora AI — Smart Money Trading Guide",
  description:
    "Complete step-by-step guide to AI-powered Smart Money trading. Learn Order Blocks, Fair Value Gaps, Liquidity Sweeps, Kill Zones, options analysis, futures signals, and how to use every Traxora AI feature.",
  keywords: [
    "smart money trading guide", "order blocks tutorial", "fair value gap explained",
    "ICT trading guide", "how to trade futures beginners", "AI trading signals guide",
    "kill zones trading", "liquidity sweeps", "market structure trading",
    "how to use Traxora AI",
  ],
  alternates: {
    canonical: "https://traxora-ai.vercel.app/guide",
  },
  openGraph: {
    title:       "Traxora AI Guide — Smart Money Trading Explained",
    description: "Step-by-step guide covering Order Blocks, FVGs, Liquidity, Kill Zones, options analysis, futures signals, and every feature of Traxora AI.",
    url:         "https://traxora-ai.vercel.app/guide",
    type:        "article",
  },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is Smart Money trading?",
        "acceptedAnswer": { "@type": "Answer", "text": "Smart Money trading (also called ICT methodology) is a style of analysis that follows institutional order flow. It uses Order Blocks (zones where institutions buy/sell), Fair Value Gaps (price imbalances), Liquidity Sweeps (stop hunts), and Kill Zones (high-volume session windows) to time entries and exits." },
      },
      {
        "@type": "Question",
        "name": "What is an Order Block?",
        "acceptedAnswer": { "@type": "Answer", "text": "An Order Block is the last opposing candle before a strong impulsive price move. For a bullish Order Block, it is the last bearish (red) candle before a sharp upward displacement. Institutions typically re-enter positions when price returns to these zones." },
      },
      {
        "@type": "Question",
        "name": "What is a Fair Value Gap?",
        "acceptedAnswer": { "@type": "Answer", "text": "A Fair Value Gap (FVG) is a 3-candle price imbalance where the high of candle 1 does not overlap with the low of candle 3. This leaves an inefficiency that price tends to revisit and fill. Traxora AI automatically detects and highlights these gaps on every chart." },
      },
      {
        "@type": "Question",
        "name": "What are Kill Zones in trading?",
        "acceptedAnswer": { "@type": "Answer", "text": "Kill Zones are specific time windows when institutional trading volume is highest: London Kill Zone (2:00–5:00 AM ET) and New York Kill Zone (9:30–10:30 AM ET). These windows produce the most reliable directional moves and are when Traxora AI signals have the strongest follow-through." },
      },
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
