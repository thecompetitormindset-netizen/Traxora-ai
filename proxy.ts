import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function applySecurityHeaders(res: NextResponse, req: NextRequest) {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  // CSP intentionally permissive to support Safari iOS and all browsers
  res.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'",
  );

  // Suppress Next.js header that reveals the framework
  res.headers.delete("x-powered-by");

  return res;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Landing page, login, informational pages, next-auth callbacks, cron jobs, and public market data are public
  const isPublic =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/guide" ||
    pathname === "/pricing" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/market/tickers" ||
    pathname === "/api/ai/chat";

  if (!req.auth && !isPublic) {
    // Show the landing page (with its built-in sign-in button) instead of the bare /login screen
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Logged-in user hitting /login → send to dashboard (unless signing out)
  const signedOut = req.nextUrl.searchParams.get("signedOut");
  if (req.auth && pathname === "/login" && !signedOut) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return applySecurityHeaders(NextResponse.next(), req);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|manifest.webmanifest).*)"],
};
