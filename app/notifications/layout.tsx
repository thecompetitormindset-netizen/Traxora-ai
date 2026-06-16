import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications — Traxora AI",
  description: "Your signal alerts, price alerts, and system notifications.",
};

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
