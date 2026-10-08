import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { Resend } from "resend";
import type { Session } from "next-auth";
import { cookies, headers } from "next/headers";
import { GUEST_COOKIE, GUEST_HEADER, guestUser, isValidGuestId } from "@/app/lib/guest";

const isDev = process.env.NODE_ENV === "development";

function loginEmailHtml(params: {
  name: string;
  email: string;
  date: Date;
  isNewUser: boolean;
}): string {
  const { name, email, date, isNewUser } = params;

  const signInTime = date.toLocaleString("en-US", {
    weekday: "long",
    year:    "numeric",
    month:   "long",
    day:     "numeric",
    hour:    "2-digit",
    minute:  "2-digit",
    hour12:  true,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${isNewUser ? "Welcome to Traxora AI" : "New Sign-In · Traxora AI"}</title>
</head>
<body style="margin:0;padding:0;background:#060a14;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#060a14;min-height:100vh">
<tr><td align="center" style="padding:32px 16px">
<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%">

  <!-- Logo row -->
  <tr>
    <td align="center" style="padding-bottom:28px">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:#0c1017;border:1px solid #1c2333;border-radius:14px;padding:12px 20px">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="width:36px;height:36px;background:#4f46e5;border-radius:8px;text-align:center;vertical-align:middle;font-size:18px;line-height:36px">
                  📈
                </td>
                <td style="padding-left:12px;vertical-align:middle">
                  <p style="margin:0;font-size:15px;font-weight:900;color:#f1f5f9;letter-spacing:-0.3px">Traxora AI</p>
                  <p style="margin:2px 0 0;font-size:10px;color:#4b5675;font-family:monospace">Smart Money Platform</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Alert card -->
  <tr>
    <td style="background:#0c1017;border:1px solid #1c2333;border-radius:20px;overflow:hidden">

      <!-- Card header -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:${isNewUser ? "#10b98112" : "#4f46e512"};border-bottom:1px solid ${isNewUser ? "#10b98130" : "#4f46e530"};padding:20px 24px">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:48px;vertical-align:top">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="width:44px;height:44px;background:${isNewUser ? "#10b98120" : "#4f46e520"};border:1px solid ${isNewUser ? "#10b98140" : "#4f46e540"};border-radius:12px;text-align:center;vertical-align:middle;font-size:22px;line-height:44px">
                        ${isNewUser ? "🎉" : "🔐"}
                      </td>
                    </tr>
                  </table>
                </td>
                <td style="padding-left:14px;vertical-align:middle">
                  <p style="margin:0;font-size:17px;font-weight:800;color:#f1f5f9">
                    ${isNewUser ? "Welcome to Traxora AI!" : "New Sign-In Detected"}
                  </p>
                  <p style="margin:4px 0 0;font-size:12px;color:#7b8db4">
                    ${isNewUser ? "Your account was just created" : "A sign-in to your account was recorded"}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Body -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:22px 24px">

            <!-- Greeting -->
            <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;line-height:1.7">
              Hi <strong style="color:#f1f5f9">${name}</strong>,
              ${isNewUser
                ? " your Traxora AI account is ready. You now have access to live smart money signals, the daily morning brief, and AI-powered market analysis."
                : " we noticed a new sign-in to your Traxora AI account. If this was you, no action is needed."}
            </p>

            <!-- Details table -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#060a14;border:1px solid #1c2333;border-radius:12px;overflow:hidden;margin-bottom:20px">
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #1c2333;width:40%">
                  <p style="margin:0;font-size:10px;color:#4b5675;text-transform:uppercase;letter-spacing:0.8px;font-weight:600">Account</p>
                </td>
                <td style="padding:12px 16px;border-bottom:1px solid #1c2333;text-align:right">
                  <p style="margin:0;font-size:13px;color:#f1f5f9;font-weight:600">${email}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #1c2333">
                  <p style="margin:0;font-size:10px;color:#4b5675;text-transform:uppercase;letter-spacing:0.8px;font-weight:600">Sign-In Method</p>
                </td>
                <td style="padding:12px 16px;border-bottom:1px solid #1c2333;text-align:right">
                  <p style="margin:0;font-size:13px;color:#f1f5f9;font-weight:600">Google OAuth</p>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #1c2333">
                  <p style="margin:0;font-size:10px;color:#4b5675;text-transform:uppercase;letter-spacing:0.8px;font-weight:600">Time</p>
                </td>
                <td style="padding:12px 16px;border-bottom:1px solid #1c2333;text-align:right">
                  <p style="margin:0;font-size:13px;color:#f1f5f9;font-weight:600">${signInTime}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 16px">
                  <p style="margin:0;font-size:10px;color:#4b5675;text-transform:uppercase;letter-spacing:0.8px;font-weight:600">Status</p>
                </td>
                <td style="padding:12px 16px;text-align:right">
                  <span style="background:#10b98120;color:#10b981;border:1px solid #10b98130;padding:3px 12px;border-radius:6px;font-size:11px;font-weight:700">&#10003; Authorized</span>
                </td>
              </tr>
            </table>

            <!-- Wasn't you -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8717110;border:1px solid #f8717140;border-radius:12px;overflow:hidden">
              <tr>
                <td style="padding:16px 18px">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="width:24px;vertical-align:top;padding-top:1px;font-size:18px">&#9888;&#65039;</td>
                      <td style="padding-left:10px;vertical-align:top">
                        <p style="margin:0 0 6px;font-size:13px;font-weight:800;color:#fca5a5">Wasn't you?</p>
                        <p style="margin:0 0 12px;font-size:12px;color:#fca5a5;line-height:1.6">
                          If you did not sign in to Traxora AI, your Google account may be compromised.
                          Change your password immediately to secure your account.
                        </p>
                        <table cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="background:#f87171;border-radius:8px;padding:0">
                              <a href="https://myaccount.google.com/security" target="_blank"
                                style="display:block;padding:10px 20px;font-size:12px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px">
                                Change Google Password →
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="border-top:1px solid #1c2333;padding:18px 24px;text-align:center">
            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
              <tr>
                <td style="background:#059669;border-radius:10px">
                  <a href="https://traxora-ai.vercel.app/dashboard" target="_blank"
                    style="display:block;padding:12px 28px;font-size:13px;font-weight:700;color:#ffffff;text-decoration:none">
                    ${isNewUser ? "Start Trading →" : "Open Dashboard →"}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td align="center" style="padding-top:24px">
      <p style="margin:0;font-size:10px;color:#2d3a50">You are receiving this because sign-in alerts are enabled for your Traxora AI account.</p>
      <p style="margin:6px 0 0;font-size:10px;color:#1c2333">Traxora AI &middot; Smart Money Platform</p>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

const nextAuth = NextAuth({
  providers: [
    Google,
    // Local-only sign-in path: Google OAuth can't complete against localhost,
    // so `next dev` accepts any email directly. Never registered in production builds.
    ...(isDev
      ? [
          Credentials({
            id: "dev-login",
            name: "Dev Login (local only)",
            credentials: { email: { label: "Email" } },
            authorize(credentials) {
              const email = typeof credentials?.email === "string" && credentials.email.includes("@")
                ? credentials.email
                : "dev@localhost.test";
              return { id: `dev-${email}`, name: "Dev User", email };
            },
          }),
        ]
      : []),
  ],
  // Required on Vercel: trusts the x-forwarded-host header from the edge proxy
  // so OAuth callbacks resolve to the correct production URL instead of localhost.
  trustHost: true,
  session: {
    strategy:  "jwt",
    maxAge:    30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60,      // refresh once per day
  },
  callbacks: {
    async signIn({ user }) {
      // ALLOWED_EMAILS: comma-separated list for private/beta mode.
      // Leave unset (or empty) in Vercel env to allow any Google account — this is the public/production setting.
      const allowList = process.env.ALLOWED_EMAILS;
      if (!allowList || allowList.trim() === "") return true;
      const allowed = allowList.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
      if (allowed.length === 0) return true;
      const granted = !!user.email && allowed.includes(user.email.toLowerCase());
      if (!granted) {
        console.warn(`[auth] Sign-in denied for ${user.email} — not in ALLOWED_EMAILS list. Remove ALLOWED_EMAILS from Vercel env to open to all users.`);
      }
      return granted;
    },
  },
  events: {
    async signIn({ user, isNewUser }) {
      if (isDev) return; // don't send real sign-in emails from local dev
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey || !user.email) return;

      const resend = new Resend(resendKey);
      await resend.emails.send({
        from:    "Traxora AI <onboarding@resend.dev>",
        to:      user.email,
        subject: isNewUser
          ? "🎉 Welcome to Traxora AI — Account Created"
          : "🔐 New sign-in to your Traxora AI account",
        html: loginEmailHtml({
          name:      user.name ?? "there",
          email:     user.email,
          date:      new Date(),
          isNewUser: !!isNewUser,
        }),
      });
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * Open-access session lookup. Returns the Google session if one still exists,
 * otherwise an anonymous guest session tied to the visitor's guest cookie
 * (set by proxy.ts). No one is ever required to sign in.
 */
export async function auth(): Promise<Session | null> {
  try {
    const real = await nextAuth.auth();
    if (real?.user?.email) return real;
  } catch { /* no/invalid auth cookie → fall through to guest */ }

  let id: string | undefined;
  try {
    id = (await cookies()).get(GUEST_COOKIE)?.value;
    if (!isValidGuestId(id)) id = (await headers()).get(GUEST_HEADER) ?? undefined;
  } catch { /* called outside a request scope */ }
  if (!isValidGuestId(id)) return null;

  return {
    user: guestUser(id),
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  } as Session;
}
