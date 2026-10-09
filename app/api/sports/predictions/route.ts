export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { viewer } from "@/app/lib/viewer";
import { fetchAllUpcoming } from "@/app/lib/sportsPredictions";

// ── Cache ─────────────────────────────────────────────────────────────────────

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 min — ESPN is free/unauthenticated, no quota to protect

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache.data);
  }

  const games = await fetchAllUpcoming();
  const payload = { games, configured: true, updatedAt: new Date().toISOString() };
  cache = { data: payload, ts: Date.now() };
  return Response.json(payload);
}
