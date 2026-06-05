export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { supabaseAdmin } from "@/app/lib/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data } = await supabaseAdmin()
      .from("paper_trades")
      .select("trades, updated_at")
      .eq("user_email", session.user.email)
      .single();

    if (!data) return Response.json({ trades: null });
    return Response.json({ trades: data.trades, updatedAt: data.updated_at });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { trades } = await req.json() as { trades: unknown };
    if (!Array.isArray(trades)) return Response.json({ error: "trades must be an array" }, { status: 400 });

    await supabaseAdmin()
      .from("paper_trades")
      .upsert({
        user_email: session.user.email,
        trades,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_email" });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
