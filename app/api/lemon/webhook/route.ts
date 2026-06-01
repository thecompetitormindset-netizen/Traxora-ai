export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHmac } from "crypto";
import { supabaseAdmin } from "@/app/lib/supabase";

type LemonPayload = {
  meta: {
    event_name: string;
    custom_data?: { user_email?: string };
  };
  data: {
    attributes: {
      user_email:  string;
      status:      string;
      renews_at:   string | null;
      ends_at:     string | null;
      customer_id: number;
      id:          number;
    };
  };
};

export async function POST(req: Request) {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });

  const body = await req.text();
  const sig  = req.headers.get("x-signature") ?? "";

  const digest = createHmac("sha256", secret).update(body).digest("hex");
  if (digest !== sig) return new Response("Invalid signature", { status: 400 });

  const payload = JSON.parse(body) as LemonPayload;
  const event   = payload.meta.event_name;
  const attr    = payload.data.attributes;

  // Prefer custom_data email (passed at checkout), fall back to LS account email
  const email = payload.meta.custom_data?.user_email ?? attr.user_email;
  if (!email) return new Response("No email", { status: 400 });

  const db = supabaseAdmin();

  if (event === "subscription_created" || event === "subscription_updated") {
    const isPro = attr.status === "active";
    await db.from("subscriptions").upsert({
      user_email:             email,
      plan:                   isPro ? "pro" : "free",
      stripe_customer_id:     String(attr.customer_id),
      stripe_subscription_id: String(attr.id),
      current_period_end:     attr.renews_at ?? attr.ends_at ?? null,
      updated_at:             new Date().toISOString(),
    }, { onConflict: "user_email" });
  }

  if (event === "subscription_cancelled" || event === "subscription_expired") {
    await db.from("subscriptions").upsert({
      user_email:             email,
      plan:                   "free",
      stripe_subscription_id: null,
      current_period_end:     attr.ends_at ?? null,
      updated_at:             new Date().toISOString(),
    }, { onConflict: "user_email" });
  }

  return new Response("ok");
}
