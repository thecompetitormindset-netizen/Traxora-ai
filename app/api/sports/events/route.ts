export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { viewer } from "@/app/lib/viewer";
import { fetchOtherSports, type SportEvent } from "@/app/lib/sportsEvents";

// Schedules for sports without predictions (see app/lib/sportsEvents.ts).
let cache: { at: number; events: SportEvent[] } | null = null;
const TTL = 30 * 60_000;

export async function GET() {
  await viewer();
  if (cache && Date.now() - cache.at < TTL) return Response.json({ events: cache.events });
  const events = await fetchOtherSports();
  if (events.length) cache = { at: Date.now(), events };
  return Response.json({ events });
}
