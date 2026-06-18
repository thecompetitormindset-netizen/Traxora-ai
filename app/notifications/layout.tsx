import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Your signal alerts, price alerts, and system notifications.",
  robots: { index: false, follow: false },
};

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
