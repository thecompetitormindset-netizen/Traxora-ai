export const dynamic = "force-static";

export function GET() {
  return new Response("google-site-verification: googleca987f33213fdf01.html", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
