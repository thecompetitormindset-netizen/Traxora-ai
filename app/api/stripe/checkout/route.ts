export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json({ error: "Stripe checkout is no longer active. Use /api/lemon/checkout." }, { status: 410 });
}
