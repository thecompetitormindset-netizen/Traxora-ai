const TTL = 5 * 60 * 1000; // 5 minutes

let _promise: Promise<unknown> | null = null;
let _expiry = 0;

/**
 * Fetches /api/sentiment and caches the result for 5 minutes.
 * Multiple callers on the same page share one network request.
 */
export function fetchSentiment(): Promise<unknown> {
  if (_promise && Date.now() < _expiry) return _promise;
  _expiry = Date.now() + TTL;
  _promise = fetch("/api/sentiment")
    .then(r => r.json())
    .then(d => (d?.error ? null : d))
    .catch(() => null);
  return _promise;
}
