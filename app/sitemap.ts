import type { MetadataRoute } from "next";

const BASE = "https://traxora-ai.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE,                       lastModified: new Date("2026-06-18"), changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/pricing`,          lastModified: new Date("2026-06-18"), changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/guide`,            lastModified: new Date("2026-06-18"), changeFrequency: "weekly",  priority: 0.9 },
    { url: `${BASE}/futures-tutorial`, lastModified: new Date("2026-06-15"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/privacy`,          lastModified: new Date("2026-06-01"), changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/terms`,            lastModified: new Date("2026-06-01"), changeFrequency: "yearly",  priority: 0.3 },
  ];
}
