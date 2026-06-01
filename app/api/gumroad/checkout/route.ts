export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const permalink = process.env.GUMROAD_PRODUCT_PERMALINK;
  if (!permalink) return Response.json({ error: "Payment not configured yet." }, { status: 503 });

  const url = `https://gumroad.com/l/${permalink}?email=${encodeURIComponent(session.user.email)}&wanted=true`;
  return Response.json({ url });
}
