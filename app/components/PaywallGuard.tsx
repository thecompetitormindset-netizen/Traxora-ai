"use client";

// Open access: every feature is free and no sign-in is required.
// Kept as a passthrough so existing pages don't need to change.
export default function PaywallGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
