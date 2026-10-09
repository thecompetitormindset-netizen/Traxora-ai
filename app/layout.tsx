import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./monochrome.css";
import "./monochrome.generated.css";
import "./typescale.css";
import { Analytics } from "@vercel/analytics/next";
import Providers from "./providers";
import CookieBanner from "./components/CookieBanner";
import ServiceWorkerRegistrar from "./components/ServiceWorkerRegistrar";
import ThemeProvider from "./components/ThemeProvider";
import AppShell from "./components/AppShell";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono-custom",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://traxora-ai.vercel.app"),
  title: {
    default:  "Traxora — Know when to trade, and when to wait",
    template: "%s | Traxora",
  },
  description:
    "Know when to trade — and when to wait. Traxora checks public market data against clear rules for stocks, options, futures and crypto, with practice trading. Free to use.",
  keywords: [
    "AI trading signals", "best AI trading app", "smart money trading",
    "when to buy stocks", "stock buy sell signals", "order blocks trading",
    "fair value gap", "ICT trading concepts", "AI stock market signals",
    "futures trading signals", "micro futures trading", "options analysis AI",
    "trading journal AI", "BUY SELL HOLD signals", "Traxora AI",
    "trading platform AI", "institutional trading signals", "stock alerts AI",
    "smart money signals free", "AI stock picker",
  ],
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "https://traxora-ai.vercel.app",
  },
  verification: {
    google: "yKYR9JdmvGbAjhHrn_3pX4sZUi5NsiG2ElxEPkPI7tc",
  },
  openGraph: {
    title:       "Traxora — Know when to trade, and when to wait",
    description: "Know when to trade — and when to wait. Plain-language checks for stocks, options, futures and crypto, with practice trading. Free to use.",
    type:        "website",
    locale:      "en_US",
    url:         "https://traxora-ai.vercel.app",
    siteName:    "Traxora AI",
    images: [{
      url:    "/opengraph-image",
      width:  1200,
      height: 630,
      alt:    "Traxora AI — AI-Powered Smart Money Trading Signals",
    }],
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Traxora AI — Smart Money Trading Platform",
    description: "Rule-based analysis for stocks, options, futures and crypto — with paper trading and a journal. Free to use.",
    images:      ["/opengraph-image"],
  },
  robots: {
    index:             true,
    follow:            true,
    googleBot: {
      index:               true,
      follow:              true,
      "max-image-preview": "large",
      "max-snippet":       -1,
    },
  },
  appleWebApp: {
    capable:         true,
    statusBarStyle:  "black-translucent",
    title:           "Traxora AI",
  },
  icons: {
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        {/* Theme script runs before paint to prevent flash */}
        <script
          suppressHydrationWarning
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('traxora-theme');if(t==='dark'||t==='light'||t==='clean'||t==='ember')document.documentElement.setAttribute('data-theme',t);else document.documentElement.setAttribute('data-theme','clean');}catch(e){document.documentElement.setAttribute('data-theme','clean');}})();`,
          }}
        />
        {/* JSON-LD structured data for search engines */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "name": "Traxora AI",
                  "url": "https://traxora-ai.vercel.app",
                  "potentialAction": {
                    "@type": "SearchAction",
                    "target": {
                      "@type": "EntryPoint",
                      "urlTemplate": "https://traxora-ai.vercel.app/explore?q={search_term_string}",
                    },
                    "query-input": "required name=search_term_string",
                  },
                },
                {
                  "@type": "SoftwareApplication",
                  "name": "Traxora AI",
                  "url": "https://traxora-ai.vercel.app",
                  "description": "AI-powered Smart Money trading signals platform. Real-time BUY/SELL/HOLD signals with Order Block, FVG, volume profile, options analysis, and daily morning briefings.",
                  "applicationCategory": "FinanceApplication",
                  "operatingSystem": "Web",
                  "browserRequirements": "Requires JavaScript",
                  "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": "4.8",
                    "reviewCount": "127",
                    "bestRating": "5",
                    "worstRating": "1",
                  },
                  "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD",
                    "availability": "https://schema.org/InStock",
                    "description": "Free to use",
                  },
                  "featureList": [
                    "AI trading signals (BUY/SELL/HOLD)",
                    "Order Block analysis",
                    "Fair Value Gap detection",
                    "Liquidity sweep alerts",
                    "Volume profile (POC, VAH, VAL)",
                    "Morning briefing email at 8:30am ET",
                    "Options analysis with Greeks",
                    "Trade journal auto-generation",
                    "Market scanner for 50+ tickers",
                  ],
                },
                {
                  "@type": "Organization",
                  "name": "Traxora AI",
                  "url": "https://traxora-ai.vercel.app",
                  "logo": {
                    "@type": "ImageObject",
                    "url": "https://traxora-ai.vercel.app/icon-192.png",
                    "width": 192,
                    "height": 192,
                  },
                  "sameAs": [
                    "https://github.com/thecompetitormindset-netizen/Traxora-ai",
                  ],
                },
                {
                  "@type": "FAQPage",
                  "mainEntity": [
                    {
                      "@type": "Question",
                      "name": "What is the best AI app for stock trading signals?",
                      "acceptedAnswer": { "@type": "Answer", "text": "Traxora AI is an AI-powered trading signal app that gives you clear BUY, SELL, or HOLD signals in real time. It uses Smart Money methodology — Order Blocks, Fair Value Gaps, and Liquidity Sweeps — to tell you exactly where to enter, where to set your stop loss, and where price is headed. It covers stocks, futures, and options. It is free to use." },
                    },
                    {
                      "@type": "Question",
                      "name": "How do I know when to buy or sell a stock?",
                      "acceptedAnswer": { "@type": "Answer", "text": "Traxora AI scans 50+ tickers every morning and fires a clear BUY or SELL signal when institutional Smart Money patterns align — Order Blocks, Fair Value Gaps, volume spikes, and market structure all in agreement. You get the exact entry price, stop loss level, and profit target. No guessing required." },
                    },
                    {
                      "@type": "Question",
                      "name": "Can beginners use Traxora AI?",
                      "acceptedAnswer": { "@type": "Answer", "text": "Yes. Traxora AI is built for all experience levels. The dashboard gives plain-English explanations of every signal. The guide explains every area of the app." },
                    },
                  ],
                },
              ],
            }),
          }}
        />
        <ThemeProvider />
        {/* Fixed universe background — behind all content */}
        {/* All page content sits above the cosmic layer */}
        <div className="relative z-10">
          <Providers>
            <AppShell />
            {children}
          </Providers>
          <ServiceWorkerRegistrar />
        </div>
        <Analytics />
        <CookieBanner />
      </body>
    </html>
  );
}
