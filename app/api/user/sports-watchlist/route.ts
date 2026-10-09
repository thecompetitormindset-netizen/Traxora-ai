export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { supabaseAdmin, supabaseConfigured, syncUnavailable } from "@/app/lib/supabase";

export async function GET() {
  if (!supabaseConfigured()) return syncUnavailable();
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data } = await supabaseAdmin()
      .from("sports_watchlist")
      .select("items, updated_at")
      .eq("user_email", session.user.email)
      .single();

    if (!data) return Response.json({ items: null });
    return Response.json({ items: data.items, updatedAt: data.updated_at });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!supabaseConfigured()) return syncUnavailable();
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { items } = await req.json() as { items: unknown };
    if (!Array.isArray(items)) return Response.json({ error: "items must be an array" }, { status: 400 });

    await supabaseAdmin()
      .from("sports_watchlist")
      .upsert({
        user_email: session.user.email,
        items,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_email" });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
