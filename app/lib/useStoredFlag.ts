"use client";

import { useCallback, useSyncExternalStore } from "react";

// Reading a value out of localStorage during the first render.
//
// The server has no localStorage, so every component that needed one did the
// same thing: render a default, then set state in an effect once mounted. That
// works, but it costs a second render, it flashes the default first, and the
// React compiler flags each one — the same pattern restated in a dozen files.
//
// useSyncExternalStore is what React provides for exactly this: a snapshot the
// client reads directly and a separate one for the server, so the value is
// right on the first client render and hydration still matches.

const subscribe = (onChange: () => void) => {
  // Changes made in ANOTHER tab arrive as a storage event. Changes made in this
  // one are published by writeFlag below, because the storage event does not
  // fire in the tab that caused it.
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener("traxora:stored-flag", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("traxora:stored-flag", onChange);
  };
};

/**
 * Whether `key` has a stored value.
 *
 * Storage throws outright in a private window or with site data blocked, so a
 * failed read is reported as "not set" rather than taking the render down.
 */
export function useStoredFlag(key: string): boolean {
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }, [key]);

  // The server cannot know, and must agree with the first client render for
  // hydration to match — so both start from "not set".
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Write a flag and tell this tab's subscribers, which `storage` does not. */
export function writeStoredFlag(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
    window.dispatchEvent(new Event("traxora:stored-flag"));
  } catch {
    // Nothing to do: the caller's UI already reflects the choice, it just will
    // not survive a reload. Failing loudly here would be worse.
  }
}
