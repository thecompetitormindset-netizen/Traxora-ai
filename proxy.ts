import { GUEST_COOKIE, GUEST_HEADER, isValidGuestId } from "@/app/lib/guest";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function applySecurityHeaders(res: NextResponse) {
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

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Open access: sign-in and pricing pages are retired — send people straight to the app.
  if (pathname === "/login" || pathname === "/pricing") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Give every visitor an anonymous guest id so per-user features keep working without sign-in.
  const existing = req.cookies.get(GUEST_COOKIE)?.value;
  if (isValidGuestId(existing)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const id = crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(GUEST_HEADER, id); // visible to auth() on this very first request
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.cookies.set(GUEST_COOKIE, id, {
    path:     "/",
    maxAge:   60 * 60 * 24 * 365 * 2, // 2 years
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
    httpOnly: false, // read client-side by useAppSession
  });
  return applySecurityHeaders(res);
}

export const config = {
  // Exclude Next.js internals, all static files in /public (sw.js, icons, SVGs, manifest),
  // and well-known paths that must never redirect (service worker scope requires a 200, not a 307).
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|icon-192\\.png|icon-512\\.png|.*\\.svg$|.*\\.png$|.*\\.ico$|.*\\.webmanifest$).+)",
  ],
};
