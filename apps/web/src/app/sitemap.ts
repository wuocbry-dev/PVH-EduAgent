import type { MetadataRoute } from "next";
import { getAllPublishedSlugs } from "@/features/posts";
import { getLibrarySitemap } from "@/features/library";
import { PUBLIC_NAV } from "@/features/site";
import { env } from "@/shared/config/env";

// sitemap.xml: các trang chính + mọi bài đã đăng (tag "posts") + tài liệu toàn trường của thư viện số (tag "library").
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
  const library: MetadataRoute.Sitemap = [
    { url: `${base}/thu-vien/anh`, changeFrequency: "weekly", priority: 0.5 },
    ...(await getLibrarySitemap()).map((item) => ({
      url: `${base}/thu-vien/tai-lieu/${item.slug}`,
      lastModified: item.publishedAt ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
  return [...pages, ...posts, ...library];
}
