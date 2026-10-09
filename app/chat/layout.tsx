import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ask AI",
  description: "Ask questions about any stock, trading idea or the app.",
  robots: { index: false, follow: false },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
