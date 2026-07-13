export type Plan = "free" | "pro";

export interface Subscription {
  plan:            Plan;
  subscriptionId:  string | null;
  currentPeriodEnd: string | null;
}

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "thecompetitormindset@gmail.com";

// Comma-separated list of emails granted pro access for free (set in Vercel env vars).
// e.g. GRANTED_PRO_EMAILS="friend@example.com,another@example.com"
const GRANTED_EMAILS = new Set(
  (process.env.GRANTED_PRO_EMAILS ?? "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
);

// ── FREE LAUNCH MODE ──────────────────────────────────────────────────────────
// Flip to true to make everything free (audience-building mode). When false,
// the $5/mo Pro plan is live and all gating logic below applies.
export const FREE_LAUNCH = false;

export async function getUserPlan(email: string): Promise<Plan> {
  if (FREE_LAUNCH) return "pro";
  if (email === OWNER_EMAIL) return "pro";
  if (GRANTED_EMAILS.has(email.toLowerCase())) return "pro";

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

export function isProClient(plan: Plan | null | undefined): boolean {
  return plan === "pro";
}
