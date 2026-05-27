import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ hasKey: !!process.env.EODHD_API_KEY });
}
