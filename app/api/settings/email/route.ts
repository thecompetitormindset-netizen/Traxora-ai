import { auth } from "@/auth";
import { isGuestEmail } from "@/app/lib/guest";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const email   = session?.user?.email ?? null;
  if (!email || isGuestEmail(email)) return Response.json({ subscribed: false, subscribedEmail: null });

  return Response.json({ subscribed: true, subscribedEmail: email });
}

// Signed-in users are auto-enrolled — nothing to do on POST/DELETE
export async function POST() {
  return Response.json({ ok: true });
}

export async function DELETE() {
  return Response.json({ ok: true });
}
