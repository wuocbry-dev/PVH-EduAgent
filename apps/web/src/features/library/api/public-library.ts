import type { LibraryHomeDto, LibraryItemDto, LibraryListDto } from "@pvh/shared";
import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/features/auth/config";
import { apiFetch, parseResponse } from "@/shared/lib/api-client";
import { load } from "@/shared/lib/public-api";

export interface LibraryQuery {
  q?: string;
  category?: string;
  kind?: string;
  sort?: "new" | "popular";
  page?: number;
}

export const PAGE_SIZE = 24;

const toQuery = ({ q, category, kind, sort, page = 1 }: LibraryQuery) => {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (kind) params.set("kind", kind);
  if (sort) params.set("sort", sort);
  return params.toString();
};

// Danh mục công khai (chỉ tài liệu toàn trường). Làm mới khi API báo duyệt/ẩn tài liệu (tag "library").
export async function getLibraryHome(): Promise<LibraryHomeDto | null> {
  "use cache";
  cacheTag("library");
  const { data } = await load<LibraryHomeDto>("/public/library/home");
  if (data) cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  else cacheLife("seconds");
  return data;
}

export async function getPublicLibraryList(query: Omit<LibraryQuery, "q">): Promise<LibraryListDto | null> {
  "use cache";
  cacheTag("library");
  const { data } = await load<LibraryListDto>(`/public/library/items?${toQuery(query)}`);
  if (data) cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  else cacheLife("seconds");
  return data;
}

export async function getPublicLibraryItem(slug: string): Promise<{ item: LibraryItemDto | null; notFound: boolean }> {
  "use cache";
  cacheTag("library");
  const { data, notFound } = await load<LibraryItemDto>(`/public/library/items/${encodeURIComponent(slug)}`);
  if (data || notFound) cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  else cacheLife("seconds");
  return { item: data, notFound };
}

// Người đã đăng nhập: gọi API kèm cookie để thấy cả tài liệu theo khối/lớp/chỉ giáo viên của mình (không cache).
// Chưa đăng nhập hoặc phiên hết hạn → null (trang dùng dữ liệu công khai). Đọc cookies() nên phải nằm trong <Suspense>.
async function viewerGet<T>(path: string): Promise<{ data: T | null; status: number } | null> {
  const jar = await cookies();
  if (!jar.has(ACCESS_COOKIE) && !jar.has(REFRESH_COOKIE)) return null;
  try {
    const res = await apiFetch(path, { headers: { Cookie: jar.toString() } });
    if (res.status === 401) return null;
    return { data: res.ok ? await parseResponse<T>(res) : null, status: res.status };
  } catch {
    return null;
  }
}

export async function getLibraryList(query: LibraryQuery): Promise<LibraryListDto | null> {
  const viewer = await viewerGet<LibraryListDto>(`/library/items?${toQuery(query)}`);
  if (viewer) return viewer.data;
  if (!query.q) return getPublicLibraryList(query);
  // Tìm kiếm của khách không cache: mỗi từ khoá là một khoá riêng, cache phình ra vô ích.
  return (await load<LibraryListDto>(`/public/library/items?${toQuery(query)}`)).data;
}

// Trang tài liệu: dữ liệu công khai (cache) trước; không có thì hỏi lại theo người đăng nhập (tài liệu khối/lớp/nhân sự).
export async function getLibraryItem(slug: string): Promise<{ item: LibraryItemDto | null; notFound: boolean }> {
  const viewer = await viewerGet<LibraryItemDto>(`/library/items/by-slug/${encodeURIComponent(slug)}`);
  if (viewer?.data) return { item: viewer.data, notFound: false };
  if (viewer?.status === 404) return { item: null, notFound: true };
  return getPublicLibraryItem(slug);
}

// Mọi tài liệu toàn trường đã đăng (slug + ngày đăng) cho sitemap.xml.
export async function getLibrarySitemap(): Promise<{ slug: string; publishedAt: string | null }[]> {
  "use cache";
  cacheTag("library");
  const all: { slug: string; publishedAt: string | null }[] = [];
  for (let page = 1; page <= 40; page++) {
    const { data } = await load<LibraryListDto>(`/public/library/items?${toQuery({ page })}`);
    if (!data) {
      cacheLife("seconds");
      return all;
    }
    all.push(...data.items.map(({ slug, publishedAt }) => ({ slug, publishedAt })));
    if (data.items.length < PAGE_SIZE) break;
  }
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  return all;
}
