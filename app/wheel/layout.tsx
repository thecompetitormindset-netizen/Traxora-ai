import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wheeling Hub",
  description: "Track your wheel strategy positions end-to-end — CSP scan, assignment, covered calls, and live IV data.",
  robots: { index: false, follow: false },
};

export default function WheelLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
