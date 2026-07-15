import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sports Prediction Track Record",
  description: "How often Traxora's sports predictions have actually been right, broken down by confidence tier and league.",
  robots: { index: false, follow: false },
};

export default function TrackRecordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
