import type { GalleryItemDto } from "@pvh/shared";
import { cacheLife, cacheTag } from "next/cache";
import { load } from "@/shared/lib/public-api";

// Ảnh trong các bài đã đăng. Làm mới cùng lúc với tin tức (tag "posts").
export async function getGallery(): Promise<GalleryItemDto[] | null> {
  "use cache";
  cacheTag("posts");
  const { data } = await load<GalleryItemDto[]>("/public/gallery");
  if (data) cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  else cacheLife("seconds");
  return data;
}
