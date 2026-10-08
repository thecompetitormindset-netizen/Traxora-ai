"use client";

// Drop-in replacement for next-auth's useSession() in open-access mode.
// If a Google session still exists it is used; otherwise every visitor is
// treated as signed in with their anonymous guest identity (cookie set by proxy.ts).

import { useMemo, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { GUEST_COOKIE, guestUser, isValidGuestId } from "./guest";

function readGuestId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find(c => c.startsWith(`${GUEST_COOKIE}=`));
  const id = match ? decodeURIComponent(match.slice(GUEST_COOKIE.length + 1)) : null;
  return isValidGuestId(id) ? id : null;
}

const GUEST_EXPIRES = "9999-12-31T00:00:00.000Z";
const noopSubscribe = () => () => {};
const serverSnapshot = () => null;

// Proxy normally sets the cookie; create one client-side as a fallback. Idempotent.
function ensureGuestId(): string | null {
  let id = readGuestId();
  if (!id && typeof document !== "undefined") {
    id = crypto.randomUUID();
    document.cookie = `${GUEST_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365 * 2}; samesite=lax`;
  }
  return id;
}

type AppSessionStatus = "loading" | "authenticated" | "unauthenticated";

export function useAppSession(): {
  data:   Session | null;
  status: AppSessionStatus;
  update: ReturnType<typeof useSession>["update"];
} {
  const real = useSession();
  const guestId = useSyncExternalStore(noopSubscribe, ensureGuestId, serverSnapshot);

  // Stable object identity so effects depending on `session` don't re-run every render.
  const guestSession = useMemo<Session | null>(() => guestId ? {
    user:    guestUser(guestId),
    expires: GUEST_EXPIRES,
  } as Session : null, [guestId]);

  if (real.status === "authenticated" && real.data?.user?.email) {
    return { data: real.data, status: "authenticated", update: real.update };
  }
  if (real.status === "loading" || !guestSession) {
    return { data: null, status: "loading" as const, update: real.update };
  }
  return { data: guestSession, status: "authenticated" as const, update: real.update };
}
