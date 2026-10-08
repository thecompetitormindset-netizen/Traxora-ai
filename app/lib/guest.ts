// ── Open access (no sign-in) ──────────────────────────────────────────────────
// Every visitor gets an anonymous guest identity stored in a cookie. The rest
// of the app keeps keying per-user data (watchlist, journal, portfolio, rate
// limits) by `session.user.email`, so each browser still gets its own data —
// without anyone having to sign in.

export const GUEST_COOKIE = "traxora_guest";
export const GUEST_HEADER = "x-traxora-guest";
export const GUEST_DOMAIN = "guest.traxora.local";

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

export function isValidGuestId(id: string | null | undefined): id is string {
  return !!id && ID_RE.test(id);
}

export function guestEmail(id: string): string {
  return `guest-${id}@${GUEST_DOMAIN}`;
}

/** True for synthetic guest addresses — never send real email to these. */
export function isGuestEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${GUEST_DOMAIN}`);
}

export function guestUser(id: string) {
  return { id: `guest-${id}`, name: "Guest", email: guestEmail(id), image: null as string | null };
}
