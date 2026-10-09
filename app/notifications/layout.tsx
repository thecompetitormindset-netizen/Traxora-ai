import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Alerts",
  description: "Your signal and price alerts.",
  robots: { index: false, follow: false },
};

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
