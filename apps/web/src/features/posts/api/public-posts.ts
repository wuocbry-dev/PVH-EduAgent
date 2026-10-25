import type { CategoryDto, PublicPostDto, PublicPostListDto } from "@pvh/shared";
import { cacheLife, cacheTag } from "next/cache";
import { load, publicFetch } from "@/shared/lib/public-api";

export interface PublicPostsQuery {
  category?: string;
  page?: number;
  pageSize?: number;
  q?: string;
}

const toQuery = ({ category, page = 1, pageSize = 10, q }: PublicPostsQuery) => {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (category) params.set("category", category);
  if (q) params.set("q", q);
  return `/public/posts?${params}`;
};

// Danh sách bài đã đăng (có cache). Làm mới ngay khi API báo đăng/gỡ bài (tag "posts"), và hết hạn sau vài phút.
export async function getPublicPosts(query: Omit<PublicPostsQuery, "q">): Promise<PublicPostListDto | null> {
  "use cache";
  cacheTag("posts");
  const { data } = await load<PublicPostListDto>(toQuery(query));
  // API lỗi thì chỉ nhớ kết quả trong vài giây để lần sau thử lại sớm.
  if (data) cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  else cacheLife("seconds");
  return data;
}

// Tìm kiếm không cache: mỗi từ khóa là một khóa riêng, cache sẽ phình ra vô ích.
export async function searchPublicPosts(query: PublicPostsQuery): Promise<PublicPostListDto | null> {
  try {
    return await publicFetch<PublicPostListDto>(toQuery(query));
  } catch {
    return null;
  }
}

export interface PublicPostResult {
  post: PublicPostDto | null;
  // true khi bài không tồn tại hoặc chưa/không còn ở trạng thái PUBLISHED.
  notFound: boolean;
}

export async function getPublicPost(slug: string): Promise<PublicPostResult> {
  "use cache";
  cacheTag("posts");
  const { data, notFound } = await load<PublicPostDto>(`/public/posts/${encodeURIComponent(slug)}`);
  if (data || notFound) cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  else cacheLife("seconds");
  return { post: data, notFound };
}

// Mọi bài đã đăng (slug + ngày đăng) cho sitemap.xml.
export async function getAllPublishedSlugs(): Promise<{ slug: string; publishedAt: string }[]> {
  "use cache";
  cacheTag("posts");
  const pageSize = 50;
  const all: { slug: string; publishedAt: string }[] = [];
  for (let page = 1; page <= 40; page++) {
    const { data } = await load<PublicPostListDto>(toQuery({ page, pageSize }));
    if (!data) {
      cacheLife("seconds");
      return all;
    }
    all.push(...data.items.map(({ slug, publishedAt }) => ({ slug, publishedAt })));
    if (data.items.length < pageSize) break;
  }
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  return all;
}

// Danh sách chuyên mục cho bộ lọc tin tức. Đặt ở đây (không phải feature categories) vì feature đó
// được component client nhập qua index, mà `next/cache` chỉ dùng được phía server.
export async function getPublicCategories(): Promise<CategoryDto[]> {
  "use cache";
  cacheTag("categories");
  const { data } = await load<CategoryDto[]>("/categories");
  if (data) cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  else cacheLife("seconds");
  return data ?? [];
}
