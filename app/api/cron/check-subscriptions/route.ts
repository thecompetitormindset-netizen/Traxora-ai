export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { supabaseAdmin } = await import("@/app/lib/supabase");
    const db = supabaseAdmin();

    const { data: expired, error } = await db
      .from("subscriptions")
      .select("user_email")
      .eq("plan", "pro")
      .lt("current_period_end", new Date().toISOString());

    if (error) {
      console.error("check-subscriptions query error:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!expired?.length) return Response.json({ downgraded: 0 });

    const emails = expired.map((r: { user_email: string }) => r.user_email);

    await db
      .from("subscriptions")
      .update({ plan: "free", updated_at: new Date().toISOString() })
      .in("user_email", emails);

    return Response.json({ downgraded: emails.length, emails });
  } catch (err) {
    console.error("check-subscriptions error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Database not available" }, { status: 503 });
  }
}
