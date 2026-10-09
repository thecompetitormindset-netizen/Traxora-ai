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
      .from("journal_entries")
      .select("entries, updated_at")
      .eq("user_email", session.user.email)
      .single();

    if (!data) return Response.json({ entries: null });
    return Response.json({ entries: data.entries, updatedAt: data.updated_at });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!supabaseConfigured()) return syncUnavailable();
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { entries } = await req.json() as { entries: unknown };
    if (!Array.isArray(entries)) return Response.json({ error: "entries must be an array" }, { status: 400 });

    await supabaseAdmin()
      .from("journal_entries")
      .upsert({
        user_email: session.user.email,
        entries,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_email" });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
