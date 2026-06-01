export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/app/lib/supabase";

export async function POST(req: Request) {
  const secret = process.env.GUMROAD_WEBHOOK_SECRET;

  const body = await req.text();
  const params = new URLSearchParams(body);

  if (secret && params.get("secret") !== secret) {
    return new Response("Invalid secret", { status: 400 });
  }

  const alertName    = params.get("alert_name") ?? "";
  const email        = params.get("email") ?? "";
  const subscription = params.get("subscription_id") ?? null;

  if (!email) return new Response("No email", { status: 400 });

  const db = supabaseAdmin();

  if (alertName === "sale") {
    await db.from("subscriptions").upsert({
      user_email:             email,
      plan:                   "pro",
      stripe_customer_id:     null,
      stripe_subscription_id: subscription,
      current_period_end:     null,
      updated_at:             new Date().toISOString(),
    }, { onConflict: "user_email" });
  }

  if (alertName === "subscription_cancelled" || alertName === "subscription_ended") {
    await db.from("subscriptions").upsert({
      user_email:             email,
      plan:                   "free",
      stripe_subscription_id: null,
      current_period_end:     null,
      updated_at:             new Date().toISOString(),
    }, { onConflict: "user_email" });
  }

  return new Response("ok");
}
