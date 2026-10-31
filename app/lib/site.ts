// The one place the deployment's own address is written down.
//
// It used to be written down in nine files, twenty-four times, and four of
// those copies named a domain nobody owns. The backfill workflow inherited the
// same guess and spent twenty minutes failing to resolve it while reporting
// success — and a reader who saw "traxora.ai" in the footer of a shared brief
// and typed it in got nothing at all.
//
// If a custom domain is attached in Vercel later, change SITE_URL and nothing
// else: the canonical tags, the sitemap, the structured data, the sign-in
// email, the morning email and the Discord footers all read from here.

/** Absolute origin, no trailing slash. */
export const SITE_URL = "https://traxora-ai.vercel.app";

/** Bare host, for the places that show the address as text rather than link it. */
export const SITE_HOST = new URL(SITE_URL).host;

/** An absolute URL for a path on this deployment. `path` may omit the leading slash. */
export function siteUrl(path = ""): string {
  if (!path) return SITE_URL;
  return `${SITE_URL}/${path.replace(/^\/+/, "")}`;
}
