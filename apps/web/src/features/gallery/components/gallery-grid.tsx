import Link from "next/link";
import { mediaSrc } from "@/shared/lib/media-url";
import { getGallery } from "../api/get-gallery";

// F06 – thư viện ảnh: ảnh của các bài đã đăng, bấm vào để mở bài. Đọc dữ liệu có cache nên đặt trong <Suspense>.
export async function GalleryGrid() {
  const items = await getGallery();

  if (items === null) {
    return <p className="text-sm opacity-70">Không tải được thư viện ảnh lúc này, vui lòng thử lại sau.</p>;
  }
  if (items.length === 0) return <p className="text-sm opacity-70">Chưa có ảnh nào trong thư viện.</p>;

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <li key={item.url}>
          <Link
            href={`/tin-tuc/${item.postSlug}`}
            className="group block overflow-hidden rounded-lg border border-black/10 dark:border-white/15"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaSrc(item.url)}
              alt={`Ảnh trong bài: ${item.postTitle}`}
              loading="lazy"
              className="aspect-square w-full object-cover transition group-hover:scale-105"
            />
            <span className="block truncate px-2 py-1 text-xs opacity-80">{item.postTitle}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
