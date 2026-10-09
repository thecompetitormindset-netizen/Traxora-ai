"use client";

// Historical wrapper kept so existing pages don't need editing. Traxora has no
// paid plans and every page works without signing in, so this renders its
// children directly. Features that need an account (AI tools, sync) ask for
// sign-in where they are used.

export default function PaywallGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
