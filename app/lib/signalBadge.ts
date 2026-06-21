/**
 * Returns Tailwind classes for a BUY/SELL/HOLD signal badge.
 * Pass animated=false for compact secondary contexts (e.g. trade logs, rooms).
 */
export function signalBadgeCls(signal: string | null, animated = true): string {
  if (signal === "BUY")
    return `${animated ? "badge-buy " : ""}bg-emerald-500/10 text-emerald-400 border-emerald-500/20`;
  if (signal === "SELL")
    return `${animated ? "badge-sell " : ""}bg-rose-500/10 text-rose-400 border-rose-500/20`;
  return `${animated ? "badge-hold " : ""}bg-amber-500/10 text-amber-400 border-amber-500/20`;
}
