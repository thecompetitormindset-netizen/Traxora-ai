export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/app/lib/supabase";

type KofiData = {
  verification_token:           string;
  type:                         string;
  email:                        string;
  amount:                       string;
  is_subscription_payment:      boolean;
  is_first_subscription_payment: boolean;
  kofi_transaction_id:          string;
  tier_name:                    string | null;
};

export async function POST(req: Request) {
  const token = process.env.KOFI_VERIFICATION_TOKEN;

  const body = await req.text();
  const params = new URLSearchParams(body);
  const raw = params.get("data");
  if (!raw) return new Response("No data", { status: 400 });

  let data: KofiData;
  try { data = JSON.parse(raw); } catch { return new Response("Bad data", { status: 400 }); }

  if (token && data.verification_token !== token) {
    return new Response("Invalid token", { status: 400 });
  }

  if (data.type !== "Subscription" || !data.is_subscription_payment) {
    return new Response("ok");
  }

  const email = data.email;
  if (!email) return new Response("No email", { status: 400 });

  // Set period end to 35 days from now (monthly + 5 day buffer)
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 35);

  const db = supabaseAdmin();
  await db.from("subscriptions").upsert({
    user_email:             email,
    plan:                   "pro",
    stripe_customer_id:     null,
    stripe_subscription_id: data.kofi_transaction_id,
    current_period_end:     periodEnd.toISOString(),
    updated_at:             new Date().toISOString(),
  }, { onConflict: "user_email" });

  return new Response("ok");
}
