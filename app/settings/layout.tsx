import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings — Traxora AI",
  description: "Manage your Traxora AI account, subscription, notifications, and theme preferences.",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
