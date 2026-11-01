/**
 * Keep anything key-shaped out of a message that will be displayed.
 *
 * Provider errors quote the request back, and a long opaque token in one is
 * almost certainly a credential. This runs over the attempt list before the
 * owner ever sees it: a diagnostic that leaks the thing it is diagnosing is
 * worse than no diagnostic.
 *
 * Its own file so it can be tested — the route next to it imports next-auth,
 * which a test cannot load.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/(key|token|secret|authorization|bearer)([=:\s"']+)[A-Za-z0-9_\-.]{12,}/gi, "$1$2[redacted]")
    .replace(/\b(sk|gsk|AIza)[A-Za-z0-9_\-]{16,}\b/g, "[redacted]");
}
