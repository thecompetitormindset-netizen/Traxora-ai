"use client";

import { useSyncExternalStore } from "react";

// App-page wrapper. Traxora has no paid plans and pages work without signing
// in, so this no longer gates access. It does one thing: render the page in the
// browser only. Many app pages read browser state on their first render
// (localStorage watchlists, notification permission, theme), which would not
// match server-rendered HTML and cause hydration errors. The name is historical.

const subscribe = () => () => {};

export default function PaywallGuard({ children }: { children: React.ReactNode }) {
  // false during server render and hydration, true once running in the browser
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return <div className="min-h-screen" aria-busy="true" />;
  return <>{children}</>;
}
