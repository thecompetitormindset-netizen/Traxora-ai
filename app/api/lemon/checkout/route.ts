export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey    = process.env.LEMON_SQUEEZY_API_KEY;
  const storeId   = process.env.LEMON_SQUEEZY_STORE_ID;
  const variantId = process.env.LEMON_SQUEEZY_VARIANT_ID;

  if (!apiKey || !storeId || !variantId) {
    return Response.json({ error: "Payment not configured yet." }, { status: 503 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://traxora-ai.vercel.app";

  const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method:  "POST",
    headers: {
      "Authorization":  `Bearer ${apiKey}`,
      "Accept":         "application/vnd.api+json",
      "Content-Type":   "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: session.user.email,
            custom: { user_email: session.user.email },
          },
          product_options: {
            redirect_url: `${appUrl}/settings?upgraded=1`,
          },
        },
        relationships: {
          store:   { data: { type: "stores",   id: storeId   } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });

  const data = await res.json();
  const url  = data?.data?.attributes?.url as string | undefined;

  if (!url) {
    return Response.json({ error: "Failed to create checkout. Try again." }, { status: 502 });
  }

  return Response.json({ url });
}
