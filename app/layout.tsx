import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import AIChatWidget from "./components/AIChatWidget";
import ServiceWorkerRegistrar from "./components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "Kairos TradePilot AI",
  description: "AI-powered investment signals — stocks, futures & commodities",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kairos AI",
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
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <AIChatWidget />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
