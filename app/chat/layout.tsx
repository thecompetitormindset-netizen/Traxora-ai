import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Chat — Traxora AI",
  description: "Chat with Traxora AI about trading strategies, market concepts, options, and more.",
  robots: { index: false, follow: false },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
