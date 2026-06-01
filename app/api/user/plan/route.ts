export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { getUserPlan } from "@/app/lib/subscription";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ plan: "free" });
  const plan = await getUserPlan(session.user.email);
  return Response.json({ plan });
}
