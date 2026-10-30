// The options practice account, kept on the device.
//
// Separate from the stock practice account rather than sharing its cash. The
// two teach different things and mixing them would make either one's result
// impossible to read — and it keeps this entirely clear of the stock paper
// trading that already works.
//
// Ten thousand rather than the stock account's hundred: options are leveraged,
// and on a smaller balance a position that loses its whole premium registers
// as the event it is instead of a rounding error.

import type { OptionPosition } from "./optionsPaper";

export const OPTIONS_PAPER_KEY = "traxora_options_paper_v1";
export const OPTIONS_START = 10_000;

export type OptionsAccount = {
  /** What the account began with, so results stay readable after a reset. */
  start: number;
  cash: number;
  positions: OptionPosition[];
};

const empty = (start = OPTIONS_START): OptionsAccount => ({ start, cash: start, positions: [] });

/**
 * Read the account.
 *
 * Storage can throw outright in a private window or with site data blocked, and
 * can return something that is not an account at all if a previous version
 * wrote a different shape. Both end up as a fresh account rather than an
 * exception thrown during render.
 */
export function loadOptionsAccount(): OptionsAccount {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(OPTIONS_PAPER_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<OptionsAccount>;
    if (typeof parsed?.cash !== "number" || !Array.isArray(parsed.positions)) return empty();
    return {
      start: typeof parsed.start === "number" ? parsed.start : OPTIONS_START,
      cash: parsed.cash,
      positions: parsed.positions as OptionPosition[],
    };
  } catch {
    return empty();
  }
}

/** Returns whether the write actually landed, so the UI can say if it did not. */
export function saveOptionsAccount(account: OptionsAccount): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(OPTIONS_PAPER_KEY, JSON.stringify(account));
    return true;
  } catch {
    return false;
  }
}

export function resetOptionsAccount(start = OPTIONS_START): OptionsAccount {
  const fresh = empty(start);
  saveOptionsAccount(fresh);
  return fresh;
}
