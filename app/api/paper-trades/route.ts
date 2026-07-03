export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

import { auth } from "@/auth";
import { supabaseAdmin } from "@/app/lib/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await supabaseAdmin()
    .from("paper_trades")
    .select("trades, updated_at")
    .eq("user_email", session.user.email)
    .single();

  if (error && error.code !== "PGRST116") {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ trades: data?.trades ?? [], updated_at: data?.updated_at ?? null });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.trades)) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("paper_trades")
    .upsert({ user_email: session.user.email, trades: body.trades, updated_at: new Date().toISOString() });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
