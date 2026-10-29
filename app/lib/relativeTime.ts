/**
 * "just now", "42s ago", "3 min ago".
 *
 * Pulled out of the landing strip because it is the part that carries meaning
 * rather than markup: a price shown without its age invites the reader to
 * assume it is current, and here it is about fifteen minutes behind. The
 * wording is deliberately coarse — a counter ticking every second next to a
 * delayed price would imply a precision that is not there.
 */
export function agoLabel(fromMs: number, nowMs: number): string {
  if (!Number.isFinite(fromMs) || !Number.isFinite(nowMs)) return "recently";
  // A clock skew that puts the stamp slightly ahead reads as "just now"
  // rather than a negative age.
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}
