export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { supabaseAdmin } from "@/app/lib/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data } = await supabaseAdmin()
      .from("watchlists")
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
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { items } = await req.json() as { items: unknown };
    if (!Array.isArray(items)) return Response.json({ error: "items must be an array" }, { status: 400 });

    await supabaseAdmin()
      .from("watchlists")
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
