export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type KofiData = {
  verification_token:            string;
  type:                          string;
  email:                         string;
  amount:                        string;
  is_subscription_payment:       boolean;
  is_first_subscription_payment: boolean;
  kofi_transaction_id:           string;
  tier_name:                     string | null;
};

export async function POST(req: Request) {
  const token = process.env.KOFI_VERIFICATION_TOKEN;
  if (!token) {
    console.error("KOFI_VERIFICATION_TOKEN not set — webhook rejected");
    return new Response("Webhook not configured", { status: 500 });
  }

  let data: KofiData;
  try {
    const body   = await req.text();
    const params = new URLSearchParams(body);
    const raw    = params.get("data");
    if (!raw) return new Response("No data", { status: 400 });
    data = JSON.parse(raw) as KofiData;
  } catch {
    return new Response("Bad data", { status: 400 });
  }

  if (data.verification_token !== token) {
    return new Response("Invalid token", { status: 401 });
  }

  if (data.type !== "Subscription" || !data.is_subscription_payment) {
    return new Response("ok");
  }

  const email = data.email?.trim().toLowerCase();
  if (!email) return new Response("No email", { status: 400 });

  try {
    const { supabaseAdmin } = await import("@/app/lib/supabase");
    const db = supabaseAdmin();

    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 35); // monthly + 5-day buffer

    const { error } = await db.from("subscriptions").upsert({
      user_email:             email,
      plan:                   "pro",
      stripe_customer_id:     null,
      stripe_subscription_id: data.kofi_transaction_id,
      current_period_end:     periodEnd.toISOString(),
      updated_at:             new Date().toISOString(),
    }, { onConflict: "user_email" });

    if (error) {
      console.error("Ko-fi webhook Supabase error:", error.message);
      return new Response("DB error", { status: 500 });
    }
  } catch (err) {
    console.error("Ko-fi webhook error:", err instanceof Error ? err.message : err);
    return new Response("Server error", { status: 500 });
  }

  return new Response("ok");
}
