import type { MetadataRoute } from "next";
import { getAllPublishedSlugs } from "@/features/posts";
import { PUBLIC_NAV } from "@/features/site";
import { env } from "@/shared/config/env";

// sitemap.xml: các trang chính + mọi bài đã đăng (làm mới cùng tag "posts" khi đăng/gỡ bài).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.siteUrl.replace(/\/$/, "");
  const pages: MetadataRoute.Sitemap = PUBLIC_NAV.map((item) => ({
    url: `${base}${item.href === "/" ? "" : item.href}`,
    changeFrequency: item.href === "/tin-tuc" || item.href === "/" ? "daily" : "monthly",
    priority: item.href === "/" ? 1 : 0.7,
  }));
  const posts: MetadataRoute.Sitemap = (await getAllPublishedSlugs()).map((post) => ({
    url: `${base}/tin-tuc/${post.slug}`,
    lastModified: post.publishedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));
  return [...pages, ...posts];
}
