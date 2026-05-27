import { auth } from "@/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userEmail = session.user?.email;
  if (!userEmail) {
    return Response.json({ error: "No email on session — sign out and back in" }, { status: 400 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET not set — add it to .env.local" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const res = await fetch(
    `${origin}/api/cron/morning-email?email=${encodeURIComponent(userEmail)}`,
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${cronSecret}` },
    },
  );
  const data = await res.json();

  if (!res.ok) {
    return Response.json({ error: data.error || "Email failed to send" }, { status: res.status });
  }

  return Response.json(data);
}
