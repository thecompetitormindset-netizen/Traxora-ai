import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
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

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Traxora AI — Smart Money Signals Powered by Claude Opus 4.7",
  description:
    "Free AI trading signal platform. Analyzes Order Blocks, Fair Value Gaps, Liquidity sweeps & Market Structure using institutional smart money methodology. Paper trading simulator + Alpaca broker integration.",
  keywords: [
    "AI trading signals", "smart money signals", "order blocks", "fair value gap",
    "market structure shift", "trading AI", "stock signals", "futures signals",
    "paper trading", "Claude AI trading", "Traxora", "Traxora AI",
  ],
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Traxora AI — Trade Like Smart Money",
    description:
      "AI reads Order Blocks, FVGs, Liquidity & Market Structure in seconds. Free smart money signals for stocks & futures. Paper trade then go live.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Traxora AI — Free Smart Money Signal Platform",
    description:
      "AI-powered BUY/SELL/HOLD signals using institutional Smart Money concepts. Free, no subscription. Paper trading + Alpaca broker.",
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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      {/* Inject theme before first paint to prevent flash */}
      <head>
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('traxora-theme');if(t==='dark'||t==='light'||t==='midnight')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider />
        {/* Fixed universe background — behind all content */}
        <CosmicBackground />
        {/* All page content sits above the cosmic layer */}
        <div className="relative z-10">
          <Providers>
            <SessionWatcher />
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
      </body>
    </html>
  );
}
