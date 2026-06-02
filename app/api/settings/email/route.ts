import { auth } from "@/auth";
import { supabaseAdmin } from "@/app/lib/supabase";

export const runtime = "nodejs";

async function getDb() {
  try { return supabaseAdmin(); } catch { return null; }
}

export async function GET() {
  const session = await auth();
  const email   = session?.user?.email ?? null;
  if (!email) return Response.json({ subscribed: false, subscribedEmail: null });

  const db = await getDb();
  if (!db) return Response.json({ subscribed: false, subscribedEmail: null });

  const { data } = await db.from("briefing_subscribers").select("email").eq("email", email).single();
  const subscribed = !!data;
  return Response.json({ subscribed, subscribedEmail: subscribed ? email : null });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Not signed in" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  const { error } = await db.from("briefing_subscribers").upsert({ email: session.user.email });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, email: session.user.email });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Not signed in" }, { status: 401 });

  const db = await getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  await db.from("briefing_subscribers").delete().eq("email", session.user.email);
  return Response.json({ ok: true });
}
