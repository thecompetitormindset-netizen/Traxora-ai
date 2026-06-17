import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Futures Tutorial — Learn to Trade Futures | Traxora AI",
  description: "Interactive step-by-step futures trading tutorial. Learn micro contracts, risk management, and how to use Traxora AI's futures signals with a $300 account.",
};

export default function FuturesTutorialLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
