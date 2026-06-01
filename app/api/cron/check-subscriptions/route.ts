export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/app/lib/supabase";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = supabaseAdmin();

  // Find pro users whose subscription period has expired
  const { data: expired } = await db
    .from("subscriptions")
    .select("user_email")
    .eq("plan", "pro")
    .lt("current_period_end", new Date().toISOString());

  if (!expired?.length) return Response.json({ downgraded: 0 });

  const emails = expired.map(r => r.user_email);

  await db
    .from("subscriptions")
    .update({ plan: "free", updated_at: new Date().toISOString() })
    .in("user_email", emails);

  return Response.json({ downgraded: emails.length });
}
