export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

import { after } from "next/server";
import { getScanState, isRunning, runChunk, startScan } from "@/app/lib/optionsAnalysis/scan";

// Runs the whole-universe options scan in chunks. Called by the daily Vercel
// cron (starts a pass), by the Options page when the last pass is old, and by
// itself to continue: each call answers at once, analyzes for ~45 seconds in
// the background, then calls the next chunk. Protected by CRON_SECRET.

const BUDGET_MS = 45_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  let runId = url.searchParams.get("run");
  if (!runId) {
    const current = await getScanState();
    if (isRunning(current)) return Response.json({ status: "already running", run: current!.run_id, offset: current!.offset, of: current!.deep.length });
    try { runId = (await startScan(url.searchParams.get("by") ?? "cron")).run_id; }
    catch (err) { return Response.json({ status: "failed", error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
  }

  const id = runId;
  after(async () => {
    const more = await runChunk(id, BUDGET_MS, "scan").catch(err => { console.error("[options-scan] chunk failed:", err instanceof Error ? err.message : err); return false; });
    if (!more) return;
    // Hand off to a fresh request for the next chunk. Only the request needs
    // to reach the server; don't wait for its work to finish.
    try {
      await fetch(`${url.origin}/api/cron/options-scan?run=${encodeURIComponent(id)}`, {
        headers: { authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(4_000),
      });
    } catch { /* timeout is expected — the next chunk keeps running */ }
  });

  return Response.json({ status: "running", run: id }, { status: 202 });
}
