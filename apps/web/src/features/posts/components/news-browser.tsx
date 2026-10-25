import Link from "next/link";
import { flattenCategories, indent } from "@/features/categories";
import { getPublicCategories, getPublicPosts, searchPublicPosts } from "../api/public-posts";
import { NewsCard } from "./news-card";
import { Pagination } from "./pagination";

const PAGE_SIZE = 9;

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  basePath: string;
  // Cố định chuyên mục (trang Thông báo): không hiện bộ lọc chuyên mục.
  fixedCategory?: string;
  emptyText?: string;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Danh sách bài có lọc theo chuyên mục, tìm kiếm và phân trang. Đọc searchParams nên phải đặt trong <Suspense>.
export async function NewsBrowser({ searchParams, basePath, fixedCategory, emptyText = "Chưa có bài viết nào." }: Props) {
  const raw = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(first(raw.page) ?? "1", 10) || 1));
  const q = first(raw.q)?.trim().slice(0, 100) || undefined;
  const requested = first(raw.category);
  const category = fixedCategory ?? (requested && /^[a-z0-9-]{1,120}$/.test(requested) ? requested : undefined);

  const [categories, result] = await Promise.all([
    fixedCategory ? Promise.resolve([]) : getPublicCategories(),
    q ? searchPublicPosts({ category, q, page, pageSize: PAGE_SIZE }) : getPublicPosts({ category, page, pageSize: PAGE_SIZE }),
  ]);
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const params = { category: fixedCategory ? undefined : category, q };
  const tabClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? "border-brand bg-brand text-white" : "border-black/20 hover:bg-brand/10 dark:border-white/20"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!fixedCategory && (
          <nav aria-label="Chuyên mục" className="flex flex-wrap gap-2">
            <Link href={q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath} className={tabClass(!category)}>
              Tất cả
            </Link>
            {flattenCategories(categories).map(({ category: c, depth }) => (
              <Link
                key={c.id}
                href={`${basePath}?category=${c.slug}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={tabClass(category === c.slug)}
              >
                {indent(depth)}
                {c.name}
              </Link>
            ))}
          </nav>
        )}
        {/* Form GET: tìm kiếm không cần JavaScript. */}
        <form action={basePath} method="get" role="search" className="flex w-full gap-2 sm:w-auto">
          {category && !fixedCategory && <input type="hidden" name="category" value={category} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="Tìm kiếm bài viết"
            aria-label="Tìm kiếm bài viết"
            className="w-full rounded border border-black/20 bg-transparent px-3 py-2 text-sm sm:w-64 dark:border-white/20"
          />
          <button type="submit" className="rounded bg-brand px-4 py-2 text-sm text-white">
            Tìm
          </button>
        </form>
      </div>

      {q && result && (
        <p className="text-sm opacity-80">
          {result.total} kết quả cho “{q}”
        </p>
      )}

      {result === null ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Không tải được danh sách bài viết lúc này, vui lòng thử lại sau.
        </p>
      ) : result.items.length === 0 ? (
        <p className="opacity-70">{q ? "Không tìm thấy bài viết phù hợp." : emptyText}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((post) => (
            <li key={post.id} className="contents">
              <NewsCard post={post} />
            </li>
          ))}
        </ul>
      )}

      <Pagination basePath={basePath} page={page} totalPages={totalPages} params={params} />
    </div>
  );
}
