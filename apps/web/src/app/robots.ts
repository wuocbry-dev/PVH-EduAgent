import type { MetadataRoute } from "next";
import { env } from "@/shared/config/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.siteUrl.replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/bgh", "/bien-tap", "/thu-thu", "/giao-vien", "/hoc-sinh", "/dang-nhap", "/quen-mat-khau", "/dat-lai-mat-khau", "/kich-hoat", "/da-dang-xuat"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
