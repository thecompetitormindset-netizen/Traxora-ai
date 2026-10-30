"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

// Reading something only the browser knows, during the first client render.
//
// The server has no localStorage, no user agent to sniff and no clock in the
// reader's timezone, so component after component did the same thing: render a
// placeholder, then correct it in an effect once mounted. That costs a second
// render, shows the placeholder first, and is what the React compiler objects
// to — the same shape restated across two dozen files.
//
// useSyncExternalStore is what React provides for precisely this. The client
// reads its own snapshot immediately and the server reads a separate one, so
// the value is right on the first client paint and hydration still matches.
//
// The catch is that the snapshot must be STABLE: React calls it repeatedly and
// compares by identity, so a reader returning a fresh object every time would
// spin forever. Hence the cache below — the previous value is handed back
// whenever the new one is equivalent to it.

/**
 * Whether two snapshots say the same thing.
 *
 * Identity first, for primitives and for a reader that already caches. Then a
 * structural comparison, because the common case is a reader that parses JSON
 * out of storage and necessarily produces a new object each call.
 */
export function sameSnapshot(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    // Circular or otherwise unserialisable: treat as changed rather than
    // risk reporting two different values as the same one.
    return false;
  }
}

/** Nothing to subscribe to — the value is read once and does not announce changes. */
const noSubscription = () => () => {};

/**
 * A value the browser can answer for and the server cannot.
 *
 * `read` runs only on the client. `serverValue` is what the server renders and
 * what the client's first render must match for hydration to line up — so it
 * should be the honest "we do not know yet" value, not a guess at the answer.
 *
 * `subscribe` is optional: pass one when the underlying value can change (a
 * theme event, a storage event, a timer) and the component should follow it.
 */
export function useClientValue<T>(
  read: () => T,
  serverValue: T,
  subscribe: (onChange: () => void) => () => void = noSubscription,
): T {
  const cached = useRef<{ value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    let next: T;
    try {
      next = read();
    } catch {
      // Storage throws outright in a private window or with site data blocked.
      // Falling back keeps the component rendering instead of taking the tree
      // down over a value it only wanted as an improvement.
      return cached.current ? cached.current.value : serverValue;
    }
    if (cached.current && sameSnapshot(cached.current.value, next)) return cached.current.value;
    cached.current = { value: next };
    return next;
  }, [read, serverValue]);

  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Subscribe to a window event, for values that announce their own changes. */
export function windowEvent(...names: string[]) {
  return (onChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    for (const n of names) window.addEventListener(n, onChange);
    return () => { for (const n of names) window.removeEventListener(n, onChange); };
  };
}

/** Subscribe to a timer, for values that change on their own schedule. */
export function everyMs(ms: number) {
  return (onChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const id = window.setInterval(onChange, ms);
    return () => window.clearInterval(id);
  };
}
