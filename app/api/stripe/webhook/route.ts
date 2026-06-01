export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return new Response("Stripe webhook is no longer active.", { status: 410 });
}
