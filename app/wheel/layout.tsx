import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wheeling Hub — Traxora AI",
  description: "Track your wheel strategy positions end-to-end — CSP scan, assignment, covered calls, and live IV data.",
};

export default function WheelLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
