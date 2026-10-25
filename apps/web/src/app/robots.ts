import type { MetadataRoute } from "next";
import { env } from "@/shared/config/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.siteUrl.replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/dang-nhap", "/quen-mat-khau", "/dat-lai-mat-khau"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
