import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
  title: "Traxora AI — AI-Powered Smart Money Trading Signals",
  description:
    "AI trading platform powered by Claude. Get real-time BUY/SELL/HOLD signals, volume profile analysis, options analysis, morning briefings, and a full trade journal. $5/mo.",
  keywords: [
    "AI trading signals", "smart money signals", "order blocks", "fair value gap",
    "volume profile", "market structure", "trading AI", "stock signals", "futures signals",
    "options analysis", "paper trading", "Claude AI trading", "Traxora", "Traxora AI",
  ],
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Traxora AI — Trade Like Smart Money",
    description:
      "AI reads Order Blocks, FVGs, Liquidity, Volume Profile & Market Structure in seconds. Real-time signals for stocks, futures & options. $5/mo.",
    type:   "website",
    locale: "en_US",
    url:    "https://traxora-ai.vercel.app",
    siteName: "Traxora AI",
    images: [{
      url:    "https://traxora-ai.vercel.app/opengraph-image",
      width:  1200,
      height: 630,
      alt:    "Traxora AI — AI-Powered Smart Money Trading Signals",
    }],
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Traxora AI — Smart Money Trading Platform",
    description: "AI-powered BUY/SELL/HOLD signals with volume profile analysis, options flow, morning briefings, and trade journal. $5/mo.",
    images:      ["https://traxora-ai.vercel.app/opengraph-image"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Traxora AI",
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
      <body>
        {/* Theme script runs before paint to prevent flash — suppressHydrationWarning because localStorage isn't available on server */}
        <script
          suppressHydrationWarning
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('traxora-theme');if(t==='dark'||t==='light'||t==='midnight')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
        <ThemeProvider />
        {/* Fixed universe background — behind all content */}
        <CosmicBackground />
        {/* All page content sits above the cosmic layer */}
        <div className="relative z-10">
          <Providers>
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
        <SpeedInsights />
        <CookieBanner />
      </body>
    </html>
  );
}
