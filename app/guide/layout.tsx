import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guide — How to Use Traxora AI",
  description: "Step-by-step guide for using Traxora AI's signals, market scanner, options analysis, morning briefings, and trade journal. Learn Smart Money trading concepts.",
  openGraph: {
    title: "Traxora AI Guide — Learn Smart Money Trading",
    description: "Complete guide to using Traxora AI: signals, scanner, options, morning briefings, and how Smart Money methodology works.",
  },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
