export type Plan = "free" | "pro";

export interface Subscription {
  plan:            Plan;
  subscriptionId:  string | null;
  currentPeriodEnd: string | null;
}

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "thecompetitormindset@gmail.com";

export async function getUserPlan(email: string): Promise<Plan> {
  if (email === OWNER_EMAIL) return "pro";

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
