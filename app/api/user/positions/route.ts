export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { supabaseAdmin } from "@/app/lib/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data } = await supabaseAdmin()
      .from("real_positions")
      .select("positions, updated_at")
      .eq("user_email", session.user.email)
      .single();

    if (!data) return Response.json({ positions: null });
    return Response.json({ positions: data.positions, updatedAt: data.updated_at });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { positions } = await req.json() as { positions: unknown };
    if (!Array.isArray(positions)) return Response.json({ error: "positions must be an array" }, { status: 400 });

    await supabaseAdmin()
      .from("real_positions")
      .upsert({
        user_email: session.user.email,
        positions,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_email" });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
