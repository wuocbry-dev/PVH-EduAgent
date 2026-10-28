import Link from "next/link";

interface Props {
  basePath: string;
  page: number;
  totalPages: number;
  // Các tham số lọc giữ nguyên khi chuyển trang (category, q...).
  params: Record<string, string | undefined>;
}

function href(basePath: string, params: Props["params"], page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function Pagination({ basePath, page, totalPages, params }: Props) {
  if (totalPages <= 1) return null;
  const linkClass = "rounded-xl border border-border-strong px-3 py-1.5 text-sm hover:bg-primary-soft";
  return (
    <nav aria-label="Phân trang" className="flex items-center justify-center gap-3">
      {page > 1 ? (
        <Link href={href(basePath, params, page - 1)} className={linkClass} rel="prev">
          ← Trang trước
        </Link>
      ) : (
        <span className={`${linkClass} pointer-events-none opacity-40`}>← Trang trước</span>
      )}
      <span className="text-sm">
        Trang {page}/{totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(basePath, params, page + 1)} className={linkClass} rel="next">
          Trang sau →
        </Link>
      ) : (
        <span className={`${linkClass} pointer-events-none opacity-40`}>Trang sau →</span>
      )}
    </nav>
  );
}
