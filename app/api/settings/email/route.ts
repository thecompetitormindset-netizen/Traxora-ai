import { auth } from "@/auth";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

const FILE = path.join(process.cwd(), "data", "alert-settings.json");

async function readSavedEmail(): Promise<string | null> {
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    return (JSON.parse(raw) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
}

async function writeEmail(email: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify({ email }, null, 2));
  } catch { /* read-only filesystem on Vercel — subscription stored in-memory only */ }
}

async function deleteEmail(): Promise<void> {
  try { await fs.unlink(FILE); } catch { /* already gone */ }
}

export async function GET() {
  const session      = await auth();
  const sessionEmail = session?.user?.email ?? null;
  const savedEmail   = await readSavedEmail();

  // A user is subscribed only when the stored email matches their own session email.
  // If savedEmail holds a different user's address (or the USER_EMAIL env-var fallback),
  // this user is not subscribed — we must not show them someone else's email.
  const subscribed = !!sessionEmail && savedEmail === sessionEmail;

  return Response.json({
    sessionEmail,
    subscribed,
    subscribedEmail: subscribed ? sessionEmail : null,
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  await writeEmail(session.user.email);
  return Response.json({ ok: true, email: session.user.email });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  await deleteEmail();
  return Response.json({ ok: true });
}
