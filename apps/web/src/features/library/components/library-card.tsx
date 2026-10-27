import { LIBRARY_KIND_NAMES, type LibraryCardDto, type LibraryKind } from "@pvh/shared";
import Link from "next/link";
import { mediaSrc } from "@/shared/lib/media-url";

export const KIND_ICON: Record<LibraryKind, string> = { PDF: "📖", AUDIO: "🎧", VIDEO: "🎬" };

export const itemPath = (slug: string) => `/thu-vien/tai-lieu/${slug}`;

// Thẻ tài liệu: bìa (hoặc biểu tượng theo loại), tên, tác giả, mô tả ngắn. Không có link file (đọc phải vào trang tài liệu).
export function LibraryCard({ item, note }: { item: LibraryCardDto; note?: string }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-black/10 bg-background dark:border-white/15">
      <Link href={itemPath(item.slug)} className="block" tabIndex={-1} aria-hidden>
        {item.coverUrl ? (
          // Ảnh từ API khác nguồn gốc; không dùng next/image để khỏi phải khai báo remotePatterns.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaSrc(item.coverUrl)} alt="" loading="lazy" className="aspect-[3/4] w-full bg-brand/10 object-cover" />
        ) : (
          <div className="flex aspect-[3/4] w-full items-center justify-center bg-brand/10 text-5xl">{KIND_ICON[item.kind]}</div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-xs opacity-70">
          <span className="font-medium text-brand">{LIBRARY_KIND_NAMES[item.kind]}</span> · {item.categoryName}
        </p>
        <h3 className="line-clamp-2 font-semibold leading-snug">
          <Link href={itemPath(item.slug)} className="hover:underline">
            {item.title}
          </Link>
        </h3>
        {item.author && <p className="line-clamp-1 text-sm opacity-80">{item.author}</p>}
        {item.description && <p className="line-clamp-2 text-sm opacity-70">{item.description}</p>}
        <p className="mt-auto pt-1 text-xs opacity-60">
          {item.audienceLabel !== "Toàn trường" && <span className="mr-2 rounded bg-amber-100 px-1 text-amber-900">{item.audienceLabel}</span>}
          {note ?? `${item.viewCount} lượt đọc`}
        </p>
      </div>
    </article>
  );
}

export function CardGrid<T extends LibraryCardDto>({ items, note }: { items: T[]; note?: (item: T) => string | undefined }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <li key={item.id}>
          <LibraryCard item={item} note={note?.(item)} />
        </li>
      ))}
    </ul>
  );
}
