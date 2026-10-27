import { LIBRARY_KIND_NAMES, LIBRARY_SOURCE_NAMES, type LibraryItemDto } from "@pvh/shared";
import Link from "next/link";
import { formatDate } from "@/shared/lib/format";
import { mediaSrc } from "@/shared/lib/media-url";
import { KIND_ICON } from "./library-card";
import { LibraryReader } from "./library-reader";

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

// Trang một tài liệu: thông tin, nguồn và giấy phép, nút đọc/nghe/xem (cần đăng nhập), tải về nếu tài liệu cho phép.
export function LibraryItemView({ item }: { item: LibraryItemDto }) {
  const facts: [string, string | null][] = [
    ["Loại", LIBRARY_KIND_NAMES[item.kind]],
    ["Danh mục", item.categoryName],
    ["Tác giả", item.author],
    ["Nhà xuất bản", [item.publisher, item.publishYear].filter(Boolean).join(", ") || null],
    ["Môn học", item.subjectName],
    ["Khối", item.gradeLevel ? `Khối ${item.gradeLevel}` : null],
    ["Dành cho", item.audienceLabel],
    ["Nguồn", LIBRARY_SOURCE_NAMES[item.source]],
    ["Giấy phép, xuất xứ", item.license],
    ["Dung lượng", item.fileSize ? sizeText(item.fileSize) : null],
    ["Ngày đăng", item.publishedAt ? formatDate(item.publishedAt) : null],
    ["Lượt đọc", String(item.viewCount)],
  ];
  return (
    <article className="space-y-6">
      <p className="text-sm">
        <Link href="/thu-vien" className="underline">
          Thư viện số
        </Link>{" "}
        ›{" "}
        <Link href={`/thu-vien?category=${item.categorySlug}`} className="underline">
          {item.categoryName}
        </Link>
      </p>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaSrc(item.coverUrl)} alt={`Bìa: ${item.title}`} className="mx-auto w-32 rounded border border-black/10 sm:w-48 md:w-full dark:border-white/15" />
        ) : (
          <div className="mx-auto flex aspect-[3/4] w-32 items-center justify-center rounded bg-brand/10 text-5xl sm:w-48 sm:text-6xl md:w-full" aria-hidden>
            {KIND_ICON[item.kind]}
          </div>
        )}
        <div className="min-w-0 space-y-4">
          <h1 className="text-2xl font-bold leading-tight">{item.title}</h1>
          {item.description && <p className="whitespace-pre-line opacity-90">{item.description}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {facts
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="opacity-70">{label}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>
      <LibraryReader item={item} />
    </article>
  );
}
