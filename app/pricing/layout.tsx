import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Full AI Trading Signals for $5/mo",
  description:
    "Get unlimited BUY/SELL signals, Smart Money analysis, options plays & daily AI briefings for $5/mo. 80–90% cheaper than competitors. Cancel anytime, no contracts.",
  keywords: [
    "AI trading signals price", "cheap trading signals", "smart money signals subscription",
    "affordable trading platform", "Traxora AI pricing", "trading signals monthly",
  ],
  alternates: {
    canonical: "https://traxora-ai.vercel.app/pricing",
  },
  openGraph: {
    title:       "Traxora AI Pricing — $5/mo for Full AI Trading Signals",
    description: "Smart Money signals, Order Blocks, FVGs, options analysis, morning briefings, and AI trade journal. $5/mo vs $29–$118 elsewhere. Cancel anytime.",
    url:         "https://traxora-ai.vercel.app/pricing",
    type:        "website",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://traxora-ai.vercel.app" },
          { "@type": "ListItem", "position": 2, "name": "Pricing", "item": "https://traxora-ai.vercel.app/pricing" },
        ],
      },
      {
        "@type": "Product",
        "name": "Traxora AI Pro",
        "description": "AI-powered Smart Money trading signals. Real-time BUY/SELL/HOLD signals, Order Block analysis, Fair Value Gap detection, options plays, daily morning briefings, and AI trade journal.",
        "brand": { "@type": "Brand", "name": "Traxora AI" },
        "url": "https://traxora-ai.vercel.app/pricing",
        "image": "https://traxora-ai.vercel.app/icon-192.png",
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.8",
          "reviewCount": "127",
          "bestRating": "5",
        },
        "offers": {
          "@type": "Offer",
          "price": "5.00",
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
          "priceValidUntil": "2027-12-31",
          "url": "https://traxora-ai.vercel.app/pricing",
          "seller": { "@type": "Organization", "name": "Traxora AI" },
        },
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
