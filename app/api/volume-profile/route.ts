export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type { VolumeProfile, VolumeNode } from "@/app/lib/volumeProfile";
import { getVolumeProfile } from "@/app/lib/volumeProfile";

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol");
  if (!symbol) return Response.json({ error: "symbol required" }, { status: 400 });

  const profile = await getVolumeProfile(symbol);
  if (!profile) return Response.json({ error: "Failed to build volume profile" }, { status: 500 });

  return Response.json(profile);
}
