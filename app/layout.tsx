import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import Providers from "./providers";
import CookieBanner from "./components/CookieBanner";
import WelcomeModal from "./components/WelcomeModal";
import AIChatWidget from "./components/AIChatWidget";
import ServiceWorkerRegistrar from "./components/ServiceWorkerRegistrar";
import CosmicBackground from "./components/CosmicBackground";
import AutoJournal from "./components/AutoJournal";
import MorningBriefing from "./components/MorningBriefing";
import RiskGuard from "./components/RiskGuard";
import AutoScanner from "./components/AutoScanner";
import AutoCoach from "./components/AutoCoach";
import ThemeProvider from "./components/ThemeProvider";
import SessionWatcher from "./components/SessionWatcher";
import SignalToast from "./components/SignalToast";
import PortfolioSync from "./components/PortfolioSync";
import AnimationProvider from "./components/AnimationProvider";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono-custom",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://traxora-ai.vercel.app"),
  title: {
    default:  "Traxora AI — Know Exactly When to Buy & Sell Stocks",
    template: "%s | Traxora AI",
  },
  description:
    "AI scans the market and fires clear BUY/SELL signals using Smart Money analysis. Order Blocks, FVGs, options plays & daily briefings. 500+ traders. From $5/mo.",
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
    title:       "Traxora AI — Know Exactly When to Buy & Sell",
    description: "AI fires clear BUY/SELL signals using Smart Money patterns. Order Blocks, FVGs, options plays & daily briefings. 500+ traders trust it. $5/mo.",
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
    description: "AI-powered BUY/SELL/HOLD signals. Order Blocks, FVGs, Liquidity sweeps, options plays, morning briefings & AI trade journal. $5/mo.",
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
    <html lang="en" className={`${jakarta.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Declarative SW registration — detected by PWABuilder without JS execution */}
        <link rel="serviceworker" href="/sw.js" scope="/" />
      </head>
      <body>
        {/* Theme script runs before paint to prevent flash */}
        <script
          suppressHydrationWarning
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('traxora-theme');if(t==='dark'||t==='light'||t==='midnight')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js');`,
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
                    "price": "5.00",
                    "priceCurrency": "USD",
                    "availability": "https://schema.org/InStock",
                    "priceValidUntil": "2027-12-31",
                    "description": "Pro plan — full access, cancel anytime",
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
                      "acceptedAnswer": { "@type": "Answer", "text": "Traxora AI is an AI-powered trading signal app that gives you clear BUY, SELL, or HOLD signals in real time. It uses Smart Money methodology — Order Blocks, Fair Value Gaps, and Liquidity Sweeps — to tell you exactly where to enter, where to set your stop loss, and where price is headed. It covers stocks, futures, and options. Plans start at $5/month." },
                    },
                    {
                      "@type": "Question",
                      "name": "How do I know when to buy or sell a stock?",
                      "acceptedAnswer": { "@type": "Answer", "text": "Traxora AI scans 50+ tickers every morning and fires a clear BUY or SELL signal when institutional Smart Money patterns align — Order Blocks, Fair Value Gaps, volume spikes, and market structure all in agreement. You get the exact entry price, stop loss level, and profit target. No guessing required." },
                    },
                    {
                      "@type": "Question",
                      "name": "How much does Traxora AI cost?",
                      "acceptedAnswer": { "@type": "Answer", "text": "Traxora AI Pro costs $5 per month — less than a coffee. It includes real-time BUY/SELL signals, Smart Money analysis, options plays, a daily AI morning briefing at 8:30am ET, and an AI-powered trade journal. Cancel anytime, no contracts." },
                    },
                    {
                      "@type": "Question",
                      "name": "Can beginners use Traxora AI?",
                      "acceptedAnswer": { "@type": "Answer", "text": "Yes. Traxora AI is built for all experience levels. The dashboard gives plain-English explanations of every signal. There is also a free interactive futures tutorial that teaches you how to trade micro futures with as little as $300, step by step." },
                    },
                  ],
                },
              ],
            }),
          }}
        />
        <ThemeProvider />
        {/* Fixed universe background — behind all content */}
        <CosmicBackground />
        {/* All page content sits above the cosmic layer */}
        <div className="relative z-10">
          <Providers>
            <AnimationProvider />
            <SessionWatcher />
            <WelcomeModal />
            {children}
            <AIChatWidget />
            <AutoScanner />
            <AutoJournal />
            <MorningBriefing />
            <RiskGuard />
            <AutoCoach />
            <SignalToast />
            <PortfolioSync />
          </Providers>
          <ServiceWorkerRegistrar />
        </div>
        <Analytics />
        <CookieBanner />
      </body>
    </html>
  );
}
