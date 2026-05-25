export async function GET() {
  return Response.json({
    hasKey: !!process.env.EODHD_API_KEY,
    keyStart: process.env.EODHD_API_KEY?.slice(0, 5) || null,
  });
}
