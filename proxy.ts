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

  const isDev = process.env.NODE_ENV !== "production";
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://s3.tradingview.com https://static.tradingview.com",
      "connect-src 'self' " +
        "https://query1.finance.yahoo.com " +
        "https://paper-api.alpaca.markets " +
        "https://api.alpaca.markets " +
        "https://www.alphavantage.co",
      "frame-src https://*.tradingview.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );

  // Suppress Next.js header that reveals the framework
  res.headers.delete("x-powered-by");

  return res;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Landing page, login, next-auth callbacks, and cron jobs are public
  const isPublic =
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/cron/");

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Logged-in user hitting /login → send to dashboard
  if (req.auth && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return applySecurityHeaders(NextResponse.next(), req);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|manifest.webmanifest).*)"],
};
