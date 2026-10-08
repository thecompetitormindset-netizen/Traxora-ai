import { auth } from "@/auth";
import { isGuestEmail } from "@/app/lib/guest";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email || isGuestEmail(session.user.email)) {
    return Response.json({ error: "Email briefing needs a real email address" }, { status: 400 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET not set — add it to Vercel env vars" }, { status: 500 });
  }

  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(
      `${origin}/api/cron/morning-email?email=${encodeURIComponent(session.user.email)}`,
      {
        cache:   "no-store",
        headers: { Authorization: `Bearer ${cronSecret}` },
      },
    );
    const data = await res.json();

    if (!res.ok) {
      return Response.json({ error: data.error || "Email failed to send" }, { status: res.status });
    }

    return Response.json(data);
  } catch {
    return Response.json({ error: "Could not reach email service — try again" }, { status: 502 });
  }
}
