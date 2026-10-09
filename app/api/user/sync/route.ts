export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { supabaseAdmin, supabaseConfigured, syncUnavailable } from "@/app/lib/supabase";

// GET — pull portfolio from Supabase (called on login / device switch)
export async function GET() {
  if (!supabaseConfigured()) return syncUnavailable();
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data } = await supabaseAdmin()
      .from("portfolio_snapshots")
      .select("data, updated_at")
      .eq("user_email", session.user.email)
      .single();

    if (!data) return Response.json({ snapshot: null });
    return Response.json({ snapshot: data.data, updatedAt: data.updated_at });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// POST — push portfolio to Supabase (called on every portfolio change, debounced)
export async function POST(req: Request) {
  if (!supabaseConfigured()) return syncUnavailable();
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { portfolio } = await req.json() as { portfolio: unknown };
    if (!portfolio) return Response.json({ error: "portfolio required" }, { status: 400 });

    await supabaseAdmin()
      .from("portfolio_snapshots")
      .upsert({
        user_email: session.user.email,
        data:       portfolio,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_email" });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
