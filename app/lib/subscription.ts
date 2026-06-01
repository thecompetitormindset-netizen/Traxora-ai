// ── Subscription gating ───────────────────────────────────────────────────────
// isPro() returns true for everyone until LAUNCH_PAYWALL=true is set in Vercel.
// Flip that env var in 2 months to start enforcing the free/pro split.

export type Plan = "free" | "pro";

export interface Subscription {
  plan:                  Plan;
  stripeCustomerId:      string | null;
  stripeSubscriptionId:  string | null;
  currentPeriodEnd:      string | null;
}

// Server-side: check if a user is pro
export async function getUserPlan(email: string): Promise<Plan> {
  // While LAUNCH_PAYWALL is not set, everyone is pro
  if (!process.env.LAUNCH_PAYWALL) return "pro";

  try {
    const { supabaseAdmin } = await import("./supabase");
    const { data } = await supabaseAdmin()
      .from("subscriptions")
      .select("plan")
      .eq("user_email", email)
      .single();
    return (data?.plan as Plan) ?? "free";
  } catch { return "free"; }
}

// Client-side: cached plan from session (set by API route)
export function isProClient(plan: Plan | null | undefined): boolean {
  if (!process.env.NEXT_PUBLIC_LAUNCH_PAYWALL) return true;
  return plan === "pro";
}

// Features gated behind Pro (for UI display only — not enforced yet)
export const PRO_FEATURES = [
  "Morning briefing email",
  "Deep AI market analysis",
  "Opus smart money reports",
  "Unlimited AI scans",
  "Priority support",
] as const;
