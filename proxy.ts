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

  // Every page works without signing in. API routes enforce their own access:
  // market data and rules-based analysis are open (rate-limited per visitor);
  // AI-model features, orders, sync and account settings require a session.

  // Logged-in user hitting /login → send to dashboard (unless signing out)
  const signedOut = req.nextUrl.searchParams.get("signedOut");
  if (req.auth && pathname === "/login" && !signedOut) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return applySecurityHeaders(NextResponse.next(), req);
});

export const config = {
  // Exclude Next.js internals, all static files in /public (sw.js, icons, SVGs, manifest),
  // and well-known paths that must never redirect (service worker scope requires a 200, not a 307).
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|icon-192\\.png|icon-512\\.png|.*\\.svg$|.*\\.png$|.*\\.ico$|.*\\.webmanifest$).+)",
  ],
};
