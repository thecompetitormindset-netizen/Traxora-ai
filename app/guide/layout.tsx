import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guide",
  description:
    "Free guide: learn Order Blocks, Fair Value Gaps, Liquidity Sweeps, Kill Zones & how to read AI trading signals. Covers stocks, futures & options for all levels.",
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
    description: "How Traxora works, in plain words: signals, options, practice trading and every page.",
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

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://traxora-ai.vercel.app" },
      { "@type": "ListItem", "position": 2, "name": "Trading Guide", "item": "https://traxora-ai.vercel.app/guide" },
    ],
  };

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "How to Trade with Smart Money Signals — Complete Guide",
    "description": "Learn Order Blocks, Fair Value Gaps, Liquidity Sweeps, Kill Zones, and how to use AI trading signals. Free step-by-step guide for all levels.",
    "url": "https://traxora-ai.vercel.app/guide",
    "image": "https://traxora-ai.vercel.app/icon-192.png",
    "author": { "@type": "Organization", "name": "Traxora AI" },
    "publisher": {
      "@type": "Organization",
      "name": "Traxora AI",
      "logo": { "@type": "ImageObject", "url": "https://traxora-ai.vercel.app/icon-192.png" },
    },
    "datePublished": "2026-06-01",
    "dateModified": new Date().toISOString().split("T")[0],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }} />
      {children}
    </>
  );
}
