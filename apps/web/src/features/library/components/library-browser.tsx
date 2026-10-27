import { LIBRARY_KIND_NAMES, LIBRARY_KINDS, type LibraryKind } from "@pvh/shared";
import Link from "next/link";
import { getLibraryHome, getLibraryList, PAGE_SIZE, type LibraryQuery } from "../api/public-library";
import { CardGrid } from "./library-card";

const BASE = "/thu-vien";
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function href(params: LibraryQuery) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value && !(key === "page" && value === 1)) search.set(key, String(value));
  const query = search.toString();
  return query ? `${BASE}?${query}` : BASE;
}

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-sm ${active ? "border-brand bg-brand text-white" : "border-black/20 hover:bg-brand/10 dark:border-white/20"}`;

// Trang chủ thư viện số: tìm kiếm (không dấu), danh mục, loại, mới thêm, đọc nhiều, danh sách có phân trang.
// Khách thấy tài liệu toàn trường (có cache); người đăng nhập thấy thêm tài liệu dành cho khối/lớp mình hoặc cho nhân sự.
// Đọc searchParams và cookie nên phải đặt trong <Suspense>.
export async function LibraryBrowser({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const q = first(raw.q)?.trim().slice(0, 100) || undefined;
  const categoryParam = first(raw.category);
  const category = categoryParam && /^[a-z0-9-]{1,120}$/.test(categoryParam) ? categoryParam : undefined;
  const kindParam = first(raw.kind);
  const kind = (LIBRARY_KINDS as readonly string[]).includes(kindParam ?? "") ? (kindParam as LibraryKind) : undefined;
  const sort = first(raw.sort) === "popular" ? "popular" : undefined;
  const page = Math.max(1, Math.min(500, Number.parseInt(first(raw.page) ?? "1", 10) || 1));
  const filtered = !!(q || category || kind || sort || page > 1);
  const query: LibraryQuery = { q, category, kind, sort, page };

  const [home, list] = await Promise.all([getLibraryHome(), getLibraryList(query)]);
  const totalPages = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-8">
      <form action={BASE} method="get" role="search" className="flex gap-2">
        {category && <input type="hidden" name="category" value={category} />}
        {kind && <input type="hidden" name="kind" value={kind} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder="Tìm sách, tác giả, chủ đề… (gõ không dấu cũng được)"
          aria-label="Tìm trong thư viện"
          className="w-full rounded border border-black/20 bg-transparent px-3 py-2 text-sm dark:border-white/20"
        />
        <button type="submit" className="shrink-0 rounded bg-brand px-4 py-2 text-sm text-white">
          Tìm
        </button>
      </form>

      <nav aria-label="Danh mục thư viện" className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Link href={href({ q, kind })} className={chip(!category)}>
            Tất cả danh mục
          </Link>
          {home?.categories
            .filter((c) => !c.parentId)
            .map((c) => (
              <Link key={c.id} href={href({ q, kind, category: c.slug })} className={chip(category === c.slug)}>
                {c.name}
                {c.itemCount > 0 && <span className="ml-1 opacity-70">({c.itemCount})</span>}
              </Link>
            ))}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {LIBRARY_KINDS.map((k) => (
            <Link key={k} href={href({ q, category, kind: kind === k ? undefined : k })} className={chip(kind === k)}>
              {LIBRARY_KIND_NAMES[k]}
            </Link>
          ))}
        </div>
      </nav>

      {!filtered && home && (
        <>
          {home.newest.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Mới thêm</h2>
              <CardGrid items={home.newest} />
            </section>
          )}
          {home.mostRead.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold">Đọc nhiều</h2>
                <Link href={href({ sort: "popular" })} className="text-sm underline">
                  Xem tất cả
                </Link>
              </div>
              <CardGrid items={home.mostRead} />
            </section>
          )}
        </>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{q ? `Kết quả cho “${q}”` : sort === "popular" ? "Đọc nhiều nhất" : "Tất cả tài liệu"}</h2>
        {list === null ? (
          <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Không tải được thư viện lúc này, vui lòng thử lại sau.
          </p>
        ) : list.items.length === 0 ? (
          <p className="opacity-70">{filtered ? "Không tìm thấy tài liệu phù hợp." : "Thư viện chưa có tài liệu nào."}</p>
        ) : (
          <>
            <p className="text-sm opacity-70">{list.total} tài liệu</p>
            <CardGrid items={list.items} />
          </>
        )}
        {totalPages > 1 && (
          <nav aria-label="Phân trang" className="flex items-center justify-center gap-3 text-sm">
            {page > 1 && (
              <Link href={href({ ...query, page: page - 1 })} rel="prev" className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20">
                ← Trang trước
              </Link>
            )}
            <span>
              Trang {page}/{totalPages}
            </span>
            {page < totalPages && (
              <Link href={href({ ...query, page: page + 1 })} rel="next" className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20">
                Trang sau →
              </Link>
            )}
          </nav>
        )}
      </section>

      <p className="text-sm opacity-70">
        Đọc, nghe, xem tài liệu cần đăng nhập bằng tài khoản của trường. Xem thêm{" "}
        <Link href="/thu-vien/anh" className="underline">
          thư viện ảnh hoạt động
        </Link>
        .
      </p>
    </div>
  );
}
