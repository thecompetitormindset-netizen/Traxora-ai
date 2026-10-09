// Who is making this request. Traxora works without signing in: a signed-in
// user is identified by email; anyone else gets a stable anonymous id derived
// from a hash of their IP and user agent (never stored raw). Routes use the id
// for rate limits and caches exactly as they used the email before.
//
// Routes that act on a person's own account (orders, sync, settings, email)
// must keep using auth() and require a real session.

import { auth } from "@/auth";
import { headers } from "next/headers";
import { createHash } from "node:crypto";

export type Viewer = { user: { email: string; anonymous: boolean } };

export async function viewer(): Promise<Viewer> {
  try {
    const s = await auth();
    if (s?.user?.email) return { user: { email: s.user.email, anonymous: false } };
  } catch { /* no session */ }
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const id = createHash("sha256").update(`${ip}|${h.get("user-agent") ?? ""}`).digest("hex").slice(0, 16);
  return { user: { email: `anon-${id}@anonymous.traxora`, anonymous: true } };
}
