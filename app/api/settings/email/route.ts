import { auth } from "@/auth";
import { getUserPlan } from "@/app/lib/subscription";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const email   = session?.user?.email ?? null;
  if (!email) return Response.json({ subscribed: false, subscribedEmail: null });

  const plan       = await getUserPlan(email);
  const subscribed = plan === "pro";
  return Response.json({ subscribed, subscribedEmail: subscribed ? email : null });
}

// Pro users are auto-enrolled — nothing to do on POST/DELETE
export async function POST() {
  return Response.json({ ok: true });
}

export async function DELETE() {
  return Response.json({ ok: true });
}
