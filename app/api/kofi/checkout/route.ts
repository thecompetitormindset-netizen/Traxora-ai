export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const username = process.env.KOFI_USERNAME;
  if (!username) return Response.json({ error: "Payment not configured yet." }, { status: 503 });

  const url = `https://ko-fi.com/${username}#membershipSection`;
  return Response.json({ url });
}
