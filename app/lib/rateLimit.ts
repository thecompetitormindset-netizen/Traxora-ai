// Simple sliding-window rate limiter stored in process memory.
// Works per serverless instance — good enough to stop runaway loops
// from a single logged-in user. For global limits across all instances
// upgrade to Upstash Redis (@upstash/ratelimit).

const store = new Map<string, number[]>();

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param key        Unique key per user+action, e.g. "ict:user@email.com"
 * @param maxCalls   Max requests allowed in the window
 * @param windowMs   Rolling window size in milliseconds
 */
export function checkRateLimit(key: string, maxCalls: number, windowMs: number): boolean {
  const now       = Date.now();
  const history   = store.get(key) ?? [];
  const recent    = history.filter(t => now - t < windowMs);

  if (recent.length >= maxCalls) return false;

  recent.push(now);
  store.set(key, recent);
  return true;
}
